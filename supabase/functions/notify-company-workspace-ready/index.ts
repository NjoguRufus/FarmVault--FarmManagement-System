// Developer-triggered: send workspace-ready email via Resend (no database reads in this function).
//
// Secrets: RESEND_API_KEY (required). Optional: FARMVAULT_EMAIL_FROM
// Auth: Authorization Bearer + Supabase anon + is_developer() RPC (no table reads here).
//
// Body JSON:
//   { "to": "admin@farm.com", "companyName": "Wamugi Farm", "dashboardUrl": "https://app.../dashboard" }
//
// Deploy: npx supabase functions deploy notify-company-workspace-ready --no-verify-jwt
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCompanyApprovedEmail } from "../_shared/farmvault-email/companyApprovedTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_FROM = "FarmVault <noreply@farmvault.africa>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    console.error("[notify-company-workspace-ready] Missing SUPABASE_URL or SUPABASE_ANON_KEY (needed for is_developer only)");
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isDev, error: devErr } = await userClient.rpc("is_developer");
  if (devErr || !isDev) {
    console.warn("[notify-company-workspace-ready] Forbidden", devErr?.message);
    return jsonResponse({ error: "Forbidden", detail: "Developer access required" }, 403);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const body = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body) {
    return jsonResponse({ error: "Invalid payload", detail: "Body must be a JSON object" }, 400);
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const dashboardUrl = typeof body.dashboardUrl === "string" ? body.dashboardUrl.trim() : "";

  if (!to || !EMAIL_RE.test(to)) {
    return jsonResponse({ error: "Invalid payload", detail: "to must be a valid email address" }, 400);
  }
  if (!companyName || companyName.length < 2) {
    return jsonResponse({ error: "Invalid payload", detail: "companyName is required (min 2 characters)" }, 400);
  }
  const urlErr = requireHttpsUrl(dashboardUrl, "dashboardUrl");
  if (urlErr) {
    return jsonResponse({ error: "Invalid payload", detail: urlErr }, 400);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) {
    console.error("[notify-company-workspace-ready] RESEND_API_KEY is not set");
    return jsonResponse({ error: "Email service not configured", detail: "RESEND_API_KEY missing" }, 500);
  }

  const from = Deno.env.get("FARMVAULT_EMAIL_FROM")?.trim() || DEFAULT_FROM;

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
    return jsonResponse({ error: "Failed to build email" }, 500);
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
        to: [to],
        subject,
        html,
      }),
    });

    const resBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      console.error("[notify-company-workspace-ready] Resend error", res.status, resBody);
      return jsonResponse(
        {
          error: "Failed to send email",
          detail: typeof resBody.message === "string" ? resBody.message : `HTTP ${res.status}`,
        },
        500,
      );
    }

    const id = typeof resBody.id === "string" ? resBody.id : undefined;
    return jsonResponse({ ok: true, id, to });
  } catch (e) {
    console.error("[notify-company-workspace-ready] Send failed", e);
    return jsonResponse(
      {
        error: "Failed to send email",
        detail: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});
