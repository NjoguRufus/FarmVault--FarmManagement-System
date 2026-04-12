// Company transactional mail (Resend + email_logs). Senders: hello@ (trial), billing@ (payment / manual pending / payment_received).
//
// Auth:
//   - manual_payment_submitted: Clerk JWT + any company member (matches submit_manual_subscription_payment).
//   - pro_trial_started: Clerk JWT + company admin/owner.
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
import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { sendCompanyEmail } from "../_shared/sendCompanyEmail.ts";
import {
  executePaymentApprovedCompanyEmail,
  executeStkPaymentReceivedCompanyEmail,
} from "../_shared/subscriptionPaymentCompanyEmails.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

const EMAIL_TYPE_TRIAL = "company_pro_trial_started";
const EMAIL_TYPE_MANUAL_PENDING = "company_manual_payment_awaiting_approval";
const EMAIL_TYPE_PAYMENT_RECEIVED = "company_payment_received";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_RE_TO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function decodeJwtPayloadJson(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad === 2) base64 += "==";
    else if (pad === 3) base64 += "=";
    else if (pad === 1) return null;
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clerkSubFromJwt(token: string): string | null {
  const payload = decodeJwtPayloadJson(token);
  const sub = payload?.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

/** Clerk Supabase template often includes `email`; use when DB profiles / billing RPC have no address. */
function recipientEmailFromBearerJwt(token: string): string | null {
  const payload = decodeJwtPayloadJson(token);
  if (!payload) return null;
  const primary = payload.primary_email_address;
  const primaryEmail =
    primary && typeof primary === "object" && primary !== null && "email_address" in primary
      ? (primary as { email_address?: unknown }).email_address
      : undefined;
  const candidates: unknown[] = [payload.email, payload.user_email, primaryEmail];
  for (const c of candidates) {
    const e = typeof c === "string" ? c.trim() : "";
    if (e && EMAIL_RE_TO.test(e)) return e.toLowerCase();
  }
  return null;
}

function sameCompanyId(a: string, b: string): boolean {
  return normalizeCompanyIdForUuid(a) === normalizeCompanyIdForUuid(b);
}

async function companyDisplayName(admin: SupabaseClient, companyId: string): Promise<string> {
  const { data: c } = await admin.schema("core").from("companies").select("name").eq("id", companyId).maybeSingle();
  return String((c as { name?: string } | null)?.name ?? "").trim() || "Your workspace";
}

async function profileEmailByClerkId(
  admin: SupabaseClient,
  clerkId: string,
): Promise<{ email: string } | null> {
  const id = clerkId.trim();
  if (!id) return null;
  const { data: pub } = await admin.from("profiles").select("email").eq("clerk_user_id", id).maybeSingle();
  const em = pub?.email != null ? String(pub.email).trim() : "";
  if (em && EMAIL_RE_TO.test(em)) return { email: em.toLowerCase() };
  const { data: coreP } = await admin
    .schema("core")
    .from("profiles")
    .select("email")
    .eq("clerk_user_id", id)
    .maybeSingle();
  const em2 = coreP?.email != null ? String(coreP.email).trim() : "";
  if (em2 && EMAIL_RE_TO.test(em2)) return { email: em2.toLowerCase() };
  return null;
}

/**
 * Manual "awaiting approval" mail: prefer company pipeline, then company_billing_contact_email (all members),
 * then submitter profile, then JWT `email` — so the payer still gets confirmation when DB rows are incomplete.
 */
async function resolveRecipientForManualPending(
  admin: SupabaseClient,
  companyId: string,
  submitterClerkId: string,
  bearerJwt: string,
): Promise<{ to: string; companyName: string } | null> {
  const workspaceName = await companyDisplayName(admin, companyId);

  try {
    const r = await getCompanyEmailAndName(admin, companyId);
    return { to: r.email, companyName: r.name };
  } catch {
    /* fall through */
  }

  const { data: rpcEmail, error: rpcErr } = await admin.rpc("company_billing_contact_email", {
    p_company_id: companyId,
  });
  const rpcStr = typeof rpcEmail === "string" ? rpcEmail.trim() : "";
  if (!rpcErr && rpcStr && EMAIL_RE_TO.test(rpcStr)) {
    return { to: rpcStr.toLowerCase(), companyName: workspaceName };
  }

  const sub = await profileEmailByClerkId(admin, submitterClerkId);
  if (sub?.email) {
    return { to: sub.email, companyName: workspaceName };
  }

  const jwtEmail = recipientEmailFromBearerJwt(bearerJwt);
  if (jwtEmail) {
    return { to: jwtEmail, companyName: workspaceName };
  }

  return null;
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

/** Same as submit_manual_subscription_payment: any workspace member may submit billing. */
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
  if (error || !data) return false;
  return String((data as { company_id?: string }).company_id ?? "").length > 0;
}

/**
 * Same membership checks as notify-developer-transactional manual_payment_submitted (core → public → RPC).
 * Handles sync gaps between core and public.company_members and JWT-based core.current_user_id().
 */
async function assertMayNotifyManualPaymentSubmitted(
  supabaseUrl: string,
  anon: string | undefined,
  admin: SupabaseClient,
  companyId: string,
  clerkUserId: string,
  bearer: string,
): Promise<boolean> {
  if (await assertCompanyMember(admin, companyId, clerkUserId)) return true;

  const { data: pubClerk, error: pubClerkErr } = await admin
    .from("company_members")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (!pubClerkErr && (pubClerk as { company_id?: string } | null)?.company_id) return true;

  const { data: pubUid, error: pubUidErr } = await admin
    .from("company_members")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("user_id", clerkUserId)
    .maybeSingle();
  if (!pubUidErr && (pubUid as { company_id?: string } | null)?.company_id) return true;

  const ak = anon?.trim();
  if (!ak) return false;

  const userClient = createClient(supabaseUrl, ak, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: rpcOk, error: rpcErr } = await userClient.rpc("is_company_member", {
    check_company_id: companyId,
  });
  if (!rpcErr && rpcOk === true) return true;

  return false;
}

/** Query admin.developers directly via service role — no JWT config dependency. */
async function checkIsDeveloperViaAdmin(
  admin: SupabaseClient,
  clerkSub: string,
): Promise<boolean> {
  try {
    const { data } = await admin
      .schema("admin")
      .from("developers")
      .select("clerk_user_id")
      .eq("clerk_user_id", clerkSub)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    return !!(data as { clerk_user_id?: string } | null)?.clerk_user_id;
  } catch {
    return false;
  }
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

  // Direct DB check via service role — no JWT config dependency (works even if Clerk-Supabase bridge is misconfigured)
  if (await checkIsDeveloperViaAdmin(admin, sub)) return true;

  // Fallback: userClient RPC (works when JWT bridge is configured)
  const ak = anon?.trim();
  if (ak) {
    const userClient = createClient(supabaseUrl, ak, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: isDev, error: de } = await userClient.rpc("is_developer");
    if (!de && isDev === true) return true;
  }

  // Any workspace member (same bar as manual payment submit) may trigger billing confirmation emails
  // for their company — e.g. employee submits Till payment that auto-validates against STK ledger.
  if (await assertCompanyMember(admin, companyId, sub)) return true;

  return assertCompanyAdmin(admin, companyId, sub);
}

serveFarmVaultEdge("notify-company-transactional", async (req: Request, _ctx) => {
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

  const companyIdRaw = typeof body.company_id === "string" ? body.company_id.trim() : "";
  const companyId = normalizeCompanyIdForUuid(companyIdRaw);
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  if (!companyId || !UUID_RE.test(companyId)) {
    return jsonResponse({ error: "company_id must be a valid UUID" }, 400);
  }

  const allowedKinds = [
    "pro_trial_started",
    "manual_payment_submitted",
    "payment_received",
    "stk_payment_received",
    "payment_approved",
  ] as const;
  if (!allowedKinds.includes(kind as (typeof allowedKinds)[number])) {
    return jsonResponse({ error: "Unsupported kind" }, 400);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const logAdmin = getServiceRoleClientForEmailLogs();
  const appUrl = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");

  if (kind === "payment_received") {
    const okPay = await authorizePaymentReceived(supabaseUrl, anon ?? "", serviceKey, bearer, admin, companyId);
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
    } catch {
      // Fallback: company_billing_contact_email RPC (covers all member emails)
      const { data: rpcEmail } = await admin.rpc("company_billing_contact_email", { p_company_id: companyId });
      const rpcStr = typeof rpcEmail === "string" ? rpcEmail.trim() : "";
      if (rpcStr && EMAIL_RE_TO.test(rpcStr)) {
        to = rpcStr.toLowerCase();
        companyName = await companyDisplayName(admin, companyId);
      } else {
        return jsonResponse({ error: "No company email", detail: "No billing contact email found for this company" }, 400);
      }
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

    console.log("Sending email to:", to);

    const send = await sendCompanyEmail({
      to,
      subject: built.subject,
      html: built.html,
      type: "billing",
      admin: logAdmin,
      resendKey,
      companyId,
      companyName,
      email_type: EMAIL_TYPE_PAYMENT_RECEIVED,
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

  // ── stk_payment_received ────────────────────────────────────────────────
  // Service role only — legacy HTTP entry (mpesa-stk-callback now sends in-process).
  // Payload: { company_id, amount, mpesa_receipt, phone, checkout_request_id?, subscription_payment_id? }
  if (kind === "stk_payment_received") {
    if (!isServiceRole) {
      return jsonResponse({ error: "Forbidden", detail: "Service role required for stk_payment_received" }, 403);
    }

    const amountRaw = typeof body.amount === "string" ? body.amount.trim() : String(body.amount ?? "").trim();
    const mpesaReceipt = typeof body.mpesa_receipt === "string" ? body.mpesa_receipt.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const checkoutRequestId = typeof body.checkout_request_id === "string" ? body.checkout_request_id.trim() : "";
    const subPayLinkRaw =
      typeof body.subscription_payment_id === "string" ? body.subscription_payment_id.trim() : "";

    const stkResult = await executeStkPaymentReceivedCompanyEmail({
      admin,
      logAdmin,
      resendKey,
      appUrl,
      companyId,
      amountRaw,
      mpesaReceipt,
      phone,
      checkoutRequestId,
      subscriptionPaymentId: subPayLinkRaw && UUID_RE.test(subPayLinkRaw) ? subPayLinkRaw : null,
    });
    if (!stkResult.ok) {
      return jsonResponse({ error: stkResult.error }, stkResult.status);
    }
    if ("skipped" in stkResult && stkResult.skipped) {
      return jsonResponse({ ok: true, skipped: true, reason: stkResult.reason });
    }
    return jsonResponse({ ok: true, id: stkResult.resendId });
  }

  // ── payment_approved ────────────────────────────────────────────────────
  // Service role or developer — called after developer approves payment (manual or STK).
  // Payload: { company_id, subscription_payment_id }
  if (kind === "payment_approved") {
    const okApprove = await authorizePaymentReceived(supabaseUrl, anon ?? "", serviceKey, bearer, admin, companyId);
    if (!okApprove) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const subPayId = typeof body.subscription_payment_id === "string" ? body.subscription_payment_id.trim() : "";
    if (!subPayId || !UUID_RE.test(subPayId)) {
      return jsonResponse({ error: "subscription_payment_id must be a valid UUID" }, 400);
    }

    const appr = await executePaymentApprovedCompanyEmail({
      admin,
      logAdmin,
      resendKey,
      appUrl,
      companyId,
      subscriptionPaymentId: subPayId,
    });
    if (!appr.ok) {
      return jsonResponse({ error: appr.error, detail: appr.error }, appr.status);
    }
    if ("skipped" in appr && appr.skipped) {
      return jsonResponse({ ok: true, skipped: true, reason: appr.reason });
    }
    return jsonResponse({ ok: true, id: appr.resendId });
  }

  // Tenant-only kinds: never service role
  if (isServiceRole) {
    return jsonResponse({ error: "Forbidden", detail: "Service role not allowed for this kind" }, 403);
  }

  const sub = clerkSubFromJwt(bearer);
  if (!sub) return jsonResponse({ error: "Unauthorized", detail: "Bearer JWT required" }, 401);

  let verifiedManualPaymentId = "";

  if (kind === "manual_payment_submitted") {
    verifiedManualPaymentId = typeof body.payment_id === "string" ? body.payment_id.trim() : "";
    if (!verifiedManualPaymentId || !UUID_RE.test(verifiedManualPaymentId)) {
      return jsonResponse({ error: "payment_id must be a valid UUID" }, 400);
    }
    const { data: payAuth, error: payAuthErr } = await admin
      .from("subscription_payments")
      .select("company_id")
      .eq("id", verifiedManualPaymentId)
      .maybeSingle();
    if (payAuthErr || !payAuth) {
      return jsonResponse({ error: "Payment not found" }, 404);
    }
    const payCid = String((payAuth as { company_id?: string }).company_id ?? "").trim();
    if (!payCid || !sameCompanyId(payCid, companyId)) {
      return jsonResponse({ error: "Forbidden", detail: "Payment does not match company_id" }, 403);
    }

    const okMember = await assertMayNotifyManualPaymentSubmitted(
      supabaseUrl,
      anon,
      admin,
      companyId,
      sub,
      bearer,
    );
    if (!okMember) {
      return jsonResponse({ error: "Forbidden", detail: "Not a member of this workspace" }, 403);
    }
  } else {
    const okAdmin = await assertCompanyAdmin(admin, companyId, sub);
    if (!okAdmin) return jsonResponse({ error: "Forbidden" }, 403);
  }

  let to: string;
  let companyName: string;
  if (kind === "manual_payment_submitted") {
    const resolved = await resolveRecipientForManualPending(admin, companyId, sub, bearer);
    if (!resolved) {
      return jsonResponse({
        error: "No company email",
        detail:
          "No billing contact email — set workspace email on the company, sync member profile email in Supabase, or add an email claim to the Clerk Supabase JWT template.",
      }, 400);
    }
    to = resolved.to;
    companyName = resolved.companyName;
  } else {
    try {
      const r = await getCompanyEmailAndName(admin, companyId);
      to = r.email;
      companyName = r.name;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: "No company email", detail: msg }, 400);
    }
  }

  console.log("Sending email to:", to);

  if (kind === "manual_payment_submitted") {
    const paymentId = verifiedManualPaymentId;
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
    const send = await sendCompanyEmail({
      to,
      subject: built.subject,
      html: built.html,
      type: "billing",
      admin: logAdmin,
      resendKey,
      companyId,
      companyName,
      email_type: EMAIL_TYPE_MANUAL_PENDING,
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
  const send = await sendCompanyEmail({
    to,
    subject: built.subject,
    html: built.html,
    type: "onboarding",
    admin: logAdmin,
    resendKey,
    companyId,
    companyName,
    email_type: EMAIL_TYPE_TRIAL,
    metadata: { dedupe_key: dedupeKey, kind: "pro_trial_started", source: "notify-company-transactional" },
  });
  if (!send.ok) return jsonResponse({ error: send.error }, 500);
  return jsonResponse({ ok: true, id: send.resendId });
});
