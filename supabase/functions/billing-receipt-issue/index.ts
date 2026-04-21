// Issue / regenerate / resend FarmVault billing receipts (PDF + optional Resend email).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//   RESEND_API_KEY (for email), BILLING_RECEIPT_ISSUE_SECRET (server-to-server, e.g. STK callback),
//   optional FARMVAULT_EMAIL_FROM_BILLING or FARMVAULT_BILLING_EMAIL_FROM,
//   optional FARMVAULT_RECEIPT_LOGO_URL, FARMVAULT_PUBLIC_APP_URL
//   optional FARMVAULT_PAYMENT_EMAIL_DIAGNOSTIC=1 — sends "FORCE PAYMENT TEST" to farmvaultke@gmail.com (verify Resend billing@)
//
// Auth:
//   - x-farmvault-receipt-secret: BILLING_RECEIPT_ISSUE_SECRET → issue/regenerate/resend/update (full)
//   - Authorization: Bearer <Clerk JWT> + is_developer() → issue, regenerate
//   - Authorization: Bearer <Clerk JWT> + can SELECT subscription_payments row (RLS) → issue
//   - Authorization: Bearer <Clerk JWT> + billing_receipt_tenant_can_access → resend_email only
//
// Deploy: npx supabase functions deploy billing-receipt-issue --no-verify-jwt

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildBillingReceiptPdf, type BillingReceiptPdfModel, type ReceiptLineItem } from "../_shared/billingReceiptPdf.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";
import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { getCompanyEmailAndName } from "../_shared/companyEmailPipeline.ts";
import { getFarmVaultEmailFromForEmailType } from "../_shared/farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { sendCompanyPaymentEmail } from "../_shared/companyTenantEmailOnboarding.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

async function tryGetCompanyInbox(
  admin: SupabaseClient,
  companyId: string,
): Promise<{ email: string; name: string } | null> {
  try {
    return await getCompanyEmailAndName(admin, companyId);
  } catch {
    return null;
  }
}

/** Set FARMVAULT_PAYMENT_EMAIL_DIAGNOSTIC=1 on the function to verify Resend from the payment path (billing@). */
async function maybeSendPaymentFlowDiagnosticTest(resendKey: string): Promise<void> {
  const on = Deno.env.get("FARMVAULT_PAYMENT_EMAIL_DIAGNOSTIC")?.trim() === "1";
  if (!on) return;
  try {
    const from = getFarmVaultEmailFromForEmailType("billing_receipt");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: ["farmvaultke@gmail.com"],
        subject: "FORCE PAYMENT TEST",
        html: "<p>Payment flow test</p>",
      }),
    });
    const t = await r.text().catch(() => "");
    if (!r.ok) {
      console.error("PAYMENT EMAIL ERROR (diagnostic test):", r.status, t.slice(0, 400));
    } else {
      console.log("FORCE PAYMENT TEST sent (diagnostic)");
    }
  } catch (e) {
    console.error("PAYMENT EMAIL ERROR (diagnostic test):", e);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmvault-receipt-secret",
};

/** Customer-facing receipt email subject (company billing contact). */
const RECEIPT_EMAIL_SUBJECT = "Payment Received — FarmVault";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** 2xx JSON body including `success` for clients that check it. */
function successResponse(body: Record<string, unknown>, status = 200): Response {
  return jsonResponse({ success: true, ...body }, status);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function planLabel(plan: string | null | undefined): string {
  const p = String(plan ?? "basic").toLowerCase();
  if (p.includes("pro")) return "PRO";
  return "BASIC";
}

function paymentModeLabel(method: string | null | undefined, billingMode: string | null | undefined): string {
  const m = String(method ?? "").toLowerCase();
  if (m === "mpesa_stk" || String(billingMode ?? "").toLowerCase() === "mpesa_stk") {
    return "M-Pesa (STK Push)";
  }
  return "M-Pesa (Manual)";
}

function billingPeriodLabel(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "—";
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  return `${a.toISOString().slice(0, 10)} to ${b.toISOString().slice(0, 10)}`;
}

function billingCycleDisplay(cycle: string | null | undefined): string {
  const c = String(cycle ?? "monthly").toLowerCase();
  if (c === "seasonal") return "Seasonal (3 months)";
  if (c === "annual") return "Annual";
  return "Monthly";
}

function escapeReceiptHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPaymentDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).trim();
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

function isLikelyEmail(s: string | null | undefined): boolean {
  const e = String(s ?? "").trim();
  return e.includes("@") && e.includes(".");
}

