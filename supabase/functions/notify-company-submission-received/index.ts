// Public (anon-key) invoke: user confirmation + optional admin notify. No Supabase user JWT.
//
// Secrets: RESEND_API_KEY (required), SUPABASE_SERVICE_ROLE_KEY (required for email_logs), SUPABASE_ANON_KEY (caller check).
// Optional: FARMVAULT_EMAIL_FROM_ONBOARDING / FARMVAULT_EMAIL_FROM_ALERTS;
//   developer copy uses FARMVAULT_DEVELOPER_INBOX_EMAIL (see farmvaultDeveloperInbox.ts)
//
// Body:
//   to, companyName, dashboardUrl (user confirmation — unchanged)
//   userEmail (optional; defaults to to) — shown on admin email
//   approvalDashboardUrl (optional https) — developer-console link for admin notify
//   onboardingCompleteDeveloperNotify (optional bool) — when true, send “onboarding complete” developer copy;
//     uses approvalDashboardUrl or FARMVAULT_PUBLIC_APP_URL + /developer/companies
//
// Deploy: npx supabase functions deploy notify-company-submission-received --no-verify-jwt
//
import { getServiceRoleClientForEmailLogs, insertEmailLogRow } from "../_shared/emailLogs.ts";
import { getFarmvaultDeveloperInboxEmail } from "../_shared/farmvaultDeveloperInbox.ts";
import {
  buildOnboardingAdminNotifyEmail,
  buildOnboardingCompleteDeveloperNotifyEmail,
} from "../_shared/farmvault-email/onboardingAdminNotifyTemplate.ts";
import { buildSubmissionReceivedEmail } from "../_shared/farmvault-email/submissionReceivedTemplate.ts";
import { getFarmVaultEmailFrom } from "../_shared/farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";

