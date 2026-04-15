// Ambassador payout lifecycle notifications.
// Events:
//  - payout_requested  -> email developer
//  - payout_approved   -> email ambassador
//  - payout_paid       -> email ambassador + developer confirmation
//
// Auth: Authorization: Bearer <AMBASSADOR_PAYOUT_NOTIFY_SECRET>

import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { getFarmVaultEmailFrom } from "../_shared/farmvaultEmailFrom.ts";
import { getFarmvaultDeveloperInboxEmail } from "../_shared/farmvaultDeveloperInbox.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

type PayoutEvent = "payout_requested" | "payout_approved" | "payout_paid";

const EMAIL_TYPE_DEVELOPER_REQUEST = "developer_ambassador_payout_requested";
const EMAIL_TYPE_AMBASSADOR_APPROVED = "ambassador_payout_approved";
const EMAIL_TYPE_AMBASSADOR_PAID = "ambassador_payout_completed";
const EMAIL_TYPE_DEVELOPER_PAID_CONFIRM = "developer_ambassador_payout_sent_confirmation";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerFromRequest(req: Request): string {
  const auth = req.headers.get("Authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ") && auth.length > 7) return auth.slice(7).trim();
  return "";
}

function fmtKes(n: number): string {
  try {
    return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function fmtIso(v: string | null | undefined): string {
  if (!v) return "—";
  const t = Date.parse(v);
  if (Number.isNaN(t)) return v;
  return new Date(t).toISOString();
}

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

async function dedupeSent(
  admin: ReturnType<typeof createServiceRoleSupabaseClient>,
  emailType: string,
  dedupeKey: string,
): Promise<boolean> {
  const { data } = await admin
    .from("email_logs")
    .select("id")
    .eq("email_type", emailType)
    .eq("status", "sent")
    .contains("metadata", { dedupe_key: dedupeKey })
    .limit(1)
    .maybeSingle();
  return !!(data as { id?: string } | null)?.id;
}

serveFarmVaultEdge("notify-ambassador-payout-lifecycle", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("AMBASSADOR_PAYOUT_NOTIFY_SECRET")?.trim();
  const provided = bearerFromRequest(req);
  if (!expected || !provided || provided !== expected) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!supabaseUrl || !serviceKey || !resendKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const body = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body) return jsonResponse({ error: "Invalid payload" }, 400);

  const event = typeof body.event === "string" ? body.event.trim().toLowerCase() as PayoutEvent : ("" as PayoutEvent);
  const withdrawalId = typeof body.withdrawal_id === "string" ? body.withdrawal_id.trim() : "";
  if (!withdrawalId || !event || !["payout_requested", "payout_approved", "payout_paid"].includes(event)) {
    return jsonResponse({ error: "event and withdrawal_id are required" }, 400);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const logAdmin = getServiceRoleClientForEmailLogs();

  const { data: row, error: loadErr } = await admin
    .from("ambassador_withdrawals")
    .select("id, ambassador_id, amount, status, created_at, decided_at, ambassadors(name, email)")
    .eq("id", withdrawalId)
    .maybeSingle();
  if (loadErr || !row) return jsonResponse({ error: "Withdrawal not found" }, 404);

  const rec = row as Record<string, unknown>;
  const amount = Number(rec.amount ?? 0);
  const createdAt = String(rec.created_at ?? "");
  const ambassadorRel = rec.ambassadors as Record<string, unknown> | null;
  const ambassadorName = String(ambassadorRel?.name ?? "Ambassador");
  const ambassadorEmail = typeof ambassadorRel?.email === "string" ? ambassadorRel.email.trim() : "";
  const developerEmail = getFarmvaultDeveloperInboxEmail();
  const companyName = "FarmVault";

  const fromDeveloper = getFarmVaultEmailFrom("developer");
  const fromBilling = getFarmVaultEmailFrom("billing");

  if (event === "payout_requested") {
    const dedupeKey = `payout_requested:${withdrawalId}`;
    if (await dedupeSent(admin, EMAIL_TYPE_DEVELOPER_REQUEST, dedupeKey)) {
      return jsonResponse({ ok: true, skipped: true, reason: "deduped" });
    }
    const subject = "New Ambassador Payout Request";
    const html = [
      "<p>A new ambassador payout request was submitted.</p>",
      `<p><strong>Ambassador:</strong> ${ambassadorName}</p>`,
      `<p><strong>Amount:</strong> ${fmtKes(amount)}</p>`,
      `<p><strong>Date:</strong> ${fmtIso(createdAt)}</p>`,
    ].join("");
    const send = await sendResendWithEmailLog({
      admin: logAdmin,
      resendKey,
      from: fromDeveloper,
      to: developerEmail,
      subject,
      html,
      email_type: EMAIL_TYPE_DEVELOPER_REQUEST,
      company_name: companyName,
      metadata: { dedupe_key: dedupeKey, withdrawal_id: withdrawalId, event, source: "notify-ambassador-payout-lifecycle" },
    });
    if (!send.ok) return jsonResponse({ error: send.error }, 500);
    return jsonResponse({ ok: true });
  }

  if (event === "payout_approved") {
    if (!isValidEmail(ambassadorEmail)) return jsonResponse({ ok: true, skipped: true, reason: "missing_ambassador_email" });
    const dedupeKey = `payout_approved:${withdrawalId}`;
    if (await dedupeSent(admin, EMAIL_TYPE_AMBASSADOR_APPROVED, dedupeKey)) {
      return jsonResponse({ ok: true, skipped: true, reason: "deduped" });
    }
    const subject = "Payout Approved";
    const html = "<p>Your payout request has been approved. Please wait as we process your payment.</p>";
    const send = await sendResendWithEmailLog({
      admin: logAdmin,
      resendKey,
      from: fromBilling,
      to: ambassadorEmail,
      subject,
      html,
      email_type: EMAIL_TYPE_AMBASSADOR_APPROVED,
      company_name: companyName,
      metadata: { dedupe_key: dedupeKey, withdrawal_id: withdrawalId, event, source: "notify-ambassador-payout-lifecycle" },
    });
    if (!send.ok) return jsonResponse({ error: send.error }, 500);
    return jsonResponse({ ok: true });
  }

  // payout_paid
  const dedupeKeyAmb = `payout_paid_ambassador:${withdrawalId}`;
  const dedupeKeyDev = `payout_paid_developer:${withdrawalId}`;

  if (isValidEmail(ambassadorEmail) && !(await dedupeSent(admin, EMAIL_TYPE_AMBASSADOR_PAID, dedupeKeyAmb))) {
    const sendAmb = await sendResendWithEmailLog({
      admin: logAdmin,
      resendKey,
      from: fromBilling,
      to: ambassadorEmail,
      subject: "Payout Completed",
      html: "<p>You have successfully received your payout.</p>",
      email_type: EMAIL_TYPE_AMBASSADOR_PAID,
      company_name: companyName,
      metadata: { dedupe_key: dedupeKeyAmb, withdrawal_id: withdrawalId, event, source: "notify-ambassador-payout-lifecycle" },
    });
    if (!sendAmb.ok) return jsonResponse({ error: sendAmb.error }, 500);
  }

  if (!(await dedupeSent(admin, EMAIL_TYPE_DEVELOPER_PAID_CONFIRM, dedupeKeyDev))) {
    const sendDev = await sendResendWithEmailLog({
      admin: logAdmin,
      resendKey,
      from: fromDeveloper,
      to: developerEmail,
      subject: "Payout Sent Confirmation",
      html: "<p>You have successfully paid an ambassador.</p>",
      email_type: EMAIL_TYPE_DEVELOPER_PAID_CONFIRM,
      company_name: companyName,
      metadata: { dedupe_key: dedupeKeyDev, withdrawal_id: withdrawalId, event, source: "notify-ambassador-payout-lifecycle" },
    });
    if (!sendDev.ok) return jsonResponse({ error: sendDev.error }, 500);
  }

  return jsonResponse({ ok: true });
});
