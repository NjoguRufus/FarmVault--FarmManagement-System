// Ambassador onboarding emails: ambassador welcome + developer admin notify.
// No user JWT required — called with Supabase anon/publishable key only.
//
// Secrets: RESEND_API_KEY (required), SUPABASE_SERVICE_ROLE_KEY (required for email_logs), SUPABASE_ANON_KEY (caller check).
// Optional: FARMVAULT_EMAIL_FROM_ONBOARDING / FARMVAULT_EMAIL_FROM_ALERTS;
//   developer copy uses FARMVAULT_DEVELOPER_INBOX_EMAIL
//
// Body:
//   to             — ambassador email (required)
//   ambassadorName — ambassador full name (required)
//   dashboardUrl   — optional URL for welcome email CTA button
//
// Deploy: npx supabase functions deploy notify-ambassador-onboarding --no-verify-jwt
//
import { getServiceRoleClientForEmailLogs, insertEmailLogRow } from "../_shared/emailLogs.ts";
import { buildAmbassadorAdminNotifyEmail } from "../_shared/farmvault-email/ambassadorAdminNotifyTemplate.ts";
import { buildAmbassadorWelcomeEmail } from "../_shared/farmvault-email/ambassadorWelcomeTemplate.ts";
import { getFarmVaultEmailFrom } from "../_shared/farmvaultEmailFrom.ts";
import { getFarmvaultDeveloperInboxEmail } from "../_shared/farmvaultDeveloperInbox.ts";
import { sendResendWithEmailLog } from "../_shared/resendSendLogged.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

const EMAIL_LOG_TYPE_WELCOME = "ambassador_onboarding";
const EMAIL_LOG_TYPE_ADMIN = "ambassador_onboarding_admin_notify";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    console.error("[notify-ambassador-onboarding] JSON stringify failed", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: "Could not serialize response" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
    detail:
      "Missing or invalid apikey — use Supabase publishable/anon key (apikey header); do not send Clerk JWT",
  };
}

serveFarmVaultEdge("notify-ambassador-onboarding", async (req: Request, _ctx) => {
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
      console.error("[notify-ambassador-onboarding] Invalid JSON body", parseErr);
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
    const ambassadorName =
      typeof payload.ambassadorName === "string" ? payload.ambassadorName.trim() : "";
    const dashboardUrl =
      typeof payload.dashboardUrl === "string" ? payload.dashboardUrl.trim() : "";

    if (!to || !EMAIL_RE.test(to)) {
      return jsonResponse(
        { error: "Invalid payload", detail: "Recipient email (to) is required and must be valid" },
        400,
      );
    }
    if (!ambassadorName || ambassadorName.length < 2) {
      return jsonResponse(
        { error: "Invalid payload", detail: "ambassadorName is required (min 2 characters)" },
        400,
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    if (!resendKey) {
      console.error("[notify-ambassador-onboarding] RESEND_API_KEY is not set");
      const adminFallback = getServiceRoleClientForEmailLogs();
      if (adminFallback) {
        await insertEmailLogRow(adminFallback, {
          company_id: null,
          company_name: null,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE_WELCOME,
          subject: "Welcome to the FarmVault Ambassador Program",
          status: "failed",
          provider: "resend",
          error_message: "RESEND_API_KEY missing",
          metadata: { source: "notify-ambassador-onboarding" },
        });
      }
      return jsonResponse(
        { error: "Email service not configured", detail: "RESEND_API_KEY missing" },
        500,
      );
    }

    const admin = getServiceRoleClientForEmailLogs();
    const fromOnboarding = getFarmVaultEmailFrom("onboarding");
    const fromDeveloper = getFarmVaultEmailFrom("developer");
    const registeredAt = new Date().toISOString();

    // Build ambassador welcome email
    let welcomeSubject: string;
    let welcomeHtml: string;
    try {
      const built = buildAmbassadorWelcomeEmail({
        ambassadorName,
        dashboardUrl: dashboardUrl || undefined,
      });
      welcomeSubject = built.subject;
      welcomeHtml = built.html;
    } catch (e) {
      console.error("[notify-ambassador-onboarding] Welcome template build failed", e);
      const errText = e instanceof Error ? e.message : String(e);
      if (admin) {
        await insertEmailLogRow(admin, {
          company_id: null,
          company_name: null,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE_WELCOME,
          subject: `[${EMAIL_LOG_TYPE_WELCOME}] Template build failed`,
          status: "failed",
          provider: "resend",
          error_message: errText,
          metadata: { source: "notify-ambassador-onboarding" },
        });
      }
      return jsonResponse({ error: "Failed to build email", detail: errText }, 500);
    }

    // Send ambassador welcome email
    const welcomeSend = await sendResendWithEmailLog({
      admin,
      resendKey,
      from: fromOnboarding,
      to,
      subject: welcomeSubject,
      html: welcomeHtml,
      email_type: EMAIL_LOG_TYPE_WELCOME,
      company_name: null,
      metadata: {
        source: "notify-ambassador-onboarding",
        branch: "ambassador_welcome",
        ambassadorName,
        registeredAt,
      },
    });

    if (!welcomeSend.ok) {
      return jsonResponse(
        { error: "Failed to send welcome email", detail: welcomeSend.error },
        500,
      );
    }

    // Build and send developer admin notification
    const adminRecipient = getFarmvaultDeveloperInboxEmail();
    const adminBuilt = buildAmbassadorAdminNotifyEmail({
      ambassadorName,
      ambassadorEmail: to,
      registeredAtIso: registeredAt,
    });

    const adminSend = await sendResendWithEmailLog({
      admin,
      resendKey,
      from: fromDeveloper,
      to: adminRecipient,
      subject: adminBuilt.subject,
      html: adminBuilt.html,
      email_type: EMAIL_LOG_TYPE_ADMIN,
      company_name: null,
      metadata: {
        source: "notify-ambassador-onboarding",
        branch: "admin_notify",
        ambassadorName,
        ambassadorEmail: to,
        registeredAt,
      },
    });

    if (!adminSend.ok) {
      console.error(
        "[notify-ambassador-onboarding] admin notify failed (welcome still OK)",
        adminSend.error,
      );
    }

    return jsonResponse({
      ok: true,
      id: welcomeSend.resendId,
      to,
      logId: welcomeSend.logId ?? undefined,
      adminNotifyOk: adminSend.ok,
      ...(adminSend.ok ? {} : { adminNotifyError: adminSend.error }),
    });
  } catch (unexpected) {
    console.error("[notify-ambassador-onboarding] Unhandled error", unexpected);
    return jsonResponse(
      {
        error: "Internal error",
        detail: unexpected instanceof Error ? unexpected.message : String(unexpected),
      },
      500,
    );
  }
});
