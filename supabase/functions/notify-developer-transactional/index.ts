// Developer inbox alerts (Resend + email_logs). Auth: service role OR Clerk JWT (role-checked per event).
//
// Events:
//   manual_payment_submitted — body: { event, payment_id } — tenant (company member)
//   stk_payment_received     — body: { event, checkout_request_id } — service role only
//   payment_approved         — body: { event, payment_id } — developer
//   subscription_activated   — body: { event, source: "mpesa_stk"|"manual_approval", checkout_request_id? | payment_id? } — service role or developer
//
// Deploy: npx supabase functions deploy notify-developer-transactional --no-verify-jwt

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFarmvaultDeveloperInboxEmail } from "../_shared/farmvaultDeveloperInbox.ts";
import {
  buildDeveloperManualPaymentSubmittedEmail,
  buildDeveloperPaymentApprovedEmail,
  buildDeveloperStkPaymentReceivedEmail,
  buildDeveloperSubscriptionActivatedEmail,
} from "../_shared/farmvault-email/developerTransactionalTemplates.ts";
import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";

const DEFAULT_FROM = "FarmVault <noreply@farmvault.africa>";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TYPE_MANUAL_SUBMITTED = "developer_manual_payment_submitted";
const TYPE_STK_RECEIVED = "developer_stk_payment_received";
const TYPE_PAYMENT_APPROVED = "developer_payment_approved";
const TYPE_SUB_ACTIVATED = "developer_subscription_activated";

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

async function dedupeSent(admin: SupabaseClient, emailType: string, dedupeKey: string): Promise<boolean> {
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

async function assertCompanyMember(
  admin: SupabaseClient,
  companyId: string,
  clerkUserId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .schema("core")
    .from("company_members")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("clerk_user_id", clerkUserId)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!(data as { company_id?: string } | null)?.company_id;
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 }).format(n);
  } catch {
    return String(n);
  }
}

