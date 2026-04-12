/**
 * Automated launch monitoring: collect payment health metrics, classify, optionally email developer.
 *
 * Invoked by pg_cron (hourly) or manually with Bearer LAUNCH_MONITORING_REPORT_SECRET.
 *
 * Email: POST to existing `send-farmvault-email` with `X-FarmVault-Email-Secret` (FARMVAULT_EMAIL_INTERNAL_SECRET).
 *
 * Rules:
 *   - CRITICAL if orphan_callbacks > 0
 *   - else WARNING if stuck_pending > 3 OR failed_24h > 5
 *   - else HEALTHY
 *   - HEALTHY digest: send at most once per 12h (any prior sent email in launch_monitor_logs)
 *   - WARNING/CRITICAL: always attempt send when this function runs
 *
 * Secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   LAUNCH_MONITORING_REPORT_SECRET (cron Bearer),
 *   FARMVAULT_EMAIL_INTERNAL_SECRET (must match send-farmvault-email),
 *   LAUNCH_MONITORING_ALERT_EMAIL (recipient),
 *   SUPABASE_ANON_KEY (optional; falls back to service role for Functions gateway headers)
 *
 * Deploy: npx supabase functions deploy launch-monitoring-report --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Metrics = {
  orphan_callbacks: number;
  stuck_pending_payments: number;
  failed_payments_24h: number;
  pending_manual_approvals: number;
};

type Classified = "HEALTHY" | "WARNING" | "CRITICAL";

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseMetrics(raw: unknown): Metrics {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    orphan_callbacks: num(o.orphan_callbacks),
    stuck_pending_payments: num(o.stuck_pending_payments),
    failed_payments_24h: num(o.failed_payments_24h),
    pending_manual_approvals: num(o.pending_manual_approvals),
  };
}

function classify(m: Metrics): Classified {
  if (m.orphan_callbacks > 0) return "CRITICAL";
  if (m.stuck_pending_payments > 3 || m.failed_payments_24h > 5) return "WARNING";
  return "HEALTHY";
}

function buildEmail(
  status: Classified,
  m: Metrics,
): { subject: string; html: string } {
  const oc = escapeHtml(String(m.orphan_callbacks));
  const st = escapeHtml(String(m.stuck_pending_payments));
  const fd = escapeHtml(String(m.failed_payments_24h));
  const ma = escapeHtml(String(m.pending_manual_approvals));

  const listStyle =
    "margin:0 0 10px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:1.7;color:#1f2937;";
  const p = (inner: string) =>
    `<p style="margin:0 0 14px 0;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:1.7;color:#1f2937;">${inner}</p>`;

  if (status === "CRITICAL") {
    return {
      subject: "🚨 FarmVault CRITICAL ISSUE",
      html: [
        p(`<strong>FarmVault status:</strong> CRITICAL`),
        `<ul style="padding-left:20px;${listStyle}">`,
        `<li><strong>Orphan callbacks:</strong> ${oc} — STK callbacks with no matching <code>mpesa_payments</code> row (possible paid-but-unrecorded pipeline).</li>`,
        `<li><strong>Stuck PENDING (&gt;10 min):</strong> ${st}</li>`,
        `<li><strong>Failed STK (24h):</strong> ${fd}</li>`,
        `<li><strong>Manual approvals pending:</strong> ${ma}</li>`,
        `</ul>`,
        p("<strong>Immediate action recommended</strong> — check Developer billing console and <code>mpesa-payment-reconcile</code>."),
      ].join(""),
    };
  }

  if (status === "WARNING") {
    return {
      subject: "⚠️ FarmVault Warning Detected",
      html: [
        p(`<strong>FarmVault status:</strong> WARNING`),
        `<ul style="padding-left:20px;${listStyle}">`,
        `<li><strong>Stuck PENDING (&gt;10 min):</strong> ${st} ${m.stuck_pending_payments > 3 ? "(above threshold 3)" : ""}</li>`,
        `<li><strong>Failed STK (24h):</strong> ${fd} ${m.failed_payments_24h > 5 ? "(above threshold 5)" : ""}</li>`,
        `<li><strong>Orphan callbacks:</strong> ${oc}</li>`,
        `<li><strong>Manual approvals pending:</strong> ${ma}</li>`,
        `</ul>`,
        p("Review payment pipeline and reconciliation logs when convenient."),
      ].join(""),
    };
  }

  return {
    subject: "✅ FarmVault System Healthy",
    html: [
      p(`<strong>FarmVault status:</strong> HEALTHY`),
      `<ul style="padding-left:20px;${listStyle}">`,
      `<li>No orphan STK callbacks (count: ${oc}).</li>`,
      `<li>Stuck PENDING (&gt;10 min) within threshold (count: ${st}).</li>`,
      `<li>Failed STK (24h) within threshold (count: ${fd}).</li>`,
      `<li>Manual approvals pending: ${ma}.</li>`,
      `</ul>`,
      p("Scheduled health summary — payments operating within configured thresholds."),
    ].join(""),
  };
}

function authorizeCron(req: Request): boolean {
  const expected = Deno.env.get("LAUNCH_MONITORING_REPORT_SECRET")?.trim();
  if (!expected) return false;
  const auth = req.headers.get("Authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return bearer === expected;
}

serveFarmVaultEdge("launch-monitoring-report", async (req: Request, _ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  if (!authorizeCron(req)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const alertTo = Deno.env.get("LAUNCH_MONITORING_ALERT_EMAIL")?.trim().toLowerCase();
  const emailInternal = Deno.env.get("FARMVAULT_EMAIL_INTERNAL_SECRET")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || serviceKey;

  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (!alertTo || !EMAIL_RE.test(alertTo)) {
    return json({ ok: false, error: "Missing or invalid LAUNCH_MONITORING_ALERT_EMAIL" }, 500);
  }
  if (!emailInternal) {
    return json({ ok: false, error: "Missing FARMVAULT_EMAIL_INTERNAL_SECRET" }, 500);
  }
  if (!anonKey) {
    return json({ ok: false, error: "Missing gateway key (SUPABASE_ANON_KEY or service role)" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rawMetrics, error: rpcErr } = await admin.rpc("launch_monitoring_collect_metrics");
  if (rpcErr) {
    console.error("[launch-monitoring-report] collect metrics failed", rpcErr.message);
    return json({ ok: false, error: "Metrics RPC failed", detail: rpcErr.message }, 500);
  }

  const metrics = parseMetrics(rawMetrics);
  const status = classify(metrics);

  const { data: lastSentRow } = await admin
    .from("launch_monitor_logs")
    .select("created_at")
    .eq("email_sent", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSentMs = lastSentRow?.created_at
    ? new Date(String(lastSentRow.created_at)).getTime()
    : 0;
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  const healthyThrottle =
    status === "HEALTHY" && lastSentMs > 0 && (Date.now() - lastSentMs) < twelveHoursMs;

  let emailSent = false;
  let skipReason: string | null = healthyThrottle
    ? "healthy_digest_throttled_12h"
    : null;
  let sendError: string | null = null;

  if (!healthyThrottle) {
    const { subject, html } = buildEmail(status, metrics);
    const sendUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-farmvault-email`;
    try {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "X-FarmVault-Email-Secret": emailInternal,
        },
        body: JSON.stringify({
          emailType: "custom_manual",
          to: alertTo,
          data: {
            subject,
            html,
            category: "announcement",
            showQrCode: false,
          },
          triggeredBy: "launch-monitoring-report",
          metadata: {
            source: "launch-monitoring-report",
            status,
            metrics,
          },
        }),
      });
      const bodyText = await res.text().catch(() => "");
      let parsed: Record<string, unknown> = {};
      if (bodyText.trim()) {
        try {
          parsed = JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
          parsed = { raw: bodyText.slice(0, 500) };
        }
      }
      if (!res.ok || parsed.ok !== true) {
        sendError = typeof parsed.detail === "string"
          ? parsed.detail
          : typeof parsed.error === "string"
          ? parsed.error
          : `HTTP ${res.status}`;
        console.error("[launch-monitoring-report] send-farmvault-email failed", sendError, parsed);
      } else {
        emailSent = true;
      }
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e);
      console.error("[launch-monitoring-report] send fetch error", sendError);
    }
  }

  const logMetrics = {
    ...metrics,
    classified: status,
    skip_reason: skipReason,
    send_error: sendError,
  };

  const { error: insErr } = await admin.from("launch_monitor_logs").insert({
    status,
    metrics: logMetrics,
    email_sent: emailSent,
  });

  if (insErr) {
    console.error("[launch-monitoring-report] log insert failed", insErr.message);
    return json(
      {
        ok: false,
        error: "Failed to write launch_monitor_logs",
        detail: insErr.message,
        classified: status,
        metrics,
        emailSent,
      },
      500,
    );
  }

  return json({
    ok: true,
    classified: status,
    metrics,
    emailSent,
    skipped: !!healthyThrottle,
    skipReason,
    sendError,
  });
});
