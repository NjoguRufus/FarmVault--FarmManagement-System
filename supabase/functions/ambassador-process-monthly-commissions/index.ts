/**
 * Monthly ambassador commission job: inserts KES 500/month per eligible active farmer
 * and runs release promotion (locked → available after hold).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AMBASSADOR_OPS_SECRET (Bearer).
 * Optional body: { "anchor": "2026-04-15T00:00:00Z" } for testing (ISO timestamp).
 *
 * Deploy: npx supabase functions deploy ambassador-process-monthly-commissions --no-verify-jwt
 */
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";
import { EDGE_FUNCTION_CORS_HEADERS } from "../_shared/edgeCors.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...EDGE_FUNCTION_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function authorize(req: Request): boolean {
  const expected = Deno.env.get("AMBASSADOR_OPS_SECRET")?.trim();
  if (!expected) return false;
  const auth = req.headers.get("Authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return bearer === expected;
}

serveFarmVaultEdge("ambassador-process-monthly-commissions", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: EDGE_FUNCTION_CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }
  if (!authorize(req)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "server_misconfigured" }, 500);
  }

  let anchor: string | undefined;
  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof b.anchor === "string" && b.anchor.trim()) anchor = b.anchor.trim();
  } catch {
    /* empty body */
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const { data, error } = await admin.rpc(
    "process_ambassador_monthly_commissions",
    anchor ? { p_anchor: anchor } : {},
  );

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse(data ?? { ok: false, error: "no_response" });
});