function fmtIso(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "—";
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) return String(v).trim();
  return new Date(t).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!supabaseUrl || !serviceKey || !anon || !resendKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const logAdmin = getServiceRoleClientForEmailLogs();
  const from = Deno.env.get("FARMVAULT_EMAIL_FROM")?.trim() || DEFAULT_FROM;
  const developerTo = getFarmvaultDeveloperInboxEmail();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const body = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body) return jsonResponse({ error: "Invalid payload" }, 400);

  const event = typeof body.event === "string" ? body.event.trim() : "";
  const bearer = bearerFromRequest(req);
  const isService = bearer === serviceKey;

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });

  try {
    if (event === "manual_payment_submitted") {
      if (isService) {
        return jsonResponse({ error: "Forbidden", detail: "Use Clerk session for this event" }, 403);
      }
      const sub = clerkSubFromJwt(bearer);
      if (!sub) return jsonResponse({ error: "Unauthorized" }, 401);

      const paymentId = typeof body.payment_id === "string" ? body.payment_id.trim() : "";
      if (!paymentId) return jsonResponse({ error: "payment_id required" }, 400);

      const { data: pay, error: pe } = await admin.from("subscription_payments").select("*").eq("id", paymentId).maybeSingle();
      if (pe || !pay) return jsonResponse({ error: "Payment not found" }, 404);

      const p = pay as Record<string, unknown>;
      const companyUuid = String(p.company_id ?? "").trim();
      if (!UUID_RE.test(companyUuid)) {
        return jsonResponse({ error: "Invalid company on payment" }, 400);
      }

      const okMember = await assertCompanyMember(admin, companyUuid, sub);
      if (!okMember) return jsonResponse({ error: "Forbidden" }, 403);

      const dedupeKey = `manual_submitted:${paymentId}`;
      if (await dedupeSent(admin, TYPE_MANUAL_SUBMITTED, dedupeKey)) {
        return jsonResponse({ ok: true, skipped: true, reason: "deduped" });
      }

      const { data: comp } = await admin.schema("core").from("companies").select("name").eq("id", companyUuid).maybeSingle();
      const companyName = String((comp as { name?: string } | null)?.name ?? "Workspace");

      const built = buildDeveloperManualPaymentSubmittedEmail({
        companyName,
        companyId: companyUuid,
        paymentId,
        plan: String(p.plan_id ?? "—"),
        amount: fmtMoney(Number(p.amount ?? 0), String(p.currency ?? "KES")),
        currency: String(p.currency ?? "KES"),
        billingCycle: String(p.billing_cycle ?? "—"),
        mpesaName: String(p.mpesa_name ?? "—"),
        mpesaPhone: String(p.mpesa_phone ?? "—"),
        transactionCode: String(p.transaction_code ?? "—"),
        submittedAt: fmtIso(String(p.submitted_at ?? p.created_at ?? "")),
      });

      const send = await sendResendWithEmailLog({
        admin: logAdmin,
        resendKey,
        from,
        to: developerTo,
        subject: built.subject,
        html: built.html,
        email_type: TYPE_MANUAL_SUBMITTED,
        company_id: companyUuid,
        company_name: companyName,
        metadata: { dedupe_key: dedupeKey, payment_id: paymentId, source: "notify-developer-transactional" },
      });
      if (!send.ok) return jsonResponse({ error: send.error }, 500);
      return jsonResponse({ ok: true, id: send.resendId });
    }

    if (event === "stk_payment_received") {
      if (!isService) return jsonResponse({ error: "Forbidden" }, 403);
      const checkoutRequestId = typeof body.checkout_request_id === "string" ? body.checkout_request_id.trim() : "";
      if (!checkoutRequestId) return jsonResponse({ error: "checkout_request_id required" }, 400);

      const dedupeKey = `stk_received:${checkoutRequestId}`;
      if (await dedupeSent(admin, TYPE_STK_RECEIVED, dedupeKey)) {
        return jsonResponse({ ok: true, skipped: true, reason: "deduped" });
      }

      const { data: mp, error: me } = await admin.from("mpesa_payments").select("*").eq("checkout_request_id", checkoutRequestId).maybeSingle();
      if (me || !mp) return jsonResponse({ error: "mpesa_payments row not found" }, 404);

      const m = mp as Record<string, unknown>;
      const companyId = String(m.company_id ?? "").trim();
      if (!companyId) return jsonResponse({ error: "Missing company_id on payment" }, 400);

      const { data: comp } = await admin.schema("core").from("companies").select("name").eq("id", companyId).maybeSingle();
      const companyName = String((comp as { name?: string } | null)?.name ?? "Workspace");
      const amt = m.amount != null ? fmtMoney(Number(m.amount), "KES") : "—";

      const built = buildDeveloperStkPaymentReceivedEmail({
        companyName,
        companyId,
        checkoutRequestId,
        mpesaReceipt: String(m.mpesa_receipt ?? "—"),
        amount: amt,
        phone: String(m.phone ?? "—"),
        plan: String(m.plan ?? "—"),
        billingCycle: String(m.billing_cycle ?? "—"),
      });

      const send = await sendResendWithEmailLog({
        admin: logAdmin,
        resendKey,
        from,
        to: developerTo,
        subject: built.subject,
        html: built.html,
        email_type: TYPE_STK_RECEIVED,
        company_id: companyId,
        company_name: companyName,
        metadata: { dedupe_key: dedupeKey, checkout_request_id: checkoutRequestId, source: "notify-developer-transactional" },
      });
      if (!send.ok) return jsonResponse({ error: send.error }, 500);
      return jsonResponse({ ok: true, id: send.resendId });
    }

    if (event === "payment_approved") {
      if (isService) return jsonResponse({ error: "Forbidden", detail: "Use developer session" }, 403);
      const { data: isDev, error: de } = await userClient.rpc("is_developer");
      if (de || isDev !== true) return jsonResponse({ error: "Forbidden" }, 403);

      const paymentId = typeof body.payment_id === "string" ? body.payment_id.trim() : "";
      if (!paymentId) return jsonResponse({ error: "payment_id required" }, 400);

      const dedupeKey = `payment_approved:${paymentId}`;
      if (await dedupeSent(admin, TYPE_PAYMENT_APPROVED, dedupeKey)) {
        return jsonResponse({ ok: true, skipped: true, reason: "deduped" });
      }

      const { data: pay, error: pe } = await admin.from("subscription_payments").select("*").eq("id", paymentId).maybeSingle();
      if (pe || !pay) return jsonResponse({ error: "Payment not found" }, 404);

      const p = pay as Record<string, unknown>;
      const st = String(p.status ?? "").toLowerCase();
      if (st !== "approved") return jsonResponse({ error: "Payment is not approved" }, 400);

      const companyUuid = String(p.company_id ?? "").trim();
      if (!UUID_RE.test(companyUuid)) {
        return jsonResponse({ error: "Invalid company on payment" }, 400);
      }
      const { data: comp } = await admin.schema("core").from("companies").select("name").eq("id", companyUuid).maybeSingle();
      const companyName = String((comp as { name?: string } | null)?.name ?? "Workspace");

      const built = buildDeveloperPaymentApprovedEmail({
        companyName,
        companyId: companyUuid,
        paymentId,
        plan: String(p.plan_id ?? "—"),
        amount: fmtMoney(Number(p.amount ?? 0), String(p.currency ?? "KES")),
        currency: String(p.currency ?? "KES"),
        billingCycle: String(p.billing_cycle ?? "—"),
        transactionCode: String(p.transaction_code ?? "—"),
        approvedAt: fmtIso(String(p.approved_at ?? "")),
      });

      const send = await sendResendWithEmailLog({
        admin: logAdmin,
        resendKey,
        from,
        to: developerTo,
        subject: built.subject,
        html: built.html,
        email_type: TYPE_PAYMENT_APPROVED,
        company_id: companyUuid,
        company_name: companyName,
        metadata: { dedupe_key: dedupeKey, payment_id: paymentId, source: "notify-developer-transactional" },
      });
      if (!send.ok) return jsonResponse({ error: send.error }, 500);
      return jsonResponse({ ok: true, id: send.resendId });
    }

    if (event === "subscription_activated") {
      const source = typeof body.source === "string" ? body.source.trim() : "";
      if (source !== "mpesa_stk" && source !== "manual_approval") {
        return jsonResponse({ error: "source must be mpesa_stk or manual_approval" }, 400);
      }

      if (!isService) {
        const { data: isDev, error: de } = await userClient.rpc("is_developer");
        if (de || isDev !== true) return jsonResponse({ error: "Forbidden" }, 403);
      }

      let companyUuid = "";
      let paymentId: string | undefined;
      let plan = "";
      let billingCycle = "";
      let activeUntil = "";
      let companyName = "Workspace";

      if (source === "mpesa_stk") {
        const checkoutRequestId = typeof body.checkout_request_id === "string" ? body.checkout_request_id.trim() : "";
        if (!checkoutRequestId) return jsonResponse({ error: "checkout_request_id required" }, 400);
        const dedupeKey = `sub_act_stk:${checkoutRequestId}`;
        if (await dedupeSent(admin, TYPE_SUB_ACTIVATED, dedupeKey)) {
          return jsonResponse({ ok: true, skipped: true, reason: "deduped" });
        }

        const { data: mp } = await admin.from("mpesa_payments").select("*").eq("checkout_request_id", checkoutRequestId).maybeSingle();
        const m = mp as Record<string, unknown> | null;
        companyUuid = String(m?.company_id ?? "").trim();
        if (!companyUuid || !UUID_RE.test(companyUuid)) {
          return jsonResponse({ error: "Missing or invalid company" }, 400);
        }

        const { data: sub } = await admin.from("company_subscriptions").select("*").eq("company_id", companyUuid).maybeSingle();
        const s = sub as Record<string, unknown> | null;
        plan = String(s?.plan_id ?? s?.plan ?? "—");
        billingCycle = String(s?.billing_cycle ?? "—");
        activeUntil = fmtIso(String(s?.active_until ?? s?.current_period_end ?? ""));

        const { data: comp } = await admin.schema("core").from("companies").select("name").eq("id", companyUuid).maybeSingle();
        companyName = String((comp as { name?: string } | null)?.name ?? "Workspace");

        const { data: sp } = await admin.from("subscription_payments").select("id").eq("company_id", companyUuid).order("approved_at", { ascending: false }).limit(1).maybeSingle();
        paymentId = (sp as { id?: string } | null)?.id;

        const built = buildDeveloperSubscriptionActivatedEmail({
          companyName,
          companyId: companyUuid,
          source: "M-Pesa STK",
          paymentId,
          plan,
          billingCycle,
          activeUntil,
        });

        const send = await sendResendWithEmailLog({
          admin: logAdmin,
          resendKey,
          from,
          to: developerTo,
          subject: built.subject,
          html: built.html,
          email_type: TYPE_SUB_ACTIVATED,
          company_id: companyUuid,
          company_name: companyName,
          metadata: { dedupe_key: dedupeKey, checkout_request_id: checkoutRequestId, source: "notify-developer-transactional" },
        });
        if (!send.ok) return jsonResponse({ error: send.error }, 500);
        return jsonResponse({ ok: true, id: send.resendId });
      }

      // manual_approval
      const pid = typeof body.payment_id === "string" ? body.payment_id.trim() : "";
      if (!pid) return jsonResponse({ error: "payment_id required" }, 400);
      const dedupeKey = `sub_act_manual:${pid}`;
      if (await dedupeSent(admin, TYPE_SUB_ACTIVATED, dedupeKey)) {
        return jsonResponse({ ok: true, skipped: true, reason: "deduped" });
      }

      const { data: pay, error: pe } = await admin.from("subscription_payments").select("*").eq("id", pid).maybeSingle();
      if (pe || !pay) return jsonResponse({ error: "Payment not found" }, 404);
      const p = pay as Record<string, unknown>;
      companyUuid = String(p.company_id ?? "").trim();
      if (!UUID_RE.test(companyUuid)) {
        return jsonResponse({ error: "Invalid company on payment" }, 400);
      }
      plan = String(p.plan_id ?? "—");
      billingCycle = String(p.billing_cycle ?? "—");
      const { data: sub } = await admin.from("company_subscriptions").select("*").eq("company_id", companyUuid).maybeSingle();
      const s = sub as Record<string, unknown> | null;
      activeUntil = fmtIso(String(s?.active_until ?? s?.current_period_end ?? ""));

      const { data: comp } = await admin.schema("core").from("companies").select("name").eq("id", companyUuid).maybeSingle();
      companyName = String((comp as { name?: string } | null)?.name ?? "Workspace");

      const built = buildDeveloperSubscriptionActivatedEmail({
        companyName,
        companyId: companyUuid,
        source: "Manual approval",
        paymentId: pid,
        plan,
        billingCycle,
        activeUntil,
      });

      const send = await sendResendWithEmailLog({
        admin: logAdmin,
        resendKey,
        from,
        to: developerTo,
        subject: built.subject,
        html: built.html,
        email_type: TYPE_SUB_ACTIVATED,
        company_id: companyUuid,
        company_name: companyName,
        metadata: { dedupe_key: dedupeKey, payment_id: pid, source: "notify-developer-transactional" },
      });
      if (!send.ok) return jsonResponse({ error: send.error }, 500);
      return jsonResponse({ ok: true, id: send.resendId });
    }

    return jsonResponse({ error: "Unknown event" }, 400);
  } catch (e) {
    console.error("[notify-developer-transactional]", e);
    return jsonResponse({ error: "Internal error", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
