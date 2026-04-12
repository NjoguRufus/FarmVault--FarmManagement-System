/**
 * Server-gated emergency workspace access (replaces VITE_EMERGENCY_* secrets in the client bundle).
 *
 * POST JSON: { "email": string, "passphrase": string }
 *
 * Secrets (Supabase Edge → Secrets):
 *   EMERGENCY_ACCESS_ENABLED     — "true" | "1" to allow this function to issue sessions
 *   EMERGENCY_ACCESS_SECRET      — shared passphrase (high entropy); compared to body.passphrase
 *   EMERGENCY_ALLOWED_EMAILS     — comma-separated allowlist (lowercase compared)
 *   EMERGENCY_SESSION_USER_ID    — Clerk user id to impersonate for RLS-aligned flows
 *   EMERGENCY_SESSION_COMPANY_ID — Active company UUID
 *   EMERGENCY_SESSION_ROLE       — optional; default company_admin
 *
 * Deploy: supabase functions deploy emergency-access --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveFarmVaultEdge, type FarmVaultEdgeContext } from "../_shared/withEdgeLogging.ts";

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

function timingSafeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function normalizeEmailList(raw: string | undefined): Set<string> {
  const s = new Set<string>();
  if (!raw) return s;
  for (const part of raw.split(",")) {
    const e = part.trim().toLowerCase();
    if (e) s.add(e);
  }
  return s;
}

async function logAttempt(
  admin: ReturnType<typeof createClient>,
  row: {
    email_normalized: string | null;
    success: boolean;
    error_code: string | null;
    edge_request_id: string | null;
  },
) {
  try {
    await admin.from("emergency_access_attempts").insert(row);
  } catch (e) {
    console.error("[emergency-access] audit insert failed", e);
  }
}

serveFarmVaultEdge("emergency-access", async (req: Request, ctx: FarmVaultEdgeContext) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "Server misconfiguration" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const enabledRaw = (Deno.env.get("EMERGENCY_ACCESS_ENABLED") ?? "").trim().toLowerCase();
  const enabled = enabledRaw === "true" || enabledRaw === "1";
  if (!enabled) {
    await logAttempt(admin, {
      email_normalized: null,
      success: false,
      error_code: "disabled",
      edge_request_id: ctx.requestId,
    });
    return json({ ok: false, error: "Emergency access is not enabled for this deployment." }, 403);
  }

  let body: { email?: string; passphrase?: string };
  try {
    body = (await req.json()) as { email?: string; passphrase?: string };
  } catch {
    await logAttempt(admin, {
      email_normalized: null,
      success: false,
      error_code: "invalid_json",
      edge_request_id: ctx.requestId,
    });
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const passphrase = String(body.passphrase ?? "");

  const expectedSecret = (Deno.env.get("EMERGENCY_ACCESS_SECRET") ?? "").trim();
  const allow = normalizeEmailList(Deno.env.get("EMERGENCY_ALLOWED_EMAILS"));
  const userId = (Deno.env.get("EMERGENCY_SESSION_USER_ID") ?? "").trim();
  const companyId = (Deno.env.get("EMERGENCY_SESSION_COMPANY_ID") ?? "").trim();
  const roleRaw = (Deno.env.get("EMERGENCY_SESSION_ROLE") ?? "company_admin").trim() || "company_admin";

  if (!expectedSecret || allow.size === 0 || !userId || !companyId) {
    console.error("[emergency-access] missing EMERGENCY_ACCESS_SECRET, allowlist, or session ids");
    await logAttempt(admin, {
      email_normalized: email || null,
      success: false,
      error_code: "server_misconfigured",
      edge_request_id: ctx.requestId,
    });
    return json({ ok: false, error: "Emergency access is not fully configured." }, 500);
  }

  if (!email || !allow.has(email)) {
    await logAttempt(admin, {
      email_normalized: email || null,
      success: false,
      error_code: "email_not_allowed",
      edge_request_id: ctx.requestId,
    });
    return json({ ok: false, error: "Access not allowed for this email." }, 403);
  }

  if (!timingSafeEqual(passphrase, expectedSecret)) {
    await logAttempt(admin, {
      email_normalized: email,
      success: false,
      error_code: "invalid_passphrase",
      edge_request_id: ctx.requestId,
    });
    return json({ ok: false, error: "Invalid credentials." }, 403);
  }

  const issuedAt = new Date().toISOString();
  await logAttempt(admin, {
    email_normalized: email,
    success: true,
    error_code: null,
    edge_request_id: ctx.requestId,
  });

  const role =
    roleRaw === "company_admin" || roleRaw === "company-admin" ? "company_admin" : roleRaw;

  return json({
    ok: true,
    session: {
      email,
      userId,
      companyId,
      role,
      issuedAt,
      version: 2 as const,
    },
  });
});