const EMAIL_LOG_TYPE_USER = "submission_received";
const EMAIL_LOG_TYPE_ADMIN = "submission_admin_notify";
const EMAIL_LOG_TYPE_ADMIN_ONBOARDING_DONE = "submission_onboarding_complete_developer_notify";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: unknown, status = 200): Response {
  try {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (stringifyErr) {
    console.error("[notify-company-submission-received] JSON stringify failed", stringifyErr);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: "Could not serialize response" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

function requireHttpsUrl(v: unknown, field: string): string | null {
  if (typeof v !== "string" || !v.trim()) return `${field} is required`;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:") return `${field} must use https`;
    return null;
  } catch {
    return `${field} must be a valid URL`;
  }
}

/** Require project anon/publishable key — not a user JWT. */
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
    detail: "Missing or invalid apikey — use Supabase publishable/anon key (apikey header); do not send Clerk JWT",
  };
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
      console.error("[notify-company-submission-received] Invalid JSON body", parseErr);
      return jsonResponse({ error: "Invalid JSON body", detail: "Request body must be JSON" }, 400);
    }

    const payload =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    if (!payload) {
      return jsonResponse({ error: "Invalid payload", detail: "Body must be a JSON object" }, 400);
    }

    const to = typeof payload.to === "string" ? payload.to.trim() : "";
    const companyName = typeof payload.companyName === "string" ? payload.companyName.trim() : "";
    const dashboardUrl = typeof payload.dashboardUrl === "string" ? payload.dashboardUrl.trim() : "";
    const userEmailRaw = typeof payload.userEmail === "string" ? payload.userEmail.trim() : "";
    const userEmail = userEmailRaw || to;
    const approvalDashboardUrl =
      typeof payload.approvalDashboardUrl === "string" ? payload.approvalDashboardUrl.trim() : "";
    const onboardingCompleteDeveloperNotify = payload.onboardingCompleteDeveloperNotify === true;

    if (!to) {
      return jsonResponse(
        { error: "Invalid payload", detail: "Recipient email (to) is required" },
        400,
      );
    }
    if (!EMAIL_RE.test(to)) {
      return jsonResponse({ error: "Invalid payload", detail: "to must be a valid email address" }, 400);
    }
    if (!EMAIL_RE.test(userEmail)) {
      return jsonResponse(
        { error: "Invalid payload", detail: "userEmail must be a valid email address" },
        400,
      );
    }

    if (!companyName || companyName.length < 2) {
      return jsonResponse(
        { error: "Invalid payload", detail: "companyName is required (min 2 characters)" },
        400,
      );
    }

    const urlErr = requireHttpsUrl(dashboardUrl, "dashboardUrl");
    if (urlErr) {
      return jsonResponse({ error: "Invalid payload", detail: urlErr }, 400);
    }

    const appBase = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");
    const defaultDevConsole = `${appBase}/developer/companies`;
    const resolvedDeveloperUrl =
      approvalDashboardUrl ||
      (onboardingCompleteDeveloperNotify ? defaultDevConsole : "");
    const skipAdminNotify = !resolvedDeveloperUrl;
    const apprErr = skipAdminNotify ? null : requireHttpsUrl(resolvedDeveloperUrl, "approvalDashboardUrl");
    if (apprErr) {
      return jsonResponse({ error: "Invalid payload", detail: apprErr }, 400);
    }

    const admin = getServiceRoleClientForEmailLogs();
    const logMetaUser = {
      source: "notify-company-submission-received",
      branch: "user_confirmation",
      dashboardUrl,
    };

    let subject: string;
    let html: string;
    try {
      const built = buildSubmissionReceivedEmail({ companyName, dashboardUrl });
      subject = built.subject;
      html = built.html;
    } catch (e) {
      console.error("[notify-company-submission-received] Template build failed", e);
      const errText = e instanceof Error ? e.message : String(e);
      if (admin) {
        await insertEmailLogRow(admin, {
          company_id: null,
          company_name: companyName,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE_USER,
          subject: `[${EMAIL_LOG_TYPE_USER}] Template build failed`,
          status: "failed",
          provider: "resend",
          error_message: errText,
          metadata: logMetaUser,
        });
      }
      return jsonResponse(
        { error: "Failed to build email", detail: errText },
        500,
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    if (!resendKey) {
      console.error("[notify-company-submission-received] RESEND_API_KEY is not set");
      if (admin) {
        await insertEmailLogRow(admin, {
          company_id: null,
          company_name: companyName,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE_USER,
          subject,
          status: "failed",
          provider: "resend",
          error_message: "RESEND_API_KEY missing",
          metadata: logMetaUser,
        });
      }
      return jsonResponse(
        { error: "Email service not configured", detail: "RESEND_API_KEY missing" },
        500,
      );
    }

    const fromUser = getFarmVaultEmailFrom("onboarding");
    const fromAdmin = getFarmVaultEmailFrom("developer");

    const userSend = await sendResendWithEmailLog({
      admin,
      resendKey,
      from: fromUser,
      to,
      subject,
      html,
      email_type: EMAIL_LOG_TYPE_USER,
      company_name: companyName,
      metadata: logMetaUser,
    });

    if (!userSend.ok) {
      return jsonResponse({ error: "Failed to send email", detail: userSend.error }, 500);
    }

    if (skipAdminNotify) {
      return jsonResponse(
        {
          ok: true,
          id: userSend.resendId,
          to,
          logId: userSend.logId ?? undefined,
          adminNotifyOk: true,
          adminNotifySkipped: true,
        },
        200,
      );
    }

    const adminRecipient = getFarmvaultDeveloperInboxEmail();
    const submittedAt = new Date().toISOString();
    const adminBuilt = onboardingCompleteDeveloperNotify
      ? buildOnboardingCompleteDeveloperNotifyEmail({
          companyName,
          userEmail,
          completedAtIso: submittedAt,
          developerDashboardUrl: resolvedDeveloperUrl,
        })
      : buildOnboardingAdminNotifyEmail({
          companyName,
          userEmail,
          submittedAtIso: submittedAt,
          approvalDashboardUrl: resolvedDeveloperUrl,
        });

    const adminSend = await sendResendWithEmailLog({
      admin,
      resendKey,
      from: fromAdmin,
      to: adminRecipient,
      subject: adminBuilt.subject,
      html: adminBuilt.html,
      email_type: onboardingCompleteDeveloperNotify ? EMAIL_LOG_TYPE_ADMIN_ONBOARDING_DONE : EMAIL_LOG_TYPE_ADMIN,
      company_name: companyName,
      metadata: {
        source: "notify-company-submission-received",
        branch: onboardingCompleteDeveloperNotify ? "onboarding_complete_developer" : "admin_notify",
        userEmail,
        confirmationRecipient: to,
        approvalDashboardUrl: resolvedDeveloperUrl,
        submittedAt,
      },
    });

    if (!adminSend.ok) {
      console.error(
        "[notify-company-submission-received] admin notify failed (submission still OK for user)",
        adminSend.error,
      );
    }

    return jsonResponse(
      {
        ok: true,
        id: userSend.resendId,
        to,
        logId: userSend.logId ?? undefined,
        adminNotifyOk: adminSend.ok,
        ...(adminSend.ok ? {} : { adminNotifyError: adminSend.error }),
      },
      200,
    );
  } catch (unexpected) {
    console.error("[notify-company-submission-received] Unhandled error", unexpected);
    return jsonResponse(
      {
        error: "Internal error",
        detail: unexpected instanceof Error ? unexpected.message : String(unexpected),
      },
      500,
    );
  }
});
