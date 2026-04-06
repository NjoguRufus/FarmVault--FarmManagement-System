// Issue / regenerate / resend FarmVault billing receipts (PDF + optional Resend email).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//   RESEND_API_KEY (for email), BILLING_RECEIPT_ISSUE_SECRET (server-to-server, e.g. STK callback),
//   optional FARMVAULT_BILLING_EMAIL_FROM (Resend From for receipts; default FarmVault <billing@farmvault.africa>),
//   optional FARMVAULT_RECEIPT_LOGO_URL, FARMVAULT_PUBLIC_APP_URL
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
import { getServiceRoleClientForEmailLogs, insertEmailLogRow, updateEmailLogRow } from "../_shared/emailLogs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmvault-receipt-secret",
};

const DEFAULT_FROM = "FarmVault <billing@farmvault.africa>";
const EMAIL_TYPE = "billing_receipt";

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

async function readResendBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 500) };
  }
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
}): string {
  const safeLogo = input.logoUrl.replace(/"/g, "&quot;");
  const safeView = input.viewUrl.replace(/"/g, "&quot;");
  const safeDash = input.dashboardUrl.replace(/"/g, "&quot;");
  const e = escapeReceiptHtml;
  const planUpper = e(input.plan.toUpperCase());
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

async function loadReviewerProfile(
  admin: SupabaseClient,
  reviewedBy: string,
): Promise<{ email: string; full_name: string } | null> {
  const rb = reviewedBy.trim();
  if (!rb || rb.toLowerCase() === "mpesa_stk") return null;

  const { data: coreRp } = await admin
    .schema("core")
    .from("profiles")
    .select("email,full_name")
    .eq("clerk_user_id", rb)
    .maybeSingle();
  let email = String((coreRp as { email?: string } | null)?.email ?? "").trim();
  let fullName = String((coreRp as { full_name?: string } | null)?.full_name ?? "").trim();
  if (email || fullName) return { email, full_name: fullName };

  const { data: pubClerk } = await admin
    .from("profiles")
    .select("email,full_name")
    .eq("clerk_user_id", rb)
    .maybeSingle();
  email = String((pubClerk as { email?: string } | null)?.email ?? "").trim();
  fullName = String((pubClerk as { full_name?: string } | null)?.full_name ?? "").trim();
  if (email || fullName) return { email, full_name: fullName };

  const { data: pubId } = await admin.from("profiles").select("email,full_name").eq("id", rb).maybeSingle();
  email = String((pubId as { email?: string } | null)?.email ?? "").trim();
  fullName = String((pubId as { full_name?: string } | null)?.full_name ?? "").trim();
  if (email || fullName) return { email, full_name: fullName };

  return null;
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
    .select("id,name,created_at,created_by,owner_email")
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

  const publicCompanyPhone = String((pubComp as { phone?: string } | null)?.phone ?? "").trim();

  const { data: subRow } = await admin
    .from("company_subscriptions")
    .select("current_period_start,current_period_end,billing_cycle")
    .eq("company_id", companyId)
    .maybeSingle();

  const reviewedBy = String((pay as { reviewed_by?: string }).reviewed_by ?? "").trim();
  const mpesaName = String((pay as { mpesa_name?: string }).mpesa_name ?? "").trim();
  const mpesaPhone = String((pay as { mpesa_phone?: string }).mpesa_phone ?? "").trim();

  const reviewerProf = await loadReviewerProfile(admin, reviewedBy);

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
  const profileMap = await loadProfileMap(admin, memberIds);

  const byId = new Map<string, { email: string; full_name: string }>();
  for (const id of memberIds) {
    byId.set(id, profileMap.get(id) ?? { email: "", full_name: "" });
  }

  let pick = createdBy ? byId.get(createdBy) : undefined;
  if (!pick || (!pick.email && !pick.full_name)) {
    const adminMember = members.find((m) => m.role.toLowerCase().includes("admin"));
    if (adminMember) pick = byId.get(adminMember.clerk_user_id);
  }
  if (!pick || (!pick.email && !pick.full_name)) {
    pick = memberIds.length ? byId.get(memberIds[0]) : undefined;
  }

  const pickEmail = String(pick?.email ?? "").trim();
  const pickName = String(pick?.full_name ?? "").trim();
  const reviewerEmail = String(reviewerProf?.email ?? "").trim();
  const reviewerName = String(reviewerProf?.full_name ?? "").trim();

  const fallbackEmail = memberIds.map((id) => byId.get(id)?.email ?? "").map((e) => e.trim()).find(Boolean) ?? "";

  const ownerEmail = String((comp as { owner_email?: string } | null)?.owner_email ?? "").trim();
  // Priority: owner_email (company contact) → company admin profile → first member → never reviewer.
  // reviewer* fields belong to the developer who approved — they must NOT receive the company receipt.
  let adminEmail = ownerEmail || pickEmail || fallbackEmail;
  const adminName =
    mpesaName ||
    pickName ||
    (pickEmail ? pickEmail.split("@")[0] : "") ||
    (adminEmail ? adminEmail.split("@")[0] : "") ||
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

function receiptEmailFromPaymentContext(input: {
  ctx: LoadedContext;
  model: BillingReceiptPdfModel;
  receiptNumber: string;
  receiptId: string;
  appUrl: string;
  logoUrl: string;
}): string {
  const { ctx, model } = input;
  const pay = ctx.pay;
  const tx = String(pay.transaction_code ?? "").trim() || "—";
  const paidIso = String(pay.approved_at ?? pay.submitted_at ?? pay.created_at ?? "");
  const baseUrl = input.appUrl.replace(/\/$/, "");
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
    dashboardUrl: `${baseUrl}/dashboard`,
    logoUrl: input.logoUrl,
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
    dashboardUrl: `${baseUrl}/dashboard`,
    logoUrl,
  });
}

async function sendReceiptEmail(input: {
  admin: SupabaseClient | null;
  resendKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  pdfBase64: string;
  filename: string;
  companyId: string;
  companyName: string;
  metadata: Record<string, unknown>;
}): Promise<{ ok: true; resendId?: string } | { ok: false; error: string }> {
  let logId: string | null = null;
  if (input.admin) {
    logId = await insertEmailLogRow(input.admin, {
      company_id: input.companyId,
      company_name: input.companyName,
      recipient_email: input.to.trim().toLowerCase(),
      email_type: EMAIL_TYPE,
      subject: input.subject,
      status: "pending",
      provider: "resend",
      metadata: input.metadata,
    });
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to.trim()],
        subject: input.subject,
        html: input.html,
        attachments: [{ filename: input.filename, content: input.pdfBase64 }],
      }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    if (input.admin && logId) await updateEmailLogRow(input.admin, logId, { status: "failed", error_message: detail });
    return { ok: false, error: detail };
  }

  const body = await readResendBody(res);
  if (!res.ok) {
    const detail = typeof body.message === "string" ? body.message : `HTTP ${res.status}`;
    if (input.admin && logId) await updateEmailLogRow(input.admin, logId, { status: "failed", error_message: detail });
    return { ok: false, error: detail };
  }

  const resendId = typeof body.id === "string" ? body.id : undefined;
  if (input.admin && logId) {
    await updateEmailLogRow(input.admin, logId, {
      status: "sent",
      provider_message_id: resendId ?? null,
      sent_at: new Date().toISOString(),
    });
  }
  return { ok: true, resendId };
}

Deno.serve(async (req) => {
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
  // Do not use FARMVAULT_EMAIL_FROM here — it is often set to noreply@ for other Edge functions.
  const from = Deno.env.get("FARMVAULT_BILLING_EMAIL_FROM")?.trim() || DEFAULT_FROM;
  const logsClient = getServiceRoleClientForEmailLogs();

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

      const path = String((rec as { pdf_storage_path?: string }).pdf_storage_path ?? "");
      if (!path) return jsonResponse({ error: "PDF missing" }, 400);

      const { data: file, error: dlErr } = await admin.storage.from("billing-receipts").download(path);
      if (dlErr || !file) {
        console.error("[billing-receipt-issue] download", dlErr?.message);
        return jsonResponse({ error: "Failed to read PDF" }, 500);
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      const b64 = bytesToBase64(buf);

      const email = String((rec as { customer_email?: string }).customer_email ?? "").trim();
      if (!email) return jsonResponse({ error: "No customer email on receipt" }, 400);

      const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
      if (!resendKey) return jsonResponse({ error: "Email not configured" }, 500);

      const receiptNumber = String((rec as { receipt_number?: string }).receipt_number ?? "");
      const subject = `FarmVault Payment Receipt — ${receiptNumber}`;
      const html = receiptEmailFromReceiptRow(rec as Record<string, unknown>, receiptId, appUrl, receiptLogoUrl);

      const send = await sendReceiptEmail({
        admin: logsClient,
        resendKey,
        from,
        to: email,
        subject,
        html,
        pdfBase64: b64,
        filename: `${receiptNumber}.pdf`,
        companyId: String((rec as { company_id?: string }).company_id ?? ""),
        companyName: String((rec as { company_name_snapshot?: string }).company_name_snapshot ?? "FarmVault"),
        metadata: { receipt_id: receiptId, action: "resend_email" },
      });

      if (!send.ok) {
        return jsonResponse({ error: send.error }, 500);
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
          customer_email: ctx.adminEmail || null,
          customer_phone: ctx.adminPhone || null,
          customer_since: ctx.companyCreatedAt,
          payment_cycle: model.paymentCycle,
          updated_at: issuedAt,
        })
        .eq("id", receiptId);

      const sendEmail = body.send_email === true;
      if (sendEmail && ctx.adminEmail) {
        const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
        if (resendKey) {
          const b64 = bytesToBase64(pdfBytes);
          const html = receiptEmailFromPaymentContext({
            ctx,
            model,
            receiptNumber,
            receiptId,
            appUrl,
            logoUrl: receiptLogoUrl,
          });
          const send = await sendReceiptEmail({
            admin: logsClient,
            resendKey,
            from,
            to: ctx.adminEmail,
            subject: `FarmVault Payment Receipt — ${receiptNumber}`,
            html,
            pdfBase64: b64,
            filename: `${receiptNumber}.pdf`,
            companyId: ctx.companyId,
            companyName: ctx.companyName,
            metadata: { receipt_id: receiptId, action: "regenerate" },
          });
          if (send.ok) {
            await admin
              .from("receipts")
              .update({ email_sent_at: new Date().toISOString() })
              .eq("id", receiptId);
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
      if (wantEmailOnDedupe) {
        const { data: recRow } = await admin.from("receipts").select("*").eq("id", existingId).maybeSingle();
        const r = recRow as Record<string, unknown> | null;
        const sentAt = r?.email_sent_at;
        const cust = String(r?.customer_email ?? "").trim();
        const pdfPath = String(r?.pdf_storage_path ?? "");
        if (r && !sentAt && cust && pdfPath) {
          const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
          if (resendKey) {
            const { data: file, error: dlErr } = await admin.storage.from("billing-receipts").download(pdfPath);
            if (!dlErr && file) {
              const buf = new Uint8Array(await file.arrayBuffer());
              const b64 = bytesToBase64(buf);
              const html = receiptEmailFromReceiptRow(r, existingId, appUrl, receiptLogoUrl);
              const send = await sendReceiptEmail({
                admin: logsClient,
                resendKey,
                from,
                to: cust,
                subject: `FarmVault Payment Receipt — ${receiptNumberDedup}`,
                html,
                pdfBase64: b64,
                filename: `${receiptNumberDedup || "receipt"}.pdf`,
                companyId: String(r.company_id ?? ""),
                companyName: String(r.company_name_snapshot ?? "FarmVault"),
                metadata: {
                  receipt_id: existingId,
                  subscription_payment_id: subscriptionPaymentId,
                  deduped_resend: true,
                },
              });
              emailedDedup = send.ok;
              if (send.ok) {
                await admin
                  .from("receipts")
                  .update({ email_sent_at: new Date().toISOString() })
                  .eq("id", existingId);
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
      customer_email: ctx.adminEmail || null,
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
    if (sendEmail && ctx.adminEmail) {
      const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
      if (resendKey) {
        const b64 = bytesToBase64(pdfBytes);
        const html = receiptEmailFromPaymentContext({
          ctx,
          model,
          receiptNumber,
          receiptId,
          appUrl,
          logoUrl: receiptLogoUrl,
        });
        const send = await sendReceiptEmail({
          admin: logsClient,
          resendKey,
          from,
          to: ctx.adminEmail,
          subject: `FarmVault Payment Receipt — ${receiptNumber}`,
          html,
          pdfBase64: b64,
          filename: `${receiptNumber}.pdf`,
          companyId: ctx.companyId,
          companyName: ctx.companyName,
          metadata: { receipt_id: receiptId, subscription_payment_id: subscriptionPaymentId },
        });
        emailed = send.ok;
        if (send.ok) {
          await admin
            .from("receipts")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("id", receiptId);
        }
      }
    } else if (sendEmail && !ctx.adminEmail) {
      console.warn(
        "[billing-receipt-issue] send_email requested but no customer email for company",
        ctx.companyId,
        subscriptionPaymentId,
      );
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
