// Developer-triggered: send workspace-ready email via Resend (no database reads in this function).
//
// Secrets: RESEND_API_KEY (required), SUPABASE_SERVICE_ROLE_KEY (required for email_logs).
// Optional: FARMVAULT_EMAIL_FROM_ONBOARDING
// Auth: Authorization Bearer + Supabase anon + is_developer() RPC (no table reads here).
//
// Body JSON (caller resolves recipient — no company table reads here):
//   { "to": "admin@farm.com", "companyName": "Wamugi Farm", "dashboardUrl": "https://app.../dashboard" }
//
// Deploy: npx supabase functions deploy notify-company-workspace-ready --no-verify-jwt
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getServiceRoleClientForEmailLogs,
  insertEmailLogRow,
  updateEmailLogRow,
} from "../_shared/emailLogs.ts";
import { buildCompanyApprovedEmail } from "../_shared/farmvault-email/companyApprovedTemplate.ts";
import { getFarmVaultEmailFrom } from "../_shared/farmvaultEmailFrom.ts";

const EMAIL_LOG_TYPE = "workspace_ready";

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
    console.error("[notify-company-workspace-ready] JSON stringify failed", stringifyErr);
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

/** Parse Resend (or any) HTTP body into a plain object for logging / detail. */
async function readResponsePayload(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Unauthorized", detail: "Missing Bearer token" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        "[notify-company-workspace-ready] Missing SUPABASE_URL or SUPABASE_ANON_KEY (needed for is_developer only)",
      );
      return jsonResponse({ error: "Server misconfiguration", detail: "Supabase env missing" }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let isDev: boolean | null = null;
    try {
      const { data, error: devErr } = await userClient.rpc("is_developer");
      if (devErr) {
        console.error("[notify-company-workspace-ready] is_developer RPC error", devErr.message);
        return jsonResponse(
          { error: "Forbidden", detail: devErr.message || "Developer check failed" },
          403,
        );
      }
      isDev = data === true;
    } catch (rpcErr) {
      console.error("[notify-company-workspace-ready] is_developer threw", rpcErr);
      return jsonResponse({ error: "Forbidden", detail: "Developer check failed" }, 403);
    }

    if (!isDev) {
      console.warn("[notify-company-workspace-ready] Forbidden — not a developer");
      return jsonResponse({ error: "Forbidden", detail: "Developer access required" }, 403);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch (parseErr) {
      console.error("[notify-company-workspace-ready] Invalid JSON body", parseErr);
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

    if (!to) {
      return jsonResponse(
        { error: "Invalid payload", detail: "Recipient email (to) is required" },
        400,
      );
    }
    if (!EMAIL_RE.test(to)) {
      return jsonResponse({ error: "Invalid payload", detail: "to must be a valid email address" }, 400);
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

    const admin = getServiceRoleClientForEmailLogs();
    const logMeta = {
      source: "notify-company-workspace-ready",
      dashboardUrl,
    };

    let subject: string;
    let html: string;
    try {
      const built = buildCompanyApprovedEmail({
        companyName,
        dashboardUrl,
      });
      subject = built.subject;
      html = built.html;
    } catch (e) {
      console.error("[notify-company-workspace-ready] Template build failed", e);
      const errText = e instanceof Error ? e.message : String(e);
      if (admin) {
        await insertEmailLogRow(admin, {
          company_id: null,
          company_name: companyName,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE,
          subject: `[${EMAIL_LOG_TYPE}] Template build failed`,
          status: "failed",
          provider: "resend",
          error_message: errText,
          metadata: logMeta,
        });
      }
      return jsonResponse(
        { error: "Failed to build email", detail: errText },
        500,
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    if (!resendKey) {
      console.error("[notify-company-workspace-ready] RESEND_API_KEY is not set");
      if (admin) {
        await insertEmailLogRow(admin, {
          company_id: null,
          company_name: companyName,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE,
          subject,
          status: "failed",
          provider: "resend",
          error_message: "RESEND_API_KEY missing",
          metadata: logMeta,
        });
      }
      return jsonResponse(
        { error: "Email service not configured", detail: "RESEND_API_KEY missing" },
        500,
      );
    }

    const from = getFarmVaultEmailFrom("onboarding");

    let logId: string | null = null;
    if (admin) {
      logId = await insertEmailLogRow(admin, {
        company_id: null,
        company_name: companyName,
        recipient_email: to.toLowerCase(),
        email_type: EMAIL_LOG_TYPE,
        subject,
        status: "pending",
        provider: "resend",
        metadata: logMeta,
      });
    }

    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
        }),
      });
    } catch (fetchErr) {
      console.error("[notify-company-workspace-ready] Resend fetch network error", fetchErr);
      const detail = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (admin && logId) {
        await updateEmailLogRow(admin, logId, { status: "failed", error_message: detail });
      } else if (admin && !logId) {
        await insertEmailLogRow(admin, {
          company_id: null,
          company_name: companyName,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE,
          subject,
          status: "failed",
          provider: "resend",
          error_message: detail,
          metadata: logMeta,
        });
      }
      return jsonResponse(
        {
          error: "Failed to send email",
          detail,
        },
        500,
      );
    }

    const resBody = await readResponsePayload(res);

    if (!res.ok) {
      console.error("[notify-company-workspace-ready] Resend error", res.status, resBody);
      const detail =
        typeof resBody.message === "string"
          ? resBody.message
          : typeof resBody.name === "string"
            ? resBody.name
            : `HTTP ${res.status}`;
      if (admin && logId) {
        await updateEmailLogRow(admin, logId, { status: "failed", error_message: detail });
      } else if (admin && !logId) {
        await insertEmailLogRow(admin, {
          company_id: null,
          company_name: companyName,
          recipient_email: to.toLowerCase(),
          email_type: EMAIL_LOG_TYPE,
          subject,
          status: "failed",
          provider: "resend",
          error_message: detail,
          metadata: logMeta,
        });
      }
      return jsonResponse({ error: "Failed to send email", detail }, 500);
    }

    const id = typeof resBody.id === "string" ? resBody.id : undefined;
    const sentAt = new Date().toISOString();
    if (admin && logId) {
      await updateEmailLogRow(admin, logId, {
        status: "sent",
        provider_message_id: id ?? null,
        sent_at: sentAt,
      });
    } else if (admin && !logId) {
      await insertEmailLogRow(admin, {
        company_id: null,
        company_name: companyName,
        recipient_email: to.toLowerCase(),
        email_type: EMAIL_LOG_TYPE,
        subject,
        status: "sent",
        provider: "resend",
        provider_message_id: id ?? null,
        sent_at: sentAt,
        metadata: logMeta,
      });
    }

    return jsonResponse({ ok: true, id, to, logId: logId ?? undefined }, 200);
  } catch (unexpected) {
    console.error("[notify-company-workspace-ready] Unhandled error", unexpected);
    return jsonResponse(
      {
        error: "Internal error",
        detail: unexpected instanceof Error ? unexpected.message : String(unexpected),
      },
      500,
    );
  }
});
