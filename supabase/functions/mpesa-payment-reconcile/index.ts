/**
 * Reconcile stuck M-Pesa STK rows.
 *
 * Phase 1 — PENDING rows older than minAgeMinutes: Daraja STK Query; if paid, update mpesa_payments,
 *   call activate_subscription_from_mpesa_stk + finalizeMpesaStkBilling.
 * Phase 2 — SUCCESS + subscription_activated=false (e.g. callback deferred activation after STK Query gate):
 *   call activate_subscription_from_mpesa_stk + finalize without re-querying Daraja.
 *
 * Also marks payment_webhook_failures resolved when checkout succeeds.
 *
 * Auth: Authorization: Bearer <MPESA_RECONCILE_SECRET>
 *
 * POST JSON (optional): { "minAgeMinutes": 3, "limit": 40 }
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MPESA_RECONCILE_SECRET,
 *          MPESA_* (same as STK push — consumer key/secret, passkey, shortcode, callback env for loadMpesaConfig)
 *
 * Deploy: supabase functions deploy mpesa-payment-reconcile --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadMpesaConfig } from "../_shared/mpesaConfig.ts";
import { fetchMpesaAccessToken, queryStkPush } from "../_shared/mpesaDaraja.ts";
import { finalizeMpesaStkBilling } from "../_shared/finalizeMpesaStkBilling.ts";
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

serveFarmVaultEdge("mpesa-payment-reconcile", async (req: Request, _ctx) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const secret = (Deno.env.get("MPESA_RECONCILE_SECRET") ?? "").trim();
  const auth = req.headers.get("Authorization")?.trim() ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!secret || bearer !== secret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "Server misconfiguration" }, 500);
  }

  let minAgeMinutes = 3;
  let limit = 40;
  try {
    const b = await req.json() as { minAgeMinutes?: number; limit?: number };
    if (Number.isFinite(b.minAgeMinutes) && b.minAgeMinutes! >= 1) minAgeMinutes = Math.floor(b.minAgeMinutes!);
    if (Number.isFinite(b.limit) && b.limit! >= 1) limit = Math.min(200, Math.floor(b.limit!));
  } catch {
    // empty body OK
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  const appUrl = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const cfg = loadMpesaConfig();
  let accessToken: string;
  try {
    accessToken = await fetchMpesaAccessToken(cfg);
  } catch (e) {
    console.error("[mpesa-payment-reconcile] oauth failed", e);
    return json({ ok: false, error: "M-Pesa OAuth failed" }, 500);
  }

  const cutoff = new Date(Date.now() - minAgeMinutes * 60_000).toISOString();

  const { data: pendingRows, error: qErr } = await admin
    .from("mpesa_payments")
    .select("id, checkout_request_id, company_id, status, created_at")
    .eq("status", "PENDING")
    .not("checkout_request_id", "is", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (qErr) {
    console.error("[mpesa-payment-reconcile] select failed", qErr.message);
    return json({ ok: false, error: qErr.message }, 500);
  }

  const rows = (pendingRows ?? []) as Array<{
    id: string;
    checkout_request_id: string;
    company_id: string | null;
    status: string;
  }>;

  let examined = 0;
  let activated = 0;
  let skipped = 0;
  let errors = 0;
  let stuckSuccessExamined = 0;
  let stuckSuccessActivated = 0;

  for (const row of rows) {
    examined++;
    const checkoutId = String(row.checkout_request_id ?? "").trim();
    if (!checkoutId) {
      skipped++;
      continue;
    }

    let q: Awaited<ReturnType<typeof queryStkPush>>;
    try {
      q = await queryStkPush(cfg, accessToken, checkoutId);
    } catch (e) {
      errors++;
      console.error("[mpesa-payment-reconcile] query threw", checkoutId, e);
      await admin.from("payment_reconciliation_log").insert({
        checkout_request_id: checkoutId,
        db_status: "PENDING",
        daraja_result_code: null,
        daraja_result_desc: String(e),
        action_taken: "query_error",
      });
      continue;
    }

    await admin.from("payment_reconciliation_log").insert({
      checkout_request_id: checkoutId,
      db_status: "PENDING",
      daraja_result_code: q.resultCode,
      daraja_result_desc: (q.resultDesc || q.responseDescription || "").slice(0, 500),
      action_taken: q.resultCode === 0 ? "daraja_confirmed_paid" : "daraja_not_paid",
    });

    if (q.resultCode !== 0) {
      skipped++;
      continue;
    }

    const paidAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("mpesa_payments")
      .update({
        status: "SUCCESS",
        result_code: 0,
        result_desc: (q.resultDesc || "Confirmed via STK Query").slice(0, 2000),
        paid_at: paidAt,
      })
      .eq("checkout_request_id", checkoutId);

    if (updErr) {
      errors++;
      console.error("[mpesa-payment-reconcile] mpesa_payments update failed", updErr.message);
      continue;
    }

    const { data: subPayId, error: actErr } = await admin.rpc("activate_subscription_from_mpesa_stk", {
      _checkout_request_id: checkoutId,
    });

    if (actErr) {
      errors++;
      console.error("[mpesa-payment-reconcile] activate failed", checkoutId, actErr.message);
    } else {
      activated++;
      const payId =
        subPayId != null && String(subPayId).trim() !== "" ? String(subPayId).trim() : null;
      const companyIdForSuccess =
        row.company_id != null && String(row.company_id).trim() !== ""
          ? String(row.company_id).trim()
          : "";
      if (payId && companyIdForSuccess) {
        await finalizeMpesaStkBilling({
          admin,
          supabaseUrl,
          serviceKey,
          anonKey: anonKey ?? undefined,
          resendKey,
          appUrl,
          companyId: companyIdForSuccess,
          subscriptionPaymentId: payId,
          source: "mpesa_payment_reconcile",
        });
      }
    }

    await admin
      .from("payment_webhook_failures")
      .update({ resolved_at: paidAt })
      .eq("checkout_request_id", checkoutId)
      .is("resolved_at", null);
  }

  // Phase 2: DB shows paid (SUCCESS / result_code=0) but subscription never activated — run RPC without Daraja query.
  const { data: stuckRows, error: stuckErr } = await admin
    .from("mpesa_payments")
    .select("id, checkout_request_id, company_id, status, result_code, subscription_activated, created_at")
    .eq("subscription_activated", false)
    .eq("status", "SUCCESS")
    .not("company_id", "is", null)
    .not("checkout_request_id", "is", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (stuckErr) {
    console.error("[mpesa-payment-reconcile] stuck-success select failed", stuckErr.message);
  } else {
    const stuck = (stuckRows ?? []) as Array<{
      checkout_request_id: string;
      company_id: string | null;
    }>;
    for (const row of stuck) {
      stuckSuccessExamined++;
      const checkoutId = String(row.checkout_request_id ?? "").trim();
      const companyIdForSuccess =
        row.company_id != null && String(row.company_id).trim() !== ""
          ? String(row.company_id).trim()
          : "";
      if (!checkoutId || !companyIdForSuccess) {
        skipped++;
        continue;
      }

      await admin.from("payment_reconciliation_log").insert({
        checkout_request_id: checkoutId,
        db_status: "SUCCESS_UNACTIVATED",
        daraja_result_code: null,
        daraja_result_desc: "retry_activate_subscription",
        action_taken: "stuck_success_row",
      });

      const { data: subPayId, error: actErr } = await admin.rpc("activate_subscription_from_mpesa_stk", {
        _checkout_request_id: checkoutId,
      });

      if (actErr) {
        errors++;
        console.error("[mpesa-payment-reconcile] stuck activate failed", checkoutId, actErr.message);
      } else {
        stuckSuccessActivated++;
        const payId =
          subPayId != null && String(subPayId).trim() !== "" ? String(subPayId).trim() : null;
        if (payId) {
          await finalizeMpesaStkBilling({
            admin,
            supabaseUrl,
            serviceKey,
            anonKey: anonKey ?? undefined,
            resendKey,
            appUrl,
            companyId: companyIdForSuccess,
            subscriptionPaymentId: payId,
            source: "mpesa_payment_reconcile_stuck_success",
          });
        }
      }

      const paidAt = new Date().toISOString();
      await admin
        .from("payment_webhook_failures")
        .update({ resolved_at: paidAt })
        .eq("checkout_request_id", checkoutId)
        .is("resolved_at", null);
    }
  }

  return json({
    ok: true,
    examined,
    activated,
    skipped,
    errors,
    stuckSuccessExamined,
    stuckSuccessActivated,
    minAgeMinutes,
    limit,
  });
});
