/**
 * Operator / cron repair path: award KES 600 farmer bonus after a verified subscription payment.
 * Normal production flow already calls `award_subscription_commission` from `handleSuccessfulPayment`.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AMBASSADOR_OPS_SECRET (Bearer).
 * Body JSON: { "company_id": "uuid", "receipt_number": "text" }
 *   OR { "subscription_payment_id": "uuid" } (uses transaction_code or synthetic receipt).
 *
 * Deploy: npx supabase functions deploy ambassador-handle-payment-success --no-verify-jwt
 */
import { createServiceRoleSupabaseClient } from "../_shared/supabaseAdmin.ts";
import { EDGE_FUNCTION_CORS_HEADERS } from "../_shared/edgeCors.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function receiptFromPaymentRow(row: Record<string, unknown>, paymentId: string): string {
  const tx = typeof row.transaction_code === "string" ? row.transaction_code.trim() : "";
  if (tx) return tx;
  return `subscription_payment:${paymentId.trim()}`;
}

serveFarmVaultEdge("ambassador-handle-payment-success", async (req) => {
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const admin = createServiceRoleSupabaseClient(supabaseUrl, serviceKey);

  let companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
  let receipt = typeof body.receipt_number === "string" ? body.receipt_number.trim() : "";
  const subPayId = typeof body.subscription_payment_id === "string" ? body.subscription_payment_id.trim() : "";

  if (subPayId) {
    if (!UUID_RE.test(subPayId)) {
      return jsonResponse({ ok: false, error: "invalid_subscription_payment_id" }, 400);
    }
    const { data: pay, error: payErr } = await admin
      .from("subscription_payments")
      .select("company_id,transaction_code,status")
      .eq("id", subPayId)
      .maybeSingle();
    if (payErr || !pay) {
      return jsonResponse({ ok: false, error: "payment_not_found" }, 404);
    }
    const row = pay as Record<string, unknown>;
    companyId = String(row.company_id ?? "").trim();
    receipt = receiptFromPaymentRow(row, subPayId);
    const st = String(row.status ?? "").toLowerCase();
    if (st !== "approved") {
      return jsonResponse({ ok: false, error: "payment_not_approved" }, 412);
    }
  }

  if (!UUID_RE.test(companyId) || !receipt) {
    return jsonResponse({ ok: false, error: "company_id_and_receipt_required" }, 400);
  }

  const { data, error } = await admin.rpc("award_subscription_commission", {
    p_company_id: companyId,
    p_receipt_number: receipt,
  });

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse(data ?? { ok: false, error: "no_response" });
});
