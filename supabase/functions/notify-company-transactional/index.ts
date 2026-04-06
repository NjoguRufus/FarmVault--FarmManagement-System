// Company transactional mail (Resend + email_logs). Senders: hello@ (trial), billing@ (payment / manual pending / payment_received).
//
// Auth:
//   - pro_trial_started | manual_payment_submitted: Clerk JWT + company admin (member of company_id).
//   - payment_received: service role JWT, OR Clerk JWT + is_developer(), OR Clerk JWT + company admin.
//
// Body payment_received: { company_id, kind: "payment_received", subscription_payment_id: uuid }
//
// Deploy: npx supabase functions deploy notify-company-transactional --no-verify-jwt

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeCompanyIdForUuid } from "../_shared/companyBillingContactEmail.ts";
import { getCompanyEmailAndName } from "../_shared/companyEmailPipeline.ts";
import { buildManualPaymentAwaitingApprovalEmail } from "../_shared/farmvault-email/manualPaymentAwaitingApprovalTemplate.ts";
import { buildPaymentReceivedEmail } from "../_shared/farmvault-email/paymentReceivedTemplate.ts";
import { buildProTrialStartedEmail } from "../_shared/farmvault-email/proTrialStartedTemplate.ts";
import { getFarmVaultEmailFromForEmailType } from "../_shared/farmvaultEmailFrom.ts";
import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";

const EMAIL_TYPE_TRIAL = "company_pro_trial_started";
const EMAIL_TYPE_MANUAL_PENDING = "company_manual_payment_awaiting_approval";
const EMAIL_TYPE_PAYMENT_RECEIVED = "company_payment_received";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function clerkSubFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1])) as { sub?: string };
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

function sameCompanyId(a: string, b: string): boolean {
  return normalizeCompanyIdForUuid(a) === normalizeCompanyIdForUuid(b);
}

