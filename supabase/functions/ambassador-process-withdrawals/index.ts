/**
 * Payout pipeline step: promote held commissions to available-for-payout balance after the configured delay.
 * Payout request / review continues to run through Postgres (`ambassador_request_withdrawal`,
 * `dev_review_ambassador_withdrawal`).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AMBASSADOR_OPS_SECRET (Bearer).
 *
 * Deploy: npx supabase functions deploy ambassador-process-withdrawals --no-verify-jwt
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

serveFarmVaultEdge("ambassador-process-withdrawals", async (req) => {
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

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);
  const { data, error } = await admin.rpc("promote_ambassador_commission_releases");

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse(data ?? { ok: false, error: "no_response" });
});
