/**
 * Reconcile stuck M-Pesa STK rows.
 *
 * Phase 0 — Orphan `mpesa_stk_callbacks` rows with no `mpesa_payments` match: STK Query; if paid,
 *   insert missing `mpesa_payments`, then activate when `company_id` can be resolved (FV- ref).
 * Phase 1 — PENDING or PENDING_VERIFICATION rows older than minAgeMinutes: Daraja STK Query; if paid,
 *   update mpesa_payments to SUCCESS, call activate_subscription_from_mpesa_stk + finalizeMpesaStkBilling.
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

function metadataItem(metadata: unknown, name: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const items = (metadata as { Item?: Array<{ Name?: string; Value?: unknown }> }).Item;
  if (!Array.isArray(items)) return null;
  for (const it of items) {
    if (it.Name === name && it.Value != null) return String(it.Value);
  }
  return null;
}

function accountRefFromRawPayload(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const stk = (raw as { Body?: { stkCallback?: { CallbackMetadata?: unknown } } }).Body?.stkCallback;
  if (!stk || typeof stk !== "object") return null;
  const meta = (stk as { CallbackMetadata?: unknown }).CallbackMetadata;
  return metadataItem(meta, "AccountReference") ?? metadataItem(meta, "BillRefNumber");
}

function parseCallbackAmount(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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

  let examined = 0;
  let activated = 0;
  let skipped = 0;
  let errors = 0;
  let stuckSuccessExamined = 0;
  let stuckSuccessActivated = 0;
  let orphanExamined = 0;
  let orphanPaymentsInserted = 0;
  let orphanSubscriptionsActivated = 0;
  let orphanBindingsRepaired = 0;

  const { data: bindRows, error: bindListErr } = await admin
    .from("mpesa_orphan_attempts")
    .select("id, mpesa_payment_id, checkout_request_id")
    .eq("resolved", false)
    .not("mpesa_payment_id", "is", null)
    .not("checkout_request_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (bindListErr) {
    console.error("[mpesa-payment-reconcile] orphan binding list failed", bindListErr.message);
    errors++;
  } else {
    for (const br of bindRows ?? []) {
      const pid = String((br as { mpesa_payment_id?: string }).mpesa_payment_id ?? "").trim();
      const ck = String((br as { checkout_request_id?: string }).checkout_request_id ?? "").trim();
      const bid = String((br as { id?: string }).id ?? "").trim();
      if (!pid || !ck || !bid) {
        skipped++;
        continue;
      }
      const { data: pr } = await admin
        .from("mpesa_payments")
        .select("id, checkout_request_id")
        .eq("id", pid)
        .maybeSingle();
      const curCk = pr && (pr as { checkout_request_id?: string | null }).checkout_request_id != null
        ? String((pr as { checkout_request_id: string | null }).checkout_request_id).trim()
        : "";
      if (!pr) {
        await admin.from("mpesa_orphan_attempts").update({ resolved: true }).eq("id", bid);
        skipped++;
        continue;
      }
      if (curCk !== "") {
        await admin.from("mpesa_orphan_attempts").update({ resolved: true }).eq("id", bid);
        skipped++;
        continue;
      }
      const { error: bindUpdErr } = await admin.from("mpesa_payments").update({
        checkout_request_id: ck,
      }).eq("id", pid);
      await admin.from("payment_reconciliation_log").insert({
        checkout_request_id: ck,
        db_status: "orphan_attempt_bind",
        daraja_result_code: null,
        daraja_result_desc: "bind_checkout_from_orphan_attempts",
        action_taken: bindUpdErr ? "orphan_bind_failed" : "orphan_bind_applied",
      });
      if (bindUpdErr) {
        errors++;
        console.error("[mpesa-payment-reconcile] orphan bind update failed", ck, bindUpdErr.message);
      } else {
        orphanBindingsRepaired++;
        await admin.from("mpesa_orphan_attempts").update({ resolved: true }).eq("id", bid);
      }
    }
  }

  const { data: orphanCallbacks, error: orphanListErr } = await admin.rpc(
    "list_mpesa_stk_callbacks_without_payment",
    { p_limit: limit },
  );

  if (orphanListErr) {
    console.error("[mpesa-payment-reconcile] orphan callback list failed", orphanListErr.message);
    errors++;
  } else {
    const orphans = (orphanCallbacks ?? []) as Array<{
      checkout_request_id: string | null;
      raw_payload: Record<string, unknown> | null;
      mpesa_receipt_number: string | null;
      amount: string | null;
      phone_number: string | null;
    }>;

    for (const ob of orphans) {
      orphanExamined++;
      const checkoutId = String(ob.checkout_request_id ?? "").trim();
      if (!checkoutId) {
        skipped++;
        continue;
      }

      const { data: existsPay } = await admin
        .from("mpesa_payments")
        .select("id")
        .eq("checkout_request_id", checkoutId)
        .maybeSingle();
      if (existsPay) {
        skipped++;
        continue;
      }

      let q: Awaited<ReturnType<typeof queryStkPush>>;
      try {
        q = await queryStkPush(cfg, accessToken, checkoutId);
      } catch (e) {
        errors++;
        console.error("[mpesa-payment-reconcile] orphan STK query threw", checkoutId, e);
        await admin.from("payment_reconciliation_log").insert({
          checkout_request_id: checkoutId,
          db_status: "orphan_callback",
          daraja_result_code: null,
          daraja_result_desc: String(e).slice(0, 500),
          action_taken: "orphan_query_error",
        });
        continue;
      }

      await admin.from("payment_reconciliation_log").insert({
        checkout_request_id: checkoutId,
        db_status: "orphan_callback",
        daraja_result_code: q.resultCode,
        daraja_result_desc: (q.resultDesc || q.responseDescription || "").slice(0, 500),
        action_taken: q.resultCode === 0 ? "orphan_daraja_confirmed_paid" : "orphan_daraja_not_paid",
      });

      if (q.resultCode !== 0) {
        skipped++;
        continue;
      }

      const accountRef = accountRefFromRawPayload(ob.raw_payload);
      let resolvedCompanyId: string | null = null;
      if (accountRef && accountRef.trim() !== "") {
        const { data: cid, error: resErr } = await admin.rpc("try_resolve_company_from_fv_account_ref", {
          p_ref: accountRef,
        });
        if (!resErr && cid != null && String(cid).trim() !== "") {
          resolvedCompanyId = String(cid).trim();
        }
      }

      const paidAt = new Date().toISOString();
      const amountNum = parseCallbackAmount(ob.amount ?? undefined);
      const { error: insErr } = await admin.from("mpesa_payments").insert({
        checkout_request_id: checkoutId,
        company_id: resolvedCompanyId,
        billing_reference: accountRef,
        plan: null,
        billing_cycle: null,
        amount: amountNum,
        phone: ob.phone_number ?? null,
        mpesa_receipt: ob.mpesa_receipt_number ?? null,
        status: "SUCCESS",
        result_code: 0,
        result_desc: "Recovered via mpesa-payment-reconcile (orphan callback + STK Query)".slice(0, 2000),
        paid_at: paidAt,
        subscription_activated: false,
        success_processed: false,
        idempotency_key: null,
      });

      if (insErr) {
        if (insErr.code === "23505") {
          skipped++;
          continue;
        }
        errors++;
        console.error("[mpesa-payment-reconcile] orphan mpesa_payments insert failed", insErr.message);
        continue;
      }

      orphanPaymentsInserted++;

      if (resolvedCompanyId) {
        const { data: subPayId, error: actErr } = await admin.rpc("activate_subscription_from_mpesa_stk", {
          _checkout_request_id: checkoutId,
        });
        if (actErr) {
          errors++;
          console.error("[mpesa-payment-reconcile] orphan activate failed", checkoutId, actErr.message);
        } else {
          orphanSubscriptionsActivated++;
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
              companyId: resolvedCompanyId,
              subscriptionPaymentId: payId,
              source: "mpesa_payment_reconcile_orphan_callback",
            });
          }
        }
      }

      await admin
        .from("payment_webhook_failures")
        .update({ resolved_at: paidAt })
        .eq("checkout_request_id", checkoutId)
        .is("resolved_at", null);
    }
  }

  const { data: pendingRows, error: qErr } = await admin
    .from("mpesa_payments")
    .select("id, checkout_request_id, company_id, status, created_at, reconcile_attempts")
    .in("status", ["PENDING", "PENDING_VERIFICATION"])
    .not("checkout_request_id", "is", null)
    .or("reconcile_attempts.is.null,reconcile_attempts.lt.3")
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
    reconcile_attempts?: number | null;
  }>;

  for (const row of rows) {
    examined++;
    const checkoutId = String(row.checkout_request_id ?? "").trim();
    if (!checkoutId) {
      skipped++;
      continue;
    }

    const attempts = Number(row.reconcile_attempts ?? 0);
    if (Number.isFinite(attempts) && attempts >= 3) {
      await admin.from("payment_reconciliation_log").insert({
        checkout_request_id: checkoutId,
        db_status: row.status,
        daraja_result_code: null,
        daraja_result_desc: "max_auto_reconcile_attempts",
        action_taken: "pending_skip_max_retries",
      });
      skipped++;
      continue;
    }

    await admin.from("mpesa_payments").update({
      reconcile_attempts: attempts + 1,
    }).eq("id", row.id);

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
    .select(
      "id, checkout_request_id, company_id, status, result_code, subscription_activated, created_at, reconcile_attempts",
    )
    .eq("subscription_activated", false)
    .eq("status", "SUCCESS")
    .not("company_id", "is", null)
    .not("checkout_request_id", "is", null)
    .or("reconcile_attempts.is.null,reconcile_attempts.lt.3")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (stuckErr) {
    console.error("[mpesa-payment-reconcile] stuck-success select failed", stuckErr.message);
  } else {
    const stuck = (stuckRows ?? []) as Array<{
      id: string;
      checkout_request_id: string;
      company_id: string | null;
      reconcile_attempts?: number | null;
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

      const sAttempts = Number(row.reconcile_attempts ?? 0);
      if (Number.isFinite(sAttempts) && sAttempts >= 3) {
        await admin.from("payment_reconciliation_log").insert({
          checkout_request_id: checkoutId,
          db_status: "SUCCESS_UNACTIVATED",
          daraja_result_code: null,
          daraja_result_desc: "max_auto_reconcile_attempts",
          action_taken: "stuck_success_skip_max_retries",
        });
        skipped++;
        continue;
      }

      await admin.from("mpesa_payments").update({
        reconcile_attempts: sAttempts + 1,
      }).eq("id", row.id);

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

  const scanned =
    orphanExamined +
    examined +
    stuckSuccessExamined +
    (bindListErr ? 0 : (bindRows?.length ?? 0));
  const fixed =
    activated +
    stuckSuccessActivated +
    orphanPaymentsInserted +
    orphanSubscriptionsActivated +
    orphanBindingsRepaired;

  await admin.from("payment_reconciliation_log").insert({
    checkout_request_id: null,
    db_status: "reconcile_job",
    daraja_result_code: null,
    daraja_result_desc: JSON.stringify({
      scanned,
      fixed,
      failed: errors,
      minAgeMinutes,
      limit,
    }).slice(0, 500),
    action_taken: "reconcile_job_completed",
  });

  return json({
    ok: true,
    scanned,
    fixed,
    failed: errors,
    examined,
    activated,
    skipped,
    errors,
    stuckSuccessExamined,
    stuckSuccessActivated,
    orphanExamined,
    orphanPaymentsInserted,
    orphanSubscriptionsActivated,
    orphanBindingsRepaired,
    minAgeMinutes,
    limit,
  });
});
