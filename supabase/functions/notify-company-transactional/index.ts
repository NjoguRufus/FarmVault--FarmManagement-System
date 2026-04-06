// Company owner transactional mail (Resend + email_logs). Clerk JWT + company admin only.
//
// Body: { company_id: uuid, kind: "pro_trial_started" }
//
// Deploy: npx supabase functions deploy notify-company-transactional --no-verify-jwt

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceRoleClientForEmailLogs } from "../_shared/emailLogs.ts";
import { buildProTrialStartedEmail } from "../_shared/farmvault-email/proTrialStartedTemplate.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";

const DEFAULT_FROM = "FarmVault <noreply@farmvault.africa>";
const EMAIL_TYPE_TRIAL = "company_pro_trial_started";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!supabaseUrl || !serviceKey || !resendKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const bearer = bearerFromRequest(req);
  const sub = clerkSubFromJwt(bearer);
  if (!sub) return jsonResponse({ error: "Unauthorized", detail: "Bearer JWT required" }, 401);

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
  if (kind !== "pro_trial_started") {
    return jsonResponse({ error: "Unsupported kind" }, 400);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const logAdmin = getServiceRoleClientForEmailLogs();
  const from = Deno.env.get("FARMVAULT_EMAIL_FROM")?.trim() || DEFAULT_FROM;
  const appUrl = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");

  const okAdmin = await assertCompanyAdmin(admin, companyId, sub);
  if (!okAdmin) return jsonResponse({ error: "Forbidden" }, 403);

  const { data: comp, error: ce } = await admin
    .schema("core")
    .from("companies")
    .select("name,owner_email,onboarding_completed")
    .eq("id", companyId)
    .maybeSingle();
  if (ce || !comp) return jsonResponse({ error: "Company not found" }, 404);

  const c = comp as { name?: string | null; owner_email?: string | null; onboarding_completed?: boolean };
  if (c.onboarding_completed !== true) {
    return jsonResponse({ error: "Precondition failed", detail: "Onboarding not complete" }, 412);
  }

  let to = String(c.owner_email ?? "").trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    const { data: prof } = await admin.schema("core").from("profiles").select("email").eq("clerk_user_id", sub).maybeSingle();
    to = String((prof as { email?: string } | null)?.email ?? "").trim().toLowerCase();
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return jsonResponse({ error: "No owner email", detail: "Set workspace owner email on the company" }, 400);
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
  const { data: prior } = await admin
    .from("email_logs")
    .select("id")
    .eq("email_type", EMAIL_TYPE_TRIAL)
    .eq("status", "sent")
    .contains("metadata", { dedupe_key: dedupeKey })
    .limit(1)
    .maybeSingle();
  if ((prior as { id?: string } | null)?.id) {
    return jsonResponse({ ok: true, skipped: true, reason: "already_sent" });
  }

  const companyName = String(c.name ?? "Your workspace").trim() || "Your workspace";
  const built = buildProTrialStartedEmail({
    companyName,
    trialEndsAt: trialEnds,
    billingUrl: `${appUrl}/billing`,
  });

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
