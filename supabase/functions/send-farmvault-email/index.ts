// FarmVault Edge Function: send branded transactional email via Resend.
// Supported emailType: welcome | subscription_activated | trial_ending | company_approved | custom_manual
//
// Secrets (Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY              — required to send
//   SUPABASE_URL                — auto-provided on hosted Supabase
//   SUPABASE_ANON_KEY           — auto-provided; used to verify caller JWT
//   SUPABASE_SERVICE_ROLE_KEY   — required for email_logs audit rows
//   FARMVAULT_EMAIL_INTERNAL_SECRET — optional; allows trusted server-to-server sends (any `to`)
//   FARMVAULT_EMAIL_FROM        — optional override, default "FarmVault <noreply@farmvault.africa>"
//
// Auth:
//   - Default: Authorization: Bearer <Clerk session token or Supabase JWT>; recipient `to` must match the authenticated user's email.
//   - custom_manual: Bearer + admin.is_developer() only; any valid `to` (developer console).
//   - Server/cron/other Edge Functions: X-FarmVault-Email-Secret: <FARMVAULT_EMAIL_INTERNAL_SECRET> (omit user restriction).
//
// Deploy with JWT verification disabled at the gateway (we verify the token in-code for Clerk compatibility):
//   npx supabase functions deploy send-farmvault-email --no-verify-jwt
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildEmailMetadataSummary,
  getServiceRoleClientForEmailLogs,
  insertEmailLogRow,
  updateEmailLogRow,
} from "../_shared/emailLogs.ts";
import { renderFarmVaultEmail } from "../_shared/farmvault-email/renderFarmVaultEmail.ts";
import type {
  FarmVaultEmailType,
  SendFarmVaultEmailPayload,
} from "../_shared/farmvault-email/types.ts";
import { validateSendFarmVaultEmailBody } from "../_shared/farmvault-email/validatePayload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmvault-email-secret",
};

const DEFAULT_FROM = "FarmVault <noreply@farmvault.africa>";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type AuthResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

async function authorizeSend(
  req: Request,
  toEmail: string,
  emailType: FarmVaultEmailType,
): Promise<AuthResult> {
  const internal = Deno.env.get("FARMVAULT_EMAIL_INTERNAL_SECRET")?.trim();
  const provided = req.headers.get("x-farmvault-email-secret")?.trim();
  if (internal && provided && internal === provided) {
    return { ok: true };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      status: 401,
      body: { error: "Unauthorized", detail: "Missing Bearer token" },
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[send-farmvault-email] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return {
      ok: false,
      status: 500,
      body: { error: "Server misconfiguration" },
    };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    console.warn("[send-farmvault-email] JWT verification failed", error?.message ?? "no user");
    return {
      ok: false,
      status: 401,
      body: {
        error: "Unauthorized",
        detail: error?.message ?? "Invalid session",
      },
    };
  }

  if (emailType === "custom_manual") {
    const { data: isDev, error: devErr } = await userClient.rpc("is_developer");
    if (devErr) {
      console.error("[send-farmvault-email] is_developer RPC error", devErr.message);
      return {
        ok: false,
        status: 403,
        body: { error: "Forbidden", detail: "Could not verify developer access" },
      };
    }
    if (isDev !== true) {
      return {
        ok: false,
        status: 403,
        body: {
          error: "Forbidden",
          detail: "Developer access is required to send manual emails",
        },
      };
    }
    return { ok: true };
  }

  if (!user.email) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "Unauthorized",
        detail: "Your account has no email on file; transactional sends require it",
      },
    };
  }

  if (user.email.trim().toLowerCase() !== toEmail.trim().toLowerCase()) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "Forbidden",
        detail: "Transactional emails can only be sent to the signed-in user's email",
      },
    };
  }

  return { ok: true };
}

