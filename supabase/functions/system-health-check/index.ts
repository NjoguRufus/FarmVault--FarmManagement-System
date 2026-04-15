/**
 * FarmVault V1 system health (read-only on domain data; append-only system_health_logs).
 *
 * Auth:
 *   - Cron: Authorization: Bearer SYSTEM_HEALTH_CHECK_SECRET
 *   - Developer UI: Supabase anon `Authorization` + `X-FarmVault-Clerk-Authorization: Bearer <Clerk>` + is_developer()
 *
 * Flow: service_role RPC `system_health_evaluate(true)` → log row → email if warning/critical.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYSTEM_HEALTH_CHECK_SECRET (cron),
 *          FARMVAULT_EMAIL_INTERNAL_SECRET, SYSTEM_HEALTH_ALERT_EMAIL (fallback LAUNCH_MONITORING_ALERT_EMAIL),
 *          SUPABASE_ANON_KEY (optional; gateway to send-farmvault-email)
 *
 * Deploy: npx supabase functions deploy system-health-check --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";
import { getFarmvaultDeveloperInboxEmail } from "../_shared/farmvaultDeveloperInbox.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-farmvault-clerk-authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type HealthIssue = {
  type: string;
  count: number;
  message: string;
  severity?: string;
};

type HealthPayload = {
  status: string;
  issues: HealthIssue[];
  metrics?: Record<string, unknown>;
  checked_at?: string;
};

type HealthLogEntry = {
  created_at: string;
  status: string;
  message: string | null;
};

function parsePayload(raw: unknown): HealthPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const status = typeof o.status === "string" ? o.status : "ok";
  const issuesRaw = o.issues;
  const issues: HealthIssue[] = [];
  if (Array.isArray(issuesRaw)) {
    for (const it of issuesRaw) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      issues.push({
        type: typeof r.type === "string" ? r.type : "unknown",
        count: typeof r.count === "number" ? r.count : Number(r.count) || 0,
        message: typeof r.message === "string" ? r.message : "",
        severity: typeof r.severity === "string" ? r.severity : undefined,
      });
    }
  }
  return {
    status,
    issues,
    metrics: o.metrics && typeof o.metrics === "object" ? (o.metrics as Record<string, unknown>) : undefined,
    checked_at: typeof o.checked_at === "string" ? o.checked_at : undefined,
  };
}

function alertEmail(): string | null {
  const a = Deno.env.get("SYSTEM_HEALTH_ALERT_EMAIL")?.trim().toLowerCase();
  if (a) return a;
  return Deno.env.get("LAUNCH_MONITORING_ALERT_EMAIL")?.trim().toLowerCase() ?? null;
}

function resolveClerkBearer(req: Request): string | null {
  const h = req.headers.get("x-farmvault-clerk-authorization")?.trim();
  if (h?.toLowerCase().startsWith("bearer ") && h.length > 7) return h;
  return null;
}

async function verifyDeveloper(
  supabaseUrl: string,
  apikey: string,
  clerkAuthHeader: string,
): Promise<boolean> {
  const userClient = createClient(supabaseUrl, apikey, {
    global: {
      headers: {
        Authorization: clerkAuthHeader,
        apikey,
      },
    },
  });
  const { data, error } = await userClient.rpc("is_developer");
  if (error) {
    console.warn("[system-health-check] is_developer RPC", error.message);
    return false;
  }
  return data === true;
}

async function sendHealthEmail(
  supabaseUrl: string,
  gatewayKey: string,
  internalSecret: string,
  to: string,
  status: "critical" | "warning",
  payload: HealthPayload,
  recentLogs: HealthLogEntry[],
): Promise<{ ok: boolean; error?: string }> {
  const subject = status === "critical"
    ? "🚨 FarmVault Critical Alert"
    : "⚠️ FarmVault Warning Report";

  const ts = payload.checked_at ?? new Date().toISOString();
  const lines = payload.issues.length
    ? payload.issues.map((i) => `• ${escapeHtml(i.message)}`).join("<br />")
    : "• No specific issue rows (see metadata).";

  const recentRows = recentLogs.length
    ? recentLogs
      .map((r) =>
        `<tr>
          <td style="padding:6px 8px;border:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#374151;">${escapeHtml(
          String(r.created_at ?? ""),
        )}</td>
          <td style="padding:6px 8px;border:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111827;">${escapeHtml(
          String(r.status ?? ""),
        )}</td>
          <td style="padding:6px 8px;border:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111827;">${escapeHtml(
          String(r.message ?? ""),
        )}</td>
        </tr>`
      )
      .join("")
    : `<tr><td colspan="3" style="padding:6px 8px;border:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;">No recent log entries</td></tr>`;

  const recentTable =
    `<p style="margin:16px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;"><strong>Recent log entries</strong></p>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:720px;">` +
    `<thead><tr>` +
    `<th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#374151;">Time</th>` +
    `<th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#374151;">Status</th>` +
    `<th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#374151;">Message</th>` +
    `</tr></thead><tbody>${recentRows}</tbody></table>`;

  const html =
    `<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;"><strong>FarmVault System Health Report</strong></p>` +
    `<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;"><strong>Status:</strong> ${escapeHtml(status.toUpperCase())}</p>` +
    `<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;"><strong>Issues:</strong></p>` +
    `<div style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;">${lines}</div>` +
    recentTable +
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;"><strong>Time:</strong> ${escapeHtml(ts)}</p>`;

  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-farmvault-email`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: gatewayKey,
      Authorization: `Bearer ${gatewayKey}`,
      "X-FarmVault-Email-Secret": internalSecret,
    },
    body: JSON.stringify({
      emailType: "custom_manual",
      to,
      data: {
        subject,
        html,
        category: "announcement",
        showQrCode: false,
      },
      triggeredBy: "system-health-check",
      metadata: {
        source: "system-health-check",
        health_status: status,
        issues: payload.issues,
        metrics: payload.metrics ?? null,
      },
    }),
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  if (!res.ok || body.ok !== true) {
    const detail = typeof body.detail === "string" ? body.detail : typeof body.error === "string"
      ? body.error
      : `HTTP ${res.status}`;
    return { ok: false, error: detail };
  }
  return { ok: true };
}

serveFarmVaultEdge("system-health-check", async (req: Request, _ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const cronSecret = Deno.env.get("SYSTEM_HEALTH_CHECK_SECRET")?.trim();
  const envAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const requestApiKey = req.headers.get("apikey")?.trim() || "";
  // For developer auth checks, never fall back to service-role key.
  const verifyKey = envAnonKey || requestApiKey;
  // For gateway calls to other Edge Functions, anon is preferred; service key is last-resort fallback.
  const gatewayKey = envAnonKey || serviceKey;
  const emailSecret = Deno.env.get("FARMVAULT_EMAIL_INTERNAL_SECRET")?.trim();
  const to = alertEmail();
  const devInbox = getFarmvaultDeveloperInboxEmail();

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const auth = req.headers.get("Authorization")?.trim() ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  let authorized = false;
  if (cronSecret && bearer === cronSecret) {
    authorized = true;
  } else {
    const clerk = resolveClerkBearer(req);
    if (clerk && verifyKey) {
      authorized = await verifyDeveloper(supabaseUrl, verifyKey, clerk);
    }
  }

  if (!authorized) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: raw, error: rpcErr } = await admin.rpc("system_health_evaluate", {
    p_write_log: true,
  });

  if (rpcErr) {
    console.error("[system-health-check] RPC failed", rpcErr.message);
    return json({ error: "Health evaluation failed", detail: rpcErr.message }, 500);
  }

  const payload = parsePayload(raw);
  if (!payload) {
    return json({ error: "Invalid RPC payload" }, 500);
  }

  let emailSent = false;
  let emailError: string | null = null;

  if ((payload.status === "critical" || payload.status === "warning") && emailSecret && (to || devInbox)) {
    const { data: recentRows } = await admin
      .from("system_health_logs")
      .select("created_at,status,message")
      .order("created_at", { ascending: false })
      .limit(5);
    const recentLogs = (recentRows ?? []) as HealthLogEntry[];
    const recipients = [...new Set([to, devInbox].map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean))];
    const errors: string[] = [];
    let sentAny = false;
    for (const recipient of recipients) {
      const r = await sendHealthEmail(
        supabaseUrl,
        gatewayKey,
        emailSecret,
        recipient,
        payload.status as "critical" | "warning",
        payload,
        recentLogs,
      );
      sentAny = sentAny || r.ok;
      if (!r.ok) {
        errors.push(`${recipient}: ${r.error ?? "send failed"}`);
      }
    }
    emailSent = sentAny;
    emailError = errors.length ? errors.join(" | ") : null;
    if (errors.length) {
      console.error("[system-health-check] email failed", emailError);
    }
  } else if (payload.status === "critical" || payload.status === "warning") {
    emailError = "Missing FARMVAULT_EMAIL_INTERNAL_SECRET and/or alert recipients";
    console.warn("[system-health-check]", emailError);
  }

  return json({
    ...payload,
    emailSent,
    emailError,
  });
});