/** Customer payment receipt email (STK / billing-receipt-issue). Brand: primary #0F6D4D, accent #D4AF37, light #F8FAF9. */
function receiptEmailHtml(input: {
  name: string;
  companyName: string;
  receiptNumber: string;
  amount: string;
  plan: string;
  billingCycle: string;
  billingPeriod: string;
  mpesaReceipt: string;
  paymentDate: string;
  viewUrl: string;
  dashboardUrl: string;
  logoUrl: string;
  /** Subscription access end after payment (optional). */
  newExpiryLabel?: string | null;
}): string {
  const safeLogo = input.logoUrl.replace(/"/g, "&quot;");
  const safeView = input.viewUrl.replace(/"/g, "&quot;");
  const safeDash = input.dashboardUrl.replace(/"/g, "&quot;");
  const e = escapeReceiptHtml;
  const planUpper = e(input.plan.toUpperCase());
  const expiryRow =
    input.newExpiryLabel != null && String(input.newExpiryLabel).trim() !== ""
      ? `<tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">New access end date</td>
            <td style="padding:8px 0;font-weight:600;text-align:right;">${e(String(input.newExpiryLabel))}</td>
          </tr>`
      : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;">
<div style="font-family:Inter,system-ui,Arial,sans-serif;background:#F8FAF9;padding:40px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.05);">
    <div style="background:#0F6D4D;padding:24px;text-align:center;border-bottom:3px solid #D4AF37;">
      <img src="${safeLogo}" alt="FarmVault" width="160" height="48" style="height:48px;width:auto;max-width:200px;border:0;display:inline-block;"/>
      <h2 style="color:#ffffff;margin:8px 0 0 0;font-size:22px;line-height:1.25;">Payment Received</h2>
      <p style="color:#CFE9DF;margin:4px 0 0 0;font-size:14px;line-height:1.4;">Your FarmVault subscription is now active</p>
    </div>
    <div style="padding:28px;color:#18181b;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.5;">Hi ${e(input.name)},</p>
      <div style="background:#F8FAF9;border-radius:10px;padding:20px;">
        <table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">Company</td>
            <td style="padding:8px 0;font-weight:600;text-align:right;">${e(input.companyName)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">Receipt number</td>
            <td style="padding:8px 0;text-align:right;">${e(input.receiptNumber)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">Plan</td>
            <td style="padding:8px 0;font-weight:600;color:#0F6D4D;text-align:right;">${planUpper}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">Billing cycle</td>
            <td style="padding:8px 0;text-align:right;">${e(input.billingCycle)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">Billing period</td>
            <td style="padding:8px 0;text-align:right;">${e(input.billingPeriod)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">Amount paid</td>
            <td style="padding:8px 0;font-weight:700;font-size:18px;text-align:right;">${e(input.amount)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">M-Pesa receipt</td>
            <td style="padding:8px 0;text-align:right;">${e(input.mpesaReceipt)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666666;vertical-align:top;">Payment date</td>
            <td style="padding:8px 0;text-align:right;">${e(input.paymentDate)}</td>
          </tr>
          ${expiryRow}
        </table>
      </div>
      <div style="margin-top:20px;text-align:center;">
        <span style="background:#E8F5F0;color:#0F6D4D;padding:8px 16px;border-radius:999px;font-weight:600;font-size:14px;display:inline-block;">Subscription active</span>
      </div>
      <div style="margin-top:24px;text-align:center;">
        <a href="${safeDash}" style="background:#0F6D4D;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;font-size:14px;">Open FarmVault</a>
      </div>
      <p style="margin:20px 0 0;font-size:13px;color:#666666;line-height:1.5;text-align:center;">
        <a href="${safeView}" style="color:#0F6D4D;font-weight:600;">View receipt in app</a>
        — A PDF is attached; open it from your mail app to save or print.
      </p>
    </div>
    <div style="background:#F8FAF9;padding:16px;text-align:center;font-size:12px;color:#888888;line-height:1.5;">
      © FarmVault — Smart Farm Management Platform
    </div>
  </div>
</div>
</body></html>`;
}

type AuthCtx =
  | { ok: true; mode: "secret"; admin: SupabaseClient }
  | { ok: true; mode: "jwt_dev"; admin: SupabaseClient; userClient: SupabaseClient }
  | { ok: true; mode: "jwt_tenant"; admin: SupabaseClient; userClient: SupabaseClient }
  | { ok: false; status: number; body: Record<string, unknown> };

async function authorize(
  req: Request,
  admin: SupabaseClient,
  serviceRoleKey: string,
): Promise<AuthCtx> {
  const secret = Deno.env.get("BILLING_RECEIPT_ISSUE_SECRET")?.trim();
  const h = req.headers.get("x-farmvault-receipt-secret")?.trim();
  if (secret && h && secret === h) {
    return { ok: true, mode: "secret", admin };
  }

  const authHeader = req.headers.get("Authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ") || authHeader.length < 12) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }

  const bearer = authHeader.slice(7).trim();
  // Edge invoke from mpesa-stk-callback uses service role JWT — treat like trusted server.
  if (bearer === serviceRoleKey) {
    return { ok: true, mode: "secret", admin };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!supabaseUrl || !anon) {
    return { ok: false, status: 500, body: { error: "Server misconfiguration" } };
  }

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isDev, error: devErr } = await userClient.rpc("is_developer");
  if (!devErr && isDev === true) {
    return { ok: true, mode: "jwt_dev", admin, userClient };
  }

  return { ok: true, mode: "jwt_tenant", admin, userClient };
}

async function assertTenantReceiptAccess(userClient: SupabaseClient, receiptId: string): Promise<boolean> {
  const { data, error } = await userClient.rpc("billing_receipt_tenant_can_access", {
    _receipt_id: receiptId,
  });
  if (error) return false;
  return data === true;
}

/**
 * Tenant issue: same authorization as the Billing page — if RLS allows SELECT on this payment row
 * (current_company_id matches payment.company_id), allow receipt issuance. Avoids false negatives when
 * core.company_members is out of sync with profile active_company_id.
 */
async function tenantCanAccessSubscriptionPayment(
  userClient: SupabaseClient,
  subscriptionPaymentId: string,
): Promise<boolean> {
  const { data, error } = await userClient
    .from("subscription_payments")
    .select("id")
    .eq("id", subscriptionPaymentId)
    .maybeSingle();
  if (error) {
    console.warn("[billing-receipt-issue] tenant payment rls probe", error.message);
    return false;
  }
  return data != null && typeof (data as { id?: string }).id === "string";
}

type LoadedContext = {
  pay: Record<string, unknown>;
  companyId: string;
  companyName: string;
  companyCreatedAt: string | null;
  createdBy: string | null;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  periodStart: string | null;
  periodEnd: string | null;
  billingCycle: string | null;
};

function memberClerkId(row: { clerk_user_id?: string | null; user_id?: string | null }): string {
  return String(row.clerk_user_id ?? row.user_id ?? "").trim();
}

/** Same role check as fetchCompanyWorkspaceNotifyPayload (developerAdminService). */
function isAdminishMemberRole(role: string): boolean {
  const r = (role || "").toLowerCase().replace(/-/g, "_");
  return r === "company_admin" || r === "companyadmin" || r === "owner" || r === "admin";
}

/** Merge core + public profile fields so receipts show real contact data when only one schema is populated. */
async function loadProfileMap(
  admin: SupabaseClient,
  clerkIds: string[],
): Promise<Map<string, { email: string; full_name: string }>> {
  const out = new Map<string, { email: string; full_name: string }>();
  const ids = [...new Set(clerkIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return out;

  const apply = (clerkKey: string, email: string, fullName: string) => {
    const k = clerkKey.trim();
    if (!k) return;
    const cur = out.get(k) ?? { email: "", full_name: "" };
    out.set(k, {
      email: cur.email || email,
      full_name: cur.full_name || fullName,
    });
  };

  const { data: coreP } = await admin
    .schema("core")
    .from("profiles")
    .select("clerk_user_id,email,full_name")
    .in("clerk_user_id", ids);
  for (const p of coreP ?? []) {
    apply(String((p as { clerk_user_id?: string }).clerk_user_id ?? ""), String((p as { email?: string }).email ?? "").trim(), String((p as { full_name?: string }).full_name ?? "").trim());
  }

  const { data: pubByClerk } = await admin
    .from("profiles")
    .select("clerk_user_id,email,full_name,id")
    .in("clerk_user_id", ids);
  for (const p of pubByClerk ?? []) {
    const ck = String((p as { clerk_user_id?: string }).clerk_user_id ?? "").trim();
    if (ck) {
      apply(ck, String((p as { email?: string }).email ?? "").trim(), String((p as { full_name?: string }).full_name ?? "").trim());
    }
  }

  const { data: pubById } = await admin.from("profiles").select("clerk_user_id,email,full_name,id").in("id", ids);
  for (const p of pubById ?? []) {
    const idKey = String((p as { id?: string }).id ?? "").trim();
    if (idKey) {
      apply(idKey, String((p as { email?: string }).email ?? "").trim(), String((p as { full_name?: string }).full_name ?? "").trim());
    }
  }

  return out;
}

async function fetchApprovedSubscriptionPayment(
  admin: SupabaseClient,
  subscriptionPaymentId: string,
): Promise<Record<string, unknown> | null> {
  const { data: pay, error: payErr } = await admin
    .from("subscription_payments")
    .select("*")
    .eq("id", subscriptionPaymentId)
    .maybeSingle();
  if (payErr || !pay || typeof pay !== "object") {
    console.error("[billing-receipt-issue] payment load", payErr?.message);
    return null;
  }
  const st = String((pay as { status?: string }).status ?? "").toLowerCase();
  if (st !== "approved") {
    console.warn("[billing-receipt-issue] payment not approved", subscriptionPaymentId);
    return null;
  }
  return pay as Record<string, unknown>;
}

/** Prefer DB RPC (core+public coalesce); falls back to REST if RPC missing or errors. */
async function loadIssueContext(admin: SupabaseClient, subscriptionPaymentId: string): Promise<LoadedContext | null> {
  const pay = await fetchApprovedSubscriptionPayment(admin, subscriptionPaymentId);
  if (!pay) return null;

  const { data: ctxBag, error: rpcErr } = await admin.rpc("billing_receipt_load_context", {
    p_subscription_payment_id: subscriptionPaymentId,
  });

  if (!rpcErr && ctxBag != null && typeof ctxBag === "object" && !Array.isArray(ctxBag)) {
    const b = ctxBag as Record<string, unknown>;
    const cid = String(b.company_id ?? "").trim();
    if (cid) {
      return {
        pay,
        companyId: cid,
        companyName: String(b.company_name ?? "Workspace"),
        companyCreatedAt: b.company_created_at != null ? String(b.company_created_at) : null,
        createdBy: b.created_by != null ? String(b.created_by) : null,
        adminName: String(b.admin_name ?? "Customer"),
        adminEmail: String(b.admin_email ?? "").trim(),
        adminPhone: String(b.admin_phone ?? "").trim(),
        periodStart: b.period_start != null ? String(b.period_start) : null,
        periodEnd: b.period_end != null ? String(b.period_end) : null,
        billingCycle: b.billing_cycle != null ? String(b.billing_cycle) : null,
      };
    }
  }
  if (rpcErr) {
    console.warn("[billing-receipt-issue] billing_receipt_load_context rpc", rpcErr.message);
  }
  return loadIssueContextLegacy(admin, pay);
}

async function loadIssueContextLegacy(
  admin: SupabaseClient,
  pay: Record<string, unknown>,
): Promise<LoadedContext | null> {
  const companyId = String((pay as { company_id?: string }).company_id ?? "").trim();
  if (!companyId) return null;

  const { data: comp } = await admin
    .schema("core")
    .from("companies")
    .select("id,name,created_at,created_by,email,owner_email")
    .eq("id", companyId)
    .maybeSingle();

  const { data: pubComp } = await admin
    .from("companies")
    .select("name,created_at,created_by,phone")
    .eq("id", companyId)
    .maybeSingle();

  const nameFromCore = String((comp as { name?: string } | null)?.name ?? "").trim();
  const nameFromPub = String((pubComp as { name?: string } | null)?.name ?? "").trim();
  const companyName = nameFromCore || nameFromPub || "Workspace";

  const companyCreatedAt =
    (comp as { created_at?: string } | null)?.created_at != null
      ? String((comp as { created_at?: string }).created_at)
      : (pubComp as { created_at?: string } | null)?.created_at != null
        ? String((pubComp as { created_at?: string }).created_at)
        : null;

  const createdBy =
    (comp as { created_by?: string } | null)?.created_by != null
      ? String((comp as { created_by?: string }).created_by)
      : (pubComp as { created_by?: string } | null)?.created_by != null
        ? String((pubComp as { created_by?: string }).created_by)
        : null;

  const coreEmail = String((comp as { email?: string } | null)?.email ?? "").trim();
  const ownerEmail = String((comp as { owner_email?: string } | null)?.owner_email ?? "").trim();
  const publicCompanyPhone = String((pubComp as { phone?: string } | null)?.phone ?? "").trim();

  const { data: subRow } = await admin
    .from("company_subscriptions")
    .select("current_period_start,current_period_end,billing_cycle")
    .eq("company_id", companyId)
    .maybeSingle();

  const mpesaName = String((pay as { mpesa_name?: string }).mpesa_name ?? "").trim();
  const mpesaPhone = String((pay as { mpesa_phone?: string }).mpesa_phone ?? "").trim();

  const { data: coreMembers } = await admin
    .schema("core")
    .from("company_members")
    .select("clerk_user_id,role,created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(40);

  type Mem = { clerk_user_id: string; role: string; created_at: string | null };
  const seen = new Set<string>();
  const members: Mem[] = [];
  for (const m of coreMembers ?? []) {
    const id = memberClerkId(m as { clerk_user_id?: string; user_id?: string });
    if (!id || seen.has(id)) continue;
    seen.add(id);
    members.push({
      clerk_user_id: id,
      role: String((m as { role?: string }).role ?? ""),
      created_at: (m as { created_at?: string | null }).created_at != null ? String((m as { created_at?: string }).created_at) : null,
    });
  }

  if (members.length === 0) {
    const { data: pubMembers } = await admin
      .from("company_members")
      .select("clerk_user_id,user_id,role,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .limit(40);
    for (const m of pubMembers ?? []) {
      const id = memberClerkId(m as { clerk_user_id?: string; user_id?: string });
      if (!id || seen.has(id)) continue;
      seen.add(id);
      members.push({
        clerk_user_id: id,
        role: String((m as { role?: string }).role ?? ""),
        created_at: (m as { created_at?: string | null }).created_at != null ? String((m as { created_at?: string }).created_at) : null,
      });
    }
  }

  const memberIds = members.map((m) => m.clerk_user_id);
  const idsForProfiles = [...new Set([...(createdBy ? [createdBy] : []), ...memberIds])];
  const profileMap = await loadProfileMap(admin, idsForProfiles);

  const emailFor = (uid: string): string => String(profileMap.get(uid)?.email ?? "").trim();
  const nameFor = (uid: string): string => String(profileMap.get(uid)?.full_name ?? "").trim();

  const admins = members.filter((m) => isAdminishMemberRole(m.role));
  const nonAdmins = members.filter((m) => !isAdminishMemberRole(m.role));

  let adminEmail = "";
  let resolvedUid: string | null = null;

  if (createdBy) {
    const e = emailFor(createdBy);
    if (e) {
      adminEmail = e;
      resolvedUid = createdBy;
    }
  }

  if (!adminEmail) {
    adminEmail = coreEmail || ownerEmail || "";
  }

  if (!adminEmail) {
    for (const m of admins) {
      const e = emailFor(m.clerk_user_id);
      if (e) {
        adminEmail = e;
        resolvedUid = m.clerk_user_id;
        break;
      }
    }
  }

  if (!adminEmail) {
    for (const m of nonAdmins) {
      const e = emailFor(m.clerk_user_id);
      if (e) {
        adminEmail = e;
        resolvedUid = m.clerk_user_id;
        break;
      }
    }
  }

  const memberName =
    resolvedUid != null && resolvedUid.length > 0 ? nameFor(resolvedUid) : "";

  const adminName =
    mpesaName ||
    memberName ||
    (adminEmail && adminEmail.includes("@") ? adminEmail.split("@")[0] : "") ||
    "Customer";
  const adminPhone = mpesaPhone || publicCompanyPhone;

  return {
    pay,
    companyId,
    companyName,
    companyCreatedAt,
    createdBy,
    adminName,
    adminEmail,
    adminPhone,
    periodStart: (subRow as { current_period_start?: string } | null)?.current_period_start ?? null,
    periodEnd: (subRow as { current_period_end?: string } | null)?.current_period_end ?? null,
    billingCycle: (subRow as { billing_cycle?: string } | null)?.billing_cycle ?? null,
  };
}

function buildModel(ctx: LoadedContext, receiptNumber: string, issuedAt: string): {
  model: BillingReceiptPdfModel;
  lineItems: ReceiptLineItem[];
} {
  const pay = ctx.pay;
  const amount = Number(pay.amount ?? 0);
  const plan = planLabel(String(pay.plan_id ?? "basic"));
  const currency = String(pay.currency ?? "KES");
  const tx = String(pay.transaction_code ?? "").trim() || "—";
  const paidAt = String(pay.approved_at ?? pay.submitted_at ?? pay.created_at ?? issuedAt);
  const lineItems: ReceiptLineItem[] = [
    {
      description: `FarmVault ${plan} Subscription`,
      quantity: 1,
      unit_price: amount,
      total: amount,
    },
  ];
  const model: BillingReceiptPdfModel = {
    receiptNumber,
    issuedAtIso: issuedAt,
    statusLabel: "Paid",
    transactionDateIso: paidAt,
    transactionReference: tx,
    companyName: ctx.companyName,
    adminName: ctx.adminName,
    email: ctx.adminEmail,
    phone: ctx.adminPhone,
    workspaceName: ctx.companyName,
    paymentModeLabel: paymentModeLabel(
      String(pay.payment_method ?? ""),
      String(pay.billing_mode ?? ""),
    ),
    currency,
    planLabel: plan,
    billingPeriod: billingPeriodLabel(ctx.periodStart, ctx.periodEnd),
    lineItems,
    subtotal: amount,
    vatAmount: null,
    discountAmount: null,
    totalPaid: amount,
    customerSinceIso: ctx.companyCreatedAt,
    planTier: plan,
    paymentCycle: String(ctx.billingCycle ?? pay.billing_cycle ?? "monthly"),
    footerTimestampIso: new Date().toISOString(),
  };
  return { model, lineItems };
}

function buildModelFromReceiptRow(rec: Record<string, unknown>): {
  model: BillingReceiptPdfModel;
  lineItems: ReceiptLineItem[];
  receiptNumber: string;
  issuedAt: string;
} {
  const receiptNumber = String(rec.receipt_number ?? "").trim();
  const issuedAtRaw = String(rec.issued_at ?? "").trim();
  const issuedAt = issuedAtRaw || new Date().toISOString();
  const currency = String(rec.currency ?? "KES");
  const rawLineItems = rec.line_items;
  const lineItemsRaw = Array.isArray(rawLineItems)
    ? rawLineItems
    : typeof rawLineItems === "string"
      ? (() => {
        try {
          const parsed = JSON.parse(rawLineItems);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
      : [];
  const lineItems: ReceiptLineItem[] = lineItemsRaw
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        description: String(r.description ?? "FarmVault Subscription"),
        quantity: Number(r.quantity ?? 1) || 1,
        unit_price: Number(r.unit_price ?? r.total ?? rec.amount ?? 0) || 0,
        total: Number(r.total ?? r.unit_price ?? rec.amount ?? 0) || 0,
      };
    })
    .filter((r) => r.quantity > 0);

  const fallbackLineItems =
    lineItems.length > 0
      ? lineItems
      : [
        {
          description: `FarmVault ${String(rec.plan ?? "Subscription")} Subscription`,
          quantity: 1,
          unit_price: Number(rec.amount ?? 0),
          total: Number(rec.amount ?? 0),
        },
      ];

  const model: BillingReceiptPdfModel = {
    receiptNumber,
    issuedAtIso: issuedAt,
    statusLabel: String(rec.status ?? "Paid"),
    transactionDateIso: String(rec.issued_at ?? issuedAt),
    transactionReference: String(rec.transaction_reference ?? "—"),
    companyName: String(rec.company_name_snapshot ?? "Workspace"),
    adminName: String(rec.admin_name_snapshot ?? "Customer"),
    email: String(rec.customer_email ?? ""),
    phone: String(rec.customer_phone ?? ""),
    workspaceName: String(rec.workspace_name_snapshot ?? rec.company_name_snapshot ?? "Workspace"),
    paymentModeLabel:
      String(rec.payment_method ?? "").toLowerCase().includes("stk")
        ? "M-Pesa (STK Push)"
        : "M-Pesa (Manual)",
    currency,
    planLabel: String(rec.plan ?? "BASIC"),
    billingPeriod: String(rec.billing_period ?? "—"),
    lineItems: fallbackLineItems,
    subtotal: Number(rec.subtotal ?? rec.amount ?? 0),
    vatAmount: rec.vat_amount == null ? null : Number(rec.vat_amount ?? 0),
    discountAmount: rec.discount_amount == null ? null : Number(rec.discount_amount ?? 0),
    totalPaid: Number(rec.amount ?? 0),
    customerSinceIso: rec.customer_since != null ? String(rec.customer_since) : null,
    planTier: String(rec.plan ?? "BASIC"),
    paymentCycle: String(rec.payment_cycle ?? "monthly"),
    footerTimestampIso: new Date().toISOString(),
  };
  return { model, lineItems: fallbackLineItems, receiptNumber, issuedAt };
}

async function buildNewestPdfBytesForReceipt(
  admin: SupabaseClient,
  rec: Record<string, unknown>,
): Promise<{ ok: true; pdfBytes: Uint8Array; refreshedCtx: boolean } | { ok: false }> {
  const refreshed = await regenerateExistingReceiptPdf(admin, rec);
  if (refreshed.ok && refreshed.pdfBytes) {
    return { ok: true, pdfBytes: refreshed.pdfBytes, refreshedCtx: true };
  }
  try {
    const fromRow = buildModelFromReceiptRow(rec);
    const rebuilt = await buildBillingReceiptPdf(fromRow.model);
    const path = String(rec.pdf_storage_path ?? "").trim();
    if (path) {
      const { error } = await admin.storage.from("billing-receipts").upload(path, rebuilt, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (error) {
        console.error("[billing-receipt-issue] row rebuild upload failed", error.message);
      }
    }
    return { ok: true, pdfBytes: rebuilt, refreshedCtx: false };
  } catch (e) {
    console.error("[billing-receipt-issue] buildNewestPdfBytesForReceipt failed", e);
    return { ok: false };
  }
}

async function regenerateExistingReceiptPdf(
  admin: SupabaseClient,
  rec: Record<string, unknown>,
): Promise<{
  ok: boolean;
  pdfBytes?: Uint8Array;
  ctx?: LoadedContext;
  model?: BillingReceiptPdfModel;
  receiptNumber?: string;
  issuedAt?: string;
}> {
  try {
    const subPayId = String(rec.subscription_payment_id ?? "").trim();
    const receiptNumber = String(rec.receipt_number ?? "").trim();
    const storagePath = String(rec.pdf_storage_path ?? "").trim();
    const receiptId = String(rec.id ?? "").trim();
    if (!subPayId || !receiptNumber || !storagePath || !receiptId) {
      return { ok: false };
    }

    const ctx = await loadIssueContext(admin, subPayId);
    if (!ctx) return { ok: false };

    const issuedAtRaw = String(rec.issued_at ?? "").trim();
    const issuedAt = issuedAtRaw || new Date().toISOString();
    const { model, lineItems } = buildModel(ctx, receiptNumber, issuedAt);
    const pdfBytes = await buildBillingReceiptPdf(model);
    const issueInbox = await tryGetCompanyInbox(admin, ctx.companyId);
    const billingTo = issueInbox?.email ?? "";

    const { error: upErr } = await admin.storage.from("billing-receipts").upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) {
      console.error("[billing-receipt-issue] regenerate existing upload", upErr.message);
      return { ok: false };
    }

    await admin
      .from("receipts")
      .update({
        amount: Number(ctx.pay.amount ?? 0),
        line_items: lineItems,
        billing_period: model.billingPeriod,
        subtotal: model.subtotal,
        vat_amount: model.vatAmount,
        discount_amount: model.discountAmount,
        company_name_snapshot: ctx.companyName,
        workspace_name_snapshot: ctx.companyName,
        admin_name_snapshot: ctx.adminName,
        customer_email: billingTo || ctx.adminEmail || null,
        customer_phone: ctx.adminPhone || null,
        customer_since: ctx.companyCreatedAt,
        payment_cycle: model.paymentCycle,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId);

    return { ok: true, pdfBytes, ctx, model, receiptNumber, issuedAt };
  } catch (e) {
    console.error("[billing-receipt-issue] regenerateExistingReceiptPdf failed", e);
    return { ok: false };
  }
}

async function receiptEmailFromPaymentContext(
  admin: SupabaseClient,
  input: {
    ctx: LoadedContext;
    model: BillingReceiptPdfModel;
    receiptNumber: string;
    receiptId: string;
    appUrl: string;
    logoUrl: string;
  },
): Promise<string> {
  const { ctx, model } = input;
  const pay = ctx.pay;
  const tx = String(pay.transaction_code ?? "").trim() || "—";
  const paidIso = String(pay.approved_at ?? pay.submitted_at ?? pay.created_at ?? "");
  const baseUrl = input.appUrl.replace(/\/$/, "");

  let newExpiryLabel: string | null = null;

  try {
    const { data: comp } = await admin
      .schema("core")
      .from("companies")
      .select("active_until")
      .eq("id", ctx.companyId)
      .maybeSingle();
    const row = comp as { active_until?: string | null } | null;
    if (row?.active_until) {
      const d = new Date(String(row.active_until));
      if (!Number.isNaN(d.getTime())) {
        newExpiryLabel = d.toISOString().slice(0, 10);
      }
    }
  } catch {
    /* optional enrichment — receipt still sends */
  }

  return receiptEmailHtml({
    name: ctx.adminName,
    companyName: ctx.companyName,
    receiptNumber: input.receiptNumber,
    amount: `${String(pay.currency ?? "KES")} ${Number(pay.amount ?? 0).toLocaleString("en-KE")}`,
    plan: model.planLabel,
    billingCycle: billingCycleDisplay(ctx.billingCycle ?? String(pay.billing_cycle ?? "")),
    billingPeriod: model.billingPeriod,
    mpesaReceipt: tx,
    paymentDate: formatPaymentDate(paidIso),
    viewUrl: `${baseUrl}/billing?receipt=${input.receiptId}`,
    dashboardUrl: `${baseUrl}/home`,
    logoUrl: input.logoUrl,
    newExpiryLabel,
  });
}

function receiptEmailFromReceiptRow(
  rec: Record<string, unknown>,
  receiptId: string,
  appUrl: string,
  logoUrl: string,
): string {
  const payRef = String(rec.transaction_reference ?? "").trim() || "—";
  const issued = String(rec.issued_at ?? "");
  const baseUrl = appUrl.replace(/\/$/, "");
  return receiptEmailHtml({
    name: String(rec.admin_name_snapshot ?? "there"),
    companyName: String(rec.company_name_snapshot ?? "—"),
    receiptNumber: String(rec.receipt_number ?? ""),
    amount: `${String(rec.currency ?? "KES")} ${Number(rec.amount ?? 0).toLocaleString("en-KE")}`,
    plan: String(rec.plan ?? "—"),
    billingCycle: billingCycleDisplay(String(rec.payment_cycle ?? "monthly")),
    billingPeriod: String(rec.billing_period ?? "—"),
    mpesaReceipt: payRef,
    paymentDate: formatPaymentDate(issued),
    viewUrl: `${baseUrl}/billing?receipt=${receiptId}`,
    dashboardUrl: `${baseUrl}/home`,
    logoUrl,
  });
}

serveFarmVaultEdge("billing-receipt-issue", async (req, _ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ success: false, error: "Server misconfiguration" }, 500);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const auth = await authorize(req, admin, serviceKey);
  if (!auth.ok) {
    return jsonResponse({ success: false, ...auth.body }, auth.status);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }

  const action = String(body.action ?? "issue").toLowerCase();
  const appUrl = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");
  const receiptLogoUrl =
    Deno.env.get("FARMVAULT_RECEIPT_LOGO_URL")?.trim() ??
    "https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png";
  const logsClient = getServiceRoleClientForEmailLogs();
  const logClient = logsClient ?? admin;

  try {
    if (action === "resend_email") {
      if (auth.mode === "jwt_tenant") {
        const rid = String(body.receipt_id ?? "");
        if (!rid || !(await assertTenantReceiptAccess(auth.userClient, rid))) {
          return jsonResponse({ error: "Forbidden" }, 403);
        }
      } else if (auth.mode !== "jwt_dev" && auth.mode !== "secret") {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const receiptId = String(body.receipt_id ?? "");
      if (!receiptId) return jsonResponse({ error: "receipt_id required" }, 400);

      const { data: rec, error: re } = await admin.from("receipts").select("*").eq("id", receiptId).maybeSingle();
      if (re || !rec) return jsonResponse({ error: "Receipt not found" }, 404);

      const recObj = rec as Record<string, unknown>;
      let b64 = "";
      const newestPdf = await buildNewestPdfBytesForReceipt(admin, recObj);
      if (newestPdf.ok) {
        b64 = bytesToBase64(newestPdf.pdfBytes);
      } else {
        const path = String((rec as { pdf_storage_path?: string }).pdf_storage_path ?? "").trim();
        if (path) {
          const { data: file } = await admin.storage.from("billing-receipts").download(path);
          if (file) {
            const buf = new Uint8Array(await file.arrayBuffer());
            b64 = bytesToBase64(buf);
          }
        }
      }
      if (!b64) {
        return successResponse({
          ok: true,
          receipt_id: receiptId,
          emailed: false,
          warning: "PDF generation unavailable; resend skipped",
        });
      }

      const companyIdResend = String((rec as { company_id?: string }).company_id ?? "").trim();
      if (!companyIdResend) {
        return jsonResponse({ error: "Receipt missing company_id" }, 400);
      }

      const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
      if (!resendKey) return jsonResponse({ error: "Email not configured" }, 500);

      const receiptNumber = String((rec as { receipt_number?: string }).receipt_number ?? "");
      const html = receiptEmailFromReceiptRow(rec as Record<string, unknown>, receiptId, appUrl, receiptLogoUrl);

      const send = await sendCompanyPaymentEmail({
        admin: logClient,
        resendKey,
        companyId: companyIdResend,
        subject: RECEIPT_EMAIL_SUBJECT,
        html,
        email_type: "billing_receipt",
        metadata: { receipt_id: receiptId, action: "resend_email" },
        attachments: [{ filename: `${receiptNumber}.pdf`, content: b64 }],
      });

      if (!send.ok) {
        const fallbackTo = String((rec as { customer_email?: string }).customer_email ?? "").trim();
        if (!isLikelyEmail(fallbackTo)) {
          return successResponse({
            ok: true,
            receipt_id: receiptId,
            emailed: false,
            warning: send.error,
          });
        }
        const fallback = await sendResendWithEmailLog({
          admin: logClient,
          resendKey,
          from: getFarmVaultEmailFromForEmailType("billing_receipt"),
          to: fallbackTo,
          subject: RECEIPT_EMAIL_SUBJECT,
          html,
          email_type: "billing_receipt",
          company_id: companyIdResend,
          company_name: String((rec as { company_name_snapshot?: string }).company_name_snapshot ?? "Workspace"),
          metadata: {
            receipt_id: receiptId,
            action: "resend_email_fallback_customer_email",
            fallback_reason: send.error,
          },
          attachments: [{ filename: `${receiptNumber}.pdf`, content: b64 }],
        });
        if (!fallback.ok) {
          return successResponse({
            ok: true,
            receipt_id: receiptId,
            emailed: false,
            warning: fallback.error,
          });
        }
      }

      await admin
        .from("receipts")
        .update({ email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", receiptId);

      return successResponse({ ok: true, receipt_id: receiptId, emailed: true });
    }

    if (action === "regenerate") {
      if (auth.mode !== "jwt_dev" && auth.mode !== "secret") {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
      const receiptId = String(body.receipt_id ?? "");
      if (!receiptId) return jsonResponse({ error: "receipt_id required" }, 400);

      const { data: rec, error: re } = await admin.from("receipts").select("*").eq("id", receiptId).maybeSingle();
      if (re || !rec) return jsonResponse({ error: "Receipt not found" }, 404);

      const subPayId = String((rec as { subscription_payment_id?: string }).subscription_payment_id ?? "");
      const ctx = await loadIssueContext(admin, subPayId);
      if (!ctx) return jsonResponse({ error: "Could not load payment context" }, 400);

      const receiptNumber = String((rec as { receipt_number?: string }).receipt_number ?? "");
      const issuedAt = new Date().toISOString();
      const { model, lineItems } = buildModel(ctx, receiptNumber, issuedAt);
      const pdfBytes = await buildBillingReceiptPdf(model);
      const inbox = await tryGetCompanyInbox(admin, ctx.companyId);
      const billingTo = inbox?.email ?? "";
      const path = String((rec as { pdf_storage_path?: string }).pdf_storage_path ?? "");

      const { error: upErr } = await admin.storage.from("billing-receipts").upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) {
        console.error("[billing-receipt-issue] storage upload", upErr.message);
        return jsonResponse({ error: "Failed to upload PDF" }, 500);
      }

      await admin
        .from("receipts")
        .update({
          amount: Number(ctx.pay.amount ?? 0),
          line_items: lineItems,
          billing_period: model.billingPeriod,
          subtotal: model.subtotal,
          vat_amount: model.vatAmount,
          discount_amount: model.discountAmount,
          company_name_snapshot: ctx.companyName,
          workspace_name_snapshot: ctx.companyName,
          admin_name_snapshot: ctx.adminName,
          customer_email: billingTo || ctx.adminEmail || null,
          customer_phone: ctx.adminPhone || null,
          customer_since: ctx.companyCreatedAt,
          payment_cycle: model.paymentCycle,
          updated_at: issuedAt,
        })
        .eq("id", receiptId);

      const sendEmail = body.send_email === true;
      if (sendEmail) {
        const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
        if (resendKey) {
          await maybeSendPaymentFlowDiagnosticTest(resendKey);
          const b64 = bytesToBase64(pdfBytes);
          const html = await receiptEmailFromPaymentContext(admin, {
            ctx,
            model,
            receiptNumber,
            receiptId,
            appUrl,
            logoUrl: receiptLogoUrl,
          });
          const send = await sendCompanyPaymentEmail({
            admin: logClient,
            resendKey,
            companyId: ctx.companyId,
            subject: RECEIPT_EMAIL_SUBJECT,
            html,
            email_type: "billing_receipt",
            metadata: { receipt_id: receiptId, action: "regenerate" },
            attachments: [{ filename: `${receiptNumber}.pdf`, content: b64 }],
          });
          if (send.ok) {
            await admin
              .from("receipts")
              .update({ email_sent_at: new Date().toISOString() })
              .eq("id", receiptId);
          } else {
            console.error("[billing-receipt-issue] regenerate receipt email failed", send.error);
          }
        }
      }

      return successResponse({ ok: true, receipt_id: receiptId, regenerated: true });
    }

    // issue (default) — accept subscription_payment_id or payment_id
    const subscriptionPaymentId = String(
      body.subscription_payment_id ?? body.payment_id ?? "",
    ).trim();
    if (!subscriptionPaymentId) {
      return jsonResponse(
        { success: false, error: "subscription_payment_id or payment_id required" },
        400,
      );
    }

    if (auth.mode === "jwt_tenant") {
      const allowed = await tenantCanAccessSubscriptionPayment(auth.userClient, subscriptionPaymentId);
      if (!allowed) {
        return jsonResponse(
          {
            success: false,
            error: "Forbidden",
            detail:
              "This payment is not visible in your current workspace (check workspace switcher), or it does not exist.",
          },
          403,
        );
      }
    }

    const { data: existing } = await admin
      .from("receipts")
      .select("id,receipt_number")
      .eq("subscription_payment_id", subscriptionPaymentId)
      .maybeSingle();

    if (existing && typeof (existing as { id?: string }).id === "string") {
      const existingId = (existing as { id: string }).id;
      const receiptNumberDedup = String((existing as { receipt_number?: string }).receipt_number ?? "");
      let emailedDedup = false;
      const wantEmailOnDedupe = body.send_email !== false;
      const { data: recRow } = await admin.from("receipts").select("*").eq("id", existingId).maybeSingle();
      const r = recRow as Record<string, unknown> | null;
      const refreshedDedup = r ? await regenerateExistingReceiptPdf(admin, r) : { ok: false as const };
      if (wantEmailOnDedupe) {
        const sentAt = r?.email_sent_at;
        const pdfPath = String(r?.pdf_storage_path ?? "");
        if (r && !sentAt && pdfPath) {
          const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
          if (resendKey) {
            await maybeSendPaymentFlowDiagnosticTest(resendKey);
            let b64 = "";
            if (refreshedDedup.ok && refreshedDedup.pdfBytes) {
              b64 = bytesToBase64(refreshedDedup.pdfBytes);
            } else {
              // Ensure deduped sends still use the latest PDF template by rebuilding from row snapshot.
              const fromRow = buildModelFromReceiptRow(r);
              const rebuilt = await buildBillingReceiptPdf(fromRow.model);
              const { error: upErr } = await admin.storage.from("billing-receipts").upload(pdfPath, rebuilt, {
                contentType: "application/pdf",
                upsert: true,
              });
              if (upErr) {
                console.error("[billing-receipt-issue] dedupe rebuild upload failed", upErr.message);
              }
              b64 = bytesToBase64(rebuilt);
            }
            if (b64) {
              const html =
                refreshedDedup.ok && refreshedDedup.ctx && refreshedDedup.model
                  ? await receiptEmailFromPaymentContext(admin, {
                    ctx: refreshedDedup.ctx,
                    model: refreshedDedup.model,
                    receiptNumber: refreshedDedup.receiptNumber ?? receiptNumberDedup,
                    receiptId: existingId,
                    appUrl,
                    logoUrl: receiptLogoUrl,
                  })
                  : receiptEmailFromReceiptRow(r, existingId, appUrl, receiptLogoUrl);
              const send = await sendCompanyPaymentEmail({
                admin: logClient,
                resendKey,
                companyId: String(r.company_id ?? ""),
                subject: RECEIPT_EMAIL_SUBJECT,
                html,
                email_type: "billing_receipt",
                metadata: {
                  receipt_id: existingId,
                  subscription_payment_id: subscriptionPaymentId,
                  deduped_resend: true,
                },
                attachments: [{ filename: `${receiptNumberDedup || "receipt"}.pdf`, content: b64 }],
              });
              emailedDedup = send.ok;
              if (send.ok) {
                await admin
                  .from("receipts")
                  .update({ email_sent_at: new Date().toISOString() })
                  .eq("id", existingId);
              } else {
                console.error("[billing-receipt-issue] deduped receipt email failed", send.error);
              }
            }
          }
        }
      }
      return successResponse({
        ok: true,
        receipt_id: existingId,
        receipt_number: receiptNumberDedup,
        deduped: true,
        emailed: emailedDedup,
      });
    }

    const ctx = await loadIssueContext(admin, subscriptionPaymentId);
    if (!ctx) {
      return jsonResponse({ error: "Payment not found or not approved" }, 400);
    }

    const issueInbox = await tryGetCompanyInbox(admin, ctx.companyId);
    const billingContactEmail = issueInbox?.email ?? "";

    const { data: num, error: numErr } = await admin.rpc("alloc_billing_receipt_number");
    if (numErr || num == null || String(num).trim() === "") {
      console.error("[billing-receipt-issue] alloc number", numErr?.message);
      return jsonResponse({ error: "Failed to allocate receipt number" }, 500);
    }
    const receiptNumber = String(num);

    const receiptId = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    const { model, lineItems } = buildModel(ctx, receiptNumber, issuedAt);
    const pdfBytes = await buildBillingReceiptPdf(model);
    const storagePath = `${ctx.companyId}/${receiptId}.pdf`;

    const { error: upErr } = await admin.storage.from("billing-receipts").upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) {
      console.error("[billing-receipt-issue] upload", upErr.message);
      return jsonResponse({ error: "Failed to upload PDF" }, 500);
    }

    const sendEmail = body.send_email !== false;

    const { error: insErr } = await admin.from("receipts").insert({
      id: receiptId,
      receipt_number: receiptNumber,
      company_id: ctx.companyId,
      user_id: ctx.createdBy,
      subscription_payment_id: subscriptionPaymentId,
      amount: Number(ctx.pay.amount ?? 0),
      currency: String(ctx.pay.currency ?? "KES"),
      payment_method: String(ctx.pay.payment_method ?? "mpesa_manual"),
      transaction_reference: String(ctx.pay.transaction_code ?? ""),
      plan: model.planLabel,
      status: "paid",
      issued_at: issuedAt,
      pdf_storage_path: storagePath,
      pdf_url: null,
      line_items: lineItems,
      billing_period: model.billingPeriod,
      subtotal: model.subtotal,
      vat_amount: model.vatAmount,
      discount_amount: model.discountAmount,
      company_name_snapshot: ctx.companyName,
      workspace_name_snapshot: ctx.companyName,
      admin_name_snapshot: ctx.adminName,
      customer_email: billingContactEmail || ctx.adminEmail || null,
      customer_phone: ctx.adminPhone || null,
      customer_since: ctx.companyCreatedAt,
      payment_cycle: model.paymentCycle,
      metadata: { source: "billing-receipt-issue" },
    });

    if (insErr) {
      console.error("[billing-receipt-issue] insert", insErr.message);
      await admin.storage.from("billing-receipts").remove([storagePath]);
      return jsonResponse({ error: "Failed to save receipt" }, 500);
    }

    let emailed = false;
    if (sendEmail) {
      const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
      if (!resendKey) {
        console.error("[billing-receipt-issue] send_email requested but RESEND_API_KEY is not set");
      } else {
        console.log("PAYMENT EMAIL TRIGGERED", ctx.companyId, subscriptionPaymentId);
        await maybeSendPaymentFlowDiagnosticTest(resendKey);
        const b64 = bytesToBase64(pdfBytes);
        const html = await receiptEmailFromPaymentContext(admin, {
          ctx,
          model,
          receiptNumber,
          receiptId,
          appUrl,
          logoUrl: receiptLogoUrl,
        });
        const send = await sendCompanyPaymentEmail({
          admin: logClient,
          resendKey,
          companyId: ctx.companyId,
          subject: RECEIPT_EMAIL_SUBJECT,
          html,
          email_type: "billing_receipt",
          metadata: { receipt_id: receiptId, subscription_payment_id: subscriptionPaymentId },
          attachments: [{ filename: `${receiptNumber}.pdf`, content: b64 }],
        });
        emailed = send.ok;
        if (send.ok) {
          await admin
            .from("receipts")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("id", receiptId);
        } else {
          console.error("[billing-receipt-issue] payment receipt email failed", send.error);
        }
      }
    }

    return successResponse({
      ok: true,
      receipt_id: receiptId,
      receipt_number: receiptNumber,
      emailed,
    });
  } catch (e) {
    console.error("[billing-receipt-issue]", e);
    return jsonResponse(
      {
        success: false,
        error: "Unhandled",
        detail: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
  } catch (err) {
    console.error("[billing-receipt-issue] handler", err);
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