function payloadDataAsRecord(payload: SendFarmVaultEmailPayload): Record<string, unknown> {
  return { ...payload.data } as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const validated = validateSendFarmVaultEmailBody(raw);
  if (!validated.ok) {
    return jsonResponse({ error: "Invalid payload", detail: validated.message }, 400);
  }

  const { payload } = validated;
  const auth = await authorizeSend(req, payload.to, payload.emailType);
  if (!auth.ok) {
    return jsonResponse(auth.body, auth.status);
  }

  const admin = getServiceRoleClientForEmailLogs();

  let subject: string;
  let html: string;
  try {
    const rendered = renderFarmVaultEmail(payload.emailType, payload.data);
    subject = rendered.subject;
    html = rendered.html;
  } catch (e) {
    console.error("[send-farmvault-email] Template render failed", e);
    const errText = e instanceof Error ? e.message : String(e);
    if (admin) {
      await insertEmailLogRow(admin, {
        company_id: payload.companyId ?? null,
        company_name: payload.companyName ?? null,
        recipient_email: payload.to.trim().toLowerCase(),
        email_type: payload.emailType,
        subject: `[${payload.emailType}] Template render failed`,
        status: "failed",
        provider: "resend",
        triggered_by: payload.triggeredBy ?? null,
        error_message: errText,
        metadata: buildEmailMetadataSummary(payload.metadata ?? null, payloadDataAsRecord(payload)),
      });
    }
    return jsonResponse({ error: "Failed to build email" }, 500);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) {
    console.error("[send-farmvault-email] RESEND_API_KEY is not set");
    if (admin) {
      await insertEmailLogRow(admin, {
        company_id: payload.companyId ?? null,
        company_name: payload.companyName ?? null,
        recipient_email: payload.to.trim().toLowerCase(),
        email_type: payload.emailType,
        subject,
        status: "failed",
        provider: "resend",
        triggered_by: payload.triggeredBy ?? null,
        error_message: "RESEND_API_KEY is not set",
        metadata: buildEmailMetadataSummary(payload.metadata ?? null, payloadDataAsRecord(payload)),
      });
    }
    return jsonResponse({ error: "Email service not configured" }, 500);
  }

  const from = Deno.env.get("FARMVAULT_EMAIL_FROM")?.trim() || DEFAULT_FROM;

  const meta = buildEmailMetadataSummary(payload.metadata ?? null, payloadDataAsRecord(payload));
  meta.source = "send-farmvault-email";

  let logId: string | null = null;
  if (admin) {
    logId = await insertEmailLogRow(admin, {
      company_id: payload.companyId ?? null,
      company_name: payload.companyName ?? null,
      recipient_email: payload.to.trim().toLowerCase(),
      email_type: payload.emailType,
      subject,
      status: "pending",
      provider: "resend",
      triggered_by: payload.triggeredBy ?? null,
      metadata: meta,
    });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject,
        html,
      }),
    });

    const resBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      console.error("[send-farmvault-email] Resend API error", res.status, resBody);
      const detail = typeof resBody.message === "string" ? resBody.message : `HTTP ${res.status}`;
      if (admin && logId) {
        await updateEmailLogRow(admin, logId, {
          status: "failed",
          error_message: detail,
        });
      } else if (admin && !logId) {
        await insertEmailLogRow(admin, {
          company_id: payload.companyId ?? null,
          company_name: payload.companyName ?? null,
          recipient_email: payload.to.trim().toLowerCase(),
          email_type: payload.emailType,
          subject,
          status: "failed",
          provider: "resend",
          triggered_by: payload.triggeredBy ?? null,
          error_message: detail,
          metadata: meta,
        });
      }
      return jsonResponse(
        {
          error: "Failed to send email",
          detail: typeof resBody.message === "string" ? resBody.message : undefined,
        },
        500,
      );
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
        company_id: payload.companyId ?? null,
        company_name: payload.companyName ?? null,
        recipient_email: payload.to.trim().toLowerCase(),
        email_type: payload.emailType,
        subject,
        status: "sent",
        provider: "resend",
        provider_message_id: id ?? null,
        triggered_by: payload.triggeredBy ?? null,
        sent_at: sentAt,
        metadata: meta,
      });
    }

    return jsonResponse({
      ok: true,
      emailType: payload.emailType,
      id,
      logId: logId ?? undefined,
    });
  } catch (e) {
    console.error("[send-farmvault-email] Network or unexpected error", e);
    const errText = e instanceof Error ? e.message : String(e);
    if (admin && logId) {
      await updateEmailLogRow(admin, logId, {
        status: "failed",
        error_message: errText,
      });
    } else if (admin && !logId) {
      await insertEmailLogRow(admin, {
        company_id: payload.companyId ?? null,
        company_name: payload.companyName ?? null,
        recipient_email: payload.to.trim().toLowerCase(),
        email_type: payload.emailType,
        subject,
        status: "failed",
        provider: "resend",
        triggered_by: payload.triggeredBy ?? null,
        error_message: errText,
        metadata: meta,
      });
    }
    return jsonResponse({ error: "Failed to send email" }, 500);
  }
});