async function assertCompanyAdmin(
  admin: SupabaseClient,
  companyId: string,
  clerkUserId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .schema("core")
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("clerk_user_id", clerkUserId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return false;
  const raw = String((data as { role?: string }).role ?? "").toLowerCase().trim();
  const compact = raw.replace(/[\s_-]+/g, "");
  return compact === "companyadmin" || raw === "owner" || raw === "admin" || compact === "admin";
}

async function authorizePaymentReceived(
  supabaseUrl: string,
  anon: string,
  serviceKey: string,
  bearer: string,
  admin: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  if (bearer === serviceKey) return true;

  const sub = clerkSubFromJwt(bearer);
  if (!sub) return false;

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: isDev, error: de } = await userClient.rpc("is_developer");
  if (!de && isDev === true) return true;

  return assertCompanyAdmin(admin, companyId, sub);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!supabaseUrl || !serviceKey || !resendKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const bearer = bearerFromRequest(req);
  if (!bearer) {
    return jsonResponse({ error: "Unauthorized", detail: "Bearer token required" }, 401);
  }

  const isServiceRole = bearer === serviceKey;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const body = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body) return jsonResponse({ error: "Invalid payload" }, 400);

  const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  if (!companyId || !UUID_RE.test(companyId)) {
    return jsonResponse({ error: "company_id must be a valid UUID" }, 400);
  }

  const allowedKinds = ["pro_trial_started", "manual_payment_submitted", "payment_received"] as const;
  if (!allowedKinds.includes(kind as (typeof allowedKinds)[number])) {
    return jsonResponse({ error: "Unsupported kind" }, 400);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const logAdmin = getServiceRoleClientForEmailLogs();
  const appUrl = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");

  if (kind === "payment_received") {
    if (!anon) {
      return jsonResponse({ error: "Server misconfiguration", detail: "SUPABASE_ANON_KEY required" }, 500);
    }
    const okPay = await authorizePaymentReceived(supabaseUrl, anon, serviceKey, bearer, admin, companyId);
    if (!okPay) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const subPayId = typeof body.subscription_payment_id === "string" ? body.subscription_payment_id.trim() : "";
    if (!subPayId || !UUID_RE.test(subPayId)) {
      return jsonResponse({ error: "subscription_payment_id must be a valid UUID" }, 400);
    }

    const { data: pay, error: payErr } = await admin
      .from("subscription_payments")
      .select("company_id,amount,plan_id,billing_cycle,transaction_code,currency,status")
      .eq("id", subPayId)
      .maybeSingle();
    if (payErr || !pay) {
      return jsonResponse({ error: "Payment not found" }, 404);
    }
    const payRow = pay as Record<string, unknown>;
    const payCid = String(payRow.company_id ?? "").trim();
    if (!payCid || !sameCompanyId(payCid, companyId)) {
      return jsonResponse({ error: "Forbidden", detail: "Payment does not belong to company_id" }, 403);
    }
    const st = String(payRow.status ?? "").toLowerCase();
    if (st !== "approved") {
      return jsonResponse({ error: "Precondition failed", detail: "Payment is not approved" }, 412);
    }

    let to: string;
    let companyName: string;
    try {
      const r = await getCompanyEmailAndName(admin, companyId);
      to = r.email;
      companyName = r.name;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: "No company email", detail: msg }, 400);
    }

    const amountNum = Number(payRow.amount ?? 0);
    const currency = String(payRow.currency ?? "KES").toUpperCase();
    const amountLabel = `${currency} ${Number.isFinite(amountNum) ? amountNum.toLocaleString("en-KE") : String(payRow.amount ?? "—")}`;
    const receipt = String(payRow.transaction_code ?? "").trim() || "—";

    const dedupeKey = `payment_received:${subPayId}`;
    const { data: prior } = await admin
      .from("email_logs")
      .select("id")
      .eq("email_type", EMAIL_TYPE_PAYMENT_RECEIVED)
      .eq("status", "sent")
      .contains("metadata", { dedupe_key: dedupeKey })
      .limit(1)
      .maybeSingle();
    if ((prior as { id?: string } | null)?.id) {
      return jsonResponse({ ok: true, skipped: true, reason: "already_sent" });
    }

    const built = buildPaymentReceivedEmail({
      companyName,
      amountLabel,
      plan: String(payRow.plan_id ?? "basic"),
      receipt,
      billingCycle: String(payRow.billing_cycle ?? "monthly"),
      billingUrl: `${appUrl}/billing`,
      dashboardUrl: `${appUrl}/dashboard`,
    });

    const from = getFarmVaultEmailFromForEmailType(EMAIL_TYPE_PAYMENT_RECEIVED);
    console.log("Sending email to:", to);

    const send = await sendResendWithEmailLog({
      admin: logAdmin,
      resendKey,
      from,
      to,
      subject: built.subject,
      html: built.html,
      email_type: EMAIL_TYPE_PAYMENT_RECEIVED,
      company_id: companyId,
      company_name: companyName,
      metadata: {
        dedupe_key: dedupeKey,
        kind: "payment_received",
        source: "notify-company-transactional",
        subscription_payment_id: subPayId,
      },
    });
    if (!send.ok) return jsonResponse({ error: send.error }, 500);
    return jsonResponse({ ok: true, id: send.resendId });
  }

  // Tenant-only kinds: never service role
  if (isServiceRole) {
    return jsonResponse({ error: "Forbidden", detail: "Service role not allowed for this kind" }, 403);
  }

  const sub = clerkSubFromJwt(bearer);
  if (!sub) return jsonResponse({ error: "Unauthorized", detail: "Bearer JWT required" }, 401);

  const okAdmin = await assertCompanyAdmin(admin, companyId, sub);
  if (!okAdmin) return jsonResponse({ error: "Forbidden" }, 403);

  let to: string;
  let companyName: string;
  try {
    const r = await getCompanyEmailAndName(admin, companyId);
    to = r.email;
    companyName = r.name;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: "No company email", detail: msg }, 400);
  }

  console.log("Sending email to:", to);

  if (kind === "manual_payment_submitted") {
    const paymentId = typeof body.payment_id === "string" ? body.payment_id.trim() : "";
    const dedupeKey = paymentId ? `manual_payment_submitted:${paymentId}` : `manual_payment_submitted:${companyId}`;
    const { data: prior } = await admin
      .from("email_logs")
      .select("id")
      .eq("email_type", EMAIL_TYPE_MANUAL_PENDING)
      .eq("status", "sent")
      .contains("metadata", { dedupe_key: dedupeKey })
      .limit(1)
      .maybeSingle();
    if ((prior as { id?: string } | null)?.id) {
      return jsonResponse({ ok: true, skipped: true, reason: "already_sent" });
    }

    const built = buildManualPaymentAwaitingApprovalEmail({
      companyName,
      billingUrl: `${appUrl}/billing`,
    });
    const from = getFarmVaultEmailFromForEmailType(EMAIL_TYPE_MANUAL_PENDING);
    const send = await sendResendWithEmailLog({
      admin: logAdmin,
      resendKey,
      from,
      to,
      subject: built.subject,
      html: built.html,
      email_type: EMAIL_TYPE_MANUAL_PENDING,
      company_id: companyId,
      company_name: companyName,
      metadata: {
        dedupe_key: dedupeKey,
        kind: "manual_payment_submitted",
        source: "notify-company-transactional",
        payment_id: paymentId || null,
      },
    });
    if (!send.ok) return jsonResponse({ error: send.error }, 500);
    return jsonResponse({ ok: true, id: send.resendId });
  }

  // pro_trial_started
  const { data: comp, error: ce } = await admin
    .schema("core")
    .from("companies")
    .select("onboarding_completed")
    .eq("id", companyId)
    .maybeSingle();
  if (ce || !comp) return jsonResponse({ error: "Company not found" }, 404);

  if ((comp as { onboarding_completed?: boolean }).onboarding_completed !== true) {
    return jsonResponse({ error: "Precondition failed", detail: "Onboarding not complete" }, 412);
  }

  const { data: subRow } = await admin
    .from("company_subscriptions")
    .select("trial_ends_at,is_trial,status")
    .eq("company_id", companyId)
    .maybeSingle();
  const s = subRow as { trial_ends_at?: string | null; is_trial?: boolean | null; status?: string | null } | null;
  const trialEnds = s?.trial_ends_at != null && String(s.trial_ends_at).trim() !== ""
    ? new Date(String(s.trial_ends_at)).toISOString()
    : "—";
  const isTrialish = s?.is_trial === true || String(s?.status ?? "").toLowerCase().includes("trial");
  if (!isTrialish) {
    return jsonResponse({ error: "Precondition failed", detail: "Company is not on a Pro trial" }, 412);
  }

  const dedupeKey = `pro_trial_started:${companyId}`;
  const { data: priorTrial } = await admin
    .from("email_logs")
    .select("id")
    .eq("email_type", EMAIL_TYPE_TRIAL)
    .eq("status", "sent")
    .contains("metadata", { dedupe_key: dedupeKey })
    .limit(1)
    .maybeSingle();
  if ((priorTrial as { id?: string } | null)?.id) {
    return jsonResponse({ ok: true, skipped: true, reason: "already_sent" });
  }

  const built = buildProTrialStartedEmail({
    companyName,
    trialEndsAt: trialEnds,
    billingUrl: `${appUrl}/billing`,
  });
  const from = getFarmVaultEmailFromForEmailType(EMAIL_TYPE_TRIAL);
  const send = await sendResendWithEmailLog({
    admin: logAdmin,
    resendKey,
    from,
    to,
    subject: built.subject,
    html: built.html,
    email_type: EMAIL_TYPE_TRIAL,
    company_id: companyId,
    company_name: companyName,
    metadata: { dedupe_key: dedupeKey, kind: "pro_trial_started", source: "notify-company-transactional" },
  });
  if (!send.ok) return jsonResponse({ error: send.error }, 500);
  return jsonResponse({ ok: true, id: send.resendId });
});
