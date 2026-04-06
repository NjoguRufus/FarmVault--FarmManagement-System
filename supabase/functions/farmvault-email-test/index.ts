// Send one-off test messages through Resend for each FarmVault sender (onboarding / billing / alerts / developer / support).
//
// Secrets: RESEND_API_KEY, FARMVAULT_EMAIL_TEST_SECRET (required).
// Optional: FARMVAULT_EMAIL_TEST_TO — default recipient if body omits `to`.
// Per-sender overrides: same as _shared/farmvaultEmailFrom.ts (FARMVAULT_EMAIL_FROM_*).
//
// Auth: header `x-farmvault-email-test-secret: <FARMVAULT_EMAIL_TEST_SECRET>`
//
// POST JSON (body may be empty if FARMVAULT_EMAIL_TEST_TO is set):
//   { "to": "you@example.com", "kind": "onboarding" | "billing" | "alerts" | "developer" | "support" | "all" }
//   `kind` defaults to "all".
// Windows PowerShell: native curl often drops `-d` bodies; use Invoke-RestMethod (see comment at bottom) or --data-binary @file.
//
// Deploy: npx supabase functions deploy farmvault-email-test --no-verify-jwt

import {
  getFarmVaultEmailFrom,
  type FarmVaultEmailSenderKey,
} from "../_shared/farmvaultEmailFrom.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-farmvault-email-test-secret",
};

const ALL_KINDS: FarmVaultEmailSenderKey[] = ["onboarding", "billing", "alerts", "developer", "support"];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("FARMVAULT_EMAIL_TEST_SECRET")?.trim();
  const provided = req.headers.get("x-farmvault-email-test-secret")?.trim();
  if (!secret || !provided || secret !== provided) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) {
    return jsonResponse({ error: "Server misconfiguration", detail: "RESEND_API_KEY missing" }, 500);
  }

  const text = await req.text();
  const trimmed = text.trim();
  let raw: unknown = {};
  if (trimmed.length > 0) {
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return jsonResponse(
        { error: "Invalid JSON", detail: "Body must be JSON or empty. On PowerShell use Invoke-RestMethod or --data-binary @body.json" },
        400,
      );
    }
  }
  const body = raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
  if (!body) return jsonResponse({ error: "Invalid payload" }, 400);

  const toRaw =
    typeof body.to === "string" ? body.to.trim() : Deno.env.get("FARMVAULT_EMAIL_TEST_TO")?.trim() ?? "";
  if (!toRaw || !EMAIL_RE.test(toRaw)) {
    return jsonResponse(
      { error: "Invalid payload", detail: "Provide `to` in JSON or set FARMVAULT_EMAIL_TEST_TO" },
      400,
    );
  }

  const kindRaw = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "all";
  const kinds: FarmVaultEmailSenderKey[] =
    kindRaw === "all"
      ? [...ALL_KINDS]
      : (ALL_KINDS as readonly string[]).includes(kindRaw)
        ? [kindRaw as FarmVaultEmailSenderKey]
        : [];

  if (kinds.length === 0) {
    return jsonResponse({ error: "Invalid kind", detail: "Use onboarding | billing | alerts | developer | support | all" }, 400);
  }

  const results: { kind: FarmVaultEmailSenderKey; ok: boolean; id?: string; error?: string }[] = [];

  for (const k of kinds) {
    const from = getFarmVaultEmailFrom(k);
    const subject = `[FarmVault test] ${k} sender`;
    const html = `<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111827;">This is a test email using the <strong>${escapeHtml(
      k,
    )}</strong> sender.</p><p style="font-family:system-ui,sans-serif;font-size:14px;color:#374151;"><strong>From:</strong> ${escapeHtml(
      from,
    )}</p><p style="font-family:system-ui,sans-serif;font-size:14px;color:#6b7280;">Reply to this message to confirm Cloudflare Email Routing delivers to your inbox.</p>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [toRaw],
          subject,
          html,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          typeof json.message === "string" ? json.message : `HTTP ${res.status}`;
        results.push({ kind: k, ok: false, error: msg });
      } else {
        const id = typeof json.id === "string" ? json.id : undefined;
        results.push({ kind: k, ok: true, id });
      }
    } catch (e) {
      results.push({
        kind: k,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return jsonResponse({ ok: allOk, to: toRaw, results }, 200);
});

/*
PowerShell (reliable body):
  $h = @{ "Content-Type"="application/json"; "x-farmvault-email-test-secret"="<SECRET>" }
  Invoke-RestMethod -Uri "https://<ref>.supabase.co/functions/v1/farmvault-email-test" -Method Post -Headers $h -Body '{"to":"farmvaultke@gmail.com","kind":"all"}'

Or file body:
  Set-Content -Path .\body.json -Value '{"to":"farmvaultke@gmail.com","kind":"all"}' -Encoding utf8 -NoNewline
  curl.exe -sS ... --data-binary "@body.json"
*/
