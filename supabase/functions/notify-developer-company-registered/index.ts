// After company onboarding completes: developer notification (Resend + email_logs).
// Invoke with Supabase publishable/anon key only (no Clerk JWT at gateway).
//
// Secrets: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
// Optional: FARMVAULT_EMAIL_FROM_DEVELOPER; FARMVAULT_DEVELOPER_INBOX_EMAIL
//
// Body: { company_id: string } — must match a workspace with onboarding_completed = true.
//
// Deploy: npx supabase functions deploy notify-developer-company-registered --no-verify-jwt

import { getServiceRoleClientForEmailLogs, insertEmailLogRow } from "../_shared/emailLogs.ts";
import {
  buildDeveloperCompanyRegisteredNotifyEmail,
  type DeveloperCompanyRegisteredAmbassador,
} from "../_shared/farmvault-email/developerCompanyRegisteredNotifyTemplate.ts";
import { getFarmVaultEmailFrom } from "../_shared/farmvaultEmailFrom.ts";
import { getFarmvaultDeveloperInboxEmail } from "../_shared/farmvaultDeveloperInbox.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";

const EMAIL_LOG_TYPE = "company_registration_developer_notify";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  try {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-developer-company-registered] JSON stringify failed", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: "Could not serialize response" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

function validateAnonInvoke(req: Request): { ok: true } | { ok: false; detail: string } {
  const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (!anon) {
    return { ok: false, detail: "Server misconfiguration: SUPABASE_ANON_KEY missing" };
  }
  const apikeyHdr = req.headers.get("apikey")?.trim();
  const auth = req.headers.get("Authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (apikeyHdr === anon || bearer === anon) {
    return { ok: true };
  }
  return {
    ok: false,
    detail:
      "Missing or invalid apikey — use Supabase publishable/anon key (apikey header); do not send Clerk JWT",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtIsoOrRaw(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "—";
  const s = String(v).trim();
  const d = Date.parse(s);
  if (!Number.isNaN(d)) {
    try {
      return new Date(d).toISOString();
    } catch {
      return s;
    }
  }
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const gate = validateAnonInvoke(req);
    if (!gate.ok) {
      return jsonResponse({ error: "Unauthorized", detail: gate.detail }, 401);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch (parseErr) {
      console.error("[notify-developer-company-registered] Invalid JSON body", parseErr);
      return jsonResponse({ error: "Invalid JSON body", detail: "Request body must be JSON" }, 400);
    }

    const payload =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    if (!payload) {
      return jsonResponse({ error: "Invalid payload", detail: "Body must be a JSON object" }, 400);
    }

    const companyId = typeof payload.company_id === "string" ? payload.company_id.trim() : "";
    if (!companyId || !UUID_RE.test(companyId)) {
      return jsonResponse(
        { error: "Invalid payload", detail: "company_id must be a valid UUID" },
        400,
      );
    }

    const admin = getServiceRoleClientForEmailLogs();
    if (!admin) {
      return jsonResponse(
        { error: "Server misconfiguration", detail: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" },
        500,
      );
    }

    const { data: prior } = await admin
      .from("email_logs")
      .select("id")
      .eq("company_id", companyId)
      .eq("email_type", EMAIL_LOG_TYPE)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();

    if (prior?.id) {
      return jsonResponse({ ok: true, skipped: true, reason: "already_notified" });
    }

    let company: Record<string, unknown> | null = null;
    let companyErr: { message: string } | null = null;
    const maxOnboardingWaitAttempts = 15;
    const waitMs = 220;

    for (let attempt = 0; attempt < maxOnboardingWaitAttempts; attempt++) {
      const r = await admin
        .schema("core")
        .from("companies")
        .select("id,name,created_at,plan,subscription_status,trial_ends_at,onboarding_completed")
        .eq("id", companyId)
        .maybeSingle();

      companyErr = r.error ? { message: r.error.message } : null;
      company = (r.data ?? null) as Record<string, unknown> | null;

      if (companyErr) {
        console.error("[notify-developer-company-registered] company load", companyErr.message);
        return jsonResponse({ error: "Failed to load company", detail: companyErr.message }, 500);
      }
      if (!company) {
        return jsonResponse({ error: "Not found", detail: "Company not found" }, 404);
      }

      const onboarded = company.onboarding_completed === true;
      if (onboarded) break;
      if (attempt < maxOnboardingWaitAttempts - 1) {
        await sleep(waitMs);
      }
    }

    const onboarded = company?.onboarding_completed === true;
    if (!onboarded) {
      return jsonResponse(
        {
          error: "Precondition failed",
          detail: "Onboarding is not complete for this workspace; notification is skipped.",
        },
        412,
      );
    }

    const { data: subRow } = await admin
      .from("company_subscriptions")
      .select("trial_ends_at,status,plan,is_trial")
      .eq("company_id", companyId)
      .maybeSingle();

    const c = company as {
      name?: string | null;
      created_at?: string | null;
      plan?: string | null;
      subscription_status?: string | null;
      trial_ends_at?: string | null;
    };

    const sub = subRow as {
      trial_ends_at?: string | null;
      status?: string | null;
      plan?: string | null;
      is_trial?: boolean | null;
    } | null;

    const trialEndsRaw =
      c.trial_ends_at != null && String(c.trial_ends_at).trim() !== ""
        ? String(c.trial_ends_at)
        : sub?.trial_ends_at != null && String(sub.trial_ends_at).trim() !== ""
          ? String(sub.trial_ends_at)
          : "";

    const planRaw =
      c.plan != null && String(c.plan).trim() !== ""
        ? String(c.plan).trim()
        : sub?.plan != null && String(sub.plan).trim() !== ""
          ? String(sub.plan).trim()
          : "";

    let subscriptionStatus =
      c.subscription_status != null && String(c.subscription_status).trim() !== ""
        ? String(c.subscription_status)
        : sub?.status != null && String(sub.status).trim() !== ""
          ? String(sub.status)
          : "—";
    if (sub?.is_trial === true && !/trial/i.test(subscriptionStatus)) {
      subscriptionStatus = `${subscriptionStatus} (trial)`;
    }

    const planDisplay =
      /^pro$/i.test(planRaw) && /trialing|trial/i.test(subscriptionStatus)
        ? "PRO Trial"
        : planRaw || "—";

    const { data: refByCompany } = await admin
      .from("referrals")
      .select("referrer_id")
      .eq("company_id", companyId)
      .limit(1);

    let referrerId =
      Array.isArray(refByCompany) && refByCompany[0] && typeof refByCompany[0].referrer_id === "string"
        ? (refByCompany[0].referrer_id as string)
        : "";

    if (!referrerId) {
      const { data: refByReferred } = await admin
        .from("referrals")
        .select("referrer_id")
        .eq("referred_user_id", companyId)
        .eq("referred_user_type", "company")
        .limit(1);
      if (
        Array.isArray(refByReferred) &&
        refByReferred[0] &&
        typeof refByReferred[0].referrer_id === "string"
      ) {
        referrerId = refByReferred[0].referrer_id as string;
      }
    }

    let ambassador: DeveloperCompanyRegisteredAmbassador | null = null;
    if (referrerId) {
      const { data: amb } = await admin
        .from("ambassadors")
        .select("name,email,referral_code")
        .eq("id", referrerId)
        .maybeSingle();
      if (amb) {
        const a = amb as { name?: string | null; email?: string | null; referral_code?: string | null };
        ambassador = {
          name: (a.name && String(a.name).trim()) || "—",
          email: (a.email && String(a.email).trim()) || "—",
          referralCode: (a.referral_code && String(a.referral_code).trim()) || "—",
        };
      }
    }

    const companyName = (c.name && String(c.name).trim()) || "Unnamed workspace";
    const built = buildDeveloperCompanyRegisteredNotifyEmail({
      companyName,
      companyId,
      createdAt: fmtIsoOrRaw(c.created_at ?? null),
      plan: planDisplay,
      subscriptionStatus,
      trialEndsAt: fmtIsoOrRaw(trialEndsRaw || null),
      ambassador,
    });

    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    if (!resendKey) {
      console.error("[notify-developer-company-registered] RESEND_API_KEY is not set");
      await insertEmailLogRow(admin, {
        company_id: companyId,
        company_name: companyName,
        recipient_email: getFarmvaultDeveloperInboxEmail(),
        email_type: EMAIL_LOG_TYPE,
        subject: built.subject,
        status: "failed",
        provider: "resend",
        error_message: "RESEND_API_KEY missing",
        metadata: { source: "notify-developer-company-registered", company_id: companyId },
      });
      return jsonResponse(
        { error: "Email service not configured", detail: "RESEND_API_KEY missing" },
        500,
      );
    }

    const from = getFarmVaultEmailFrom("developer");
    const developerTo = getFarmvaultDeveloperInboxEmail();

    const send = await sendResendWithEmailLog({
      admin,
      resendKey,
      from,
      to: developerTo,
      subject: built.subject,
      html: built.html,
      email_type: EMAIL_LOG_TYPE,
      company_id: companyId,
      company_name: companyName,
      metadata: {
        source: "notify-developer-company-registered",
        company_id: companyId,
        has_ambassador: ambassador != null,
      },
    });

    if (!send.ok) {
      return jsonResponse({ error: "Failed to send email", detail: send.error }, 500);
    }

    return jsonResponse({
      ok: true,
      id: send.resendId,
      logId: send.logId ?? undefined,
    });
  } catch (unexpected) {
    console.error("[notify-developer-company-registered] Unhandled error", unexpected);
    return jsonResponse(
      {
        error: "Internal error",
        detail: unexpected instanceof Error ? unexpected.message : String(unexpected),
      },
      500,
    );
  }
});
