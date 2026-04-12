// M-Pesa STK callback — Daraja posts here (set MPESA_CALLBACK_URL in Edge secrets to this function’s public URL).
// Same URL for sandbox and production apps in the Safaricom portal.
// Persists callback rows to public.mpesa_stk_callbacks (service_role).
// Deploy: supabase functions deploy mpesa-stk-callback --no-verify-jwt
//
// Note: Path `/api/mpesa/callback` is not hosted on Supabase Edge; use your function URL or reverse-proxy
// `/api/mpesa/callback` → `https://<ref>.supabase.co/functions/v1/mpesa-stk-callback` if needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readMpesaEnvMode, loadMpesaConfig } from "../_shared/mpesaConfig.ts";
import { finalizeMpesaStkBilling } from "../_shared/finalizeMpesaStkBilling.ts";
import { insertPaymentWebhookFailure } from "../_shared/paymentWebhookFailure.ts";
import { fetchMpesaAccessToken, queryStkPush } from "../_shared/mpesaDaraja.ts";
import { serveFarmVaultEdge } from "../_shared/withEdgeLogging.ts";

function metadataItem(metadata: unknown, name: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const items = (metadata as { Item?: Array<{ Name?: string; Value?: unknown }> }).Item;
  if (!Array.isArray(items)) return null;
  for (const it of items) {
    if (it.Name === name && it.Value != null) return String(it.Value);
  }
  return null;
}

function parseCallbackAmount(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function accountRefFromRawPayload(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const stk = (raw as { Body?: { stkCallback?: { CallbackMetadata?: unknown } } }).Body?.stkCallback;
  if (!stk || typeof stk !== "object") return null;
  const meta = (stk as { CallbackMetadata?: unknown }).CallbackMetadata;
  return metadataItem(meta, "AccountReference") ?? metadataItem(meta, "BillRefNumber");
}

/** Belt-and-suspenders: in production, confirm success with Daraja STK Query before activating subscription. */
function shouldVerifyStkSuccessWithQuery(): boolean {
  const flag = (Deno.env.get("MPESA_VERIFY_SUCCESS_WITH_STK_QUERY") ?? "").trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return readMpesaEnvMode() === "production";
}

/** Escape hatch only: if STK Query throws, still trust callback ResultCode=0 (default false). */
function trustCallbackWhenStkQueryFails(): boolean {
  const v = (Deno.env.get("MPESA_TRUST_CALLBACK_WHEN_STK_QUERY_FAILS") ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}

async function logReconciliationIssue(
  admin: ReturnType<typeof createClient>,
  row: {
    checkout_request_id: string | null;
    db_status: string;
    daraja_result_code: number | null;
    daraja_result_desc: string;
    action_taken: string;
  },
): Promise<void> {
  const { error } = await admin.from("payment_reconciliation_log").insert(row);
  if (error) {
    console.error("[mpesa-stk-callback] payment_reconciliation_log insert failed", error.message);
  }
}

serveFarmVaultEdge("mpesa-stk-callback", async (req, _ctx) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let rawBody = "";
  try {
    const cfgEnv = readMpesaEnvMode();

    const raw = await req.text();
    rawBody = raw;
    console.log("[mpesa] Callback received", { mpesaEnv: cfgEnv, bodyLength: raw.length });

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("[mpesa-stk-callback] invalid JSON");
      return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stk = (payload as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
    const checkoutId = stk && typeof stk.CheckoutRequestID === "string" ? stk.CheckoutRequestID : "";
    const merchantRequestId =
      stk && typeof stk.MerchantRequestID === "string" ? stk.MerchantRequestID : "";
    const resultCodeRaw = stk?.ResultCode;
    const resultCode =
      typeof resultCodeRaw === "number"
        ? resultCodeRaw
        : typeof resultCodeRaw === "string"
          ? Number(resultCodeRaw)
          : null;
    const resultDesc = stk && typeof stk.ResultDesc === "string" ? stk.ResultDesc : "";
    const meta = stk?.CallbackMetadata;
    const receipt = metadataItem(meta, "MpesaReceiptNumber");
    const amount = metadataItem(meta, "Amount");
    const phoneNumber = metadataItem(meta, "PhoneNumber");

    if (resultCode === 0) {
      console.log("[mpesa] Payment success (callback)", {
        checkoutRequestId: checkoutId || undefined,
        mpesaReceiptNumber: receipt ?? undefined,
      });
    } else {
      console.warn("[mpesa] Payment failed (callback)", {
        checkoutRequestId: checkoutId || undefined,
        resultCode,
        resultDesc: resultDesc.slice(0, 200),
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey);
      const { error: insertErr } = await admin.from("mpesa_stk_callbacks").insert({
        checkout_request_id: checkoutId || null,
        merchant_request_id: merchantRequestId || null,
        result_code: Number.isFinite(resultCode) ? resultCode : null,
        result_desc: resultDesc.slice(0, 2000) || null,
        mpesa_receipt_number: receipt,
        amount: amount ?? null,
        phone_number: phoneNumber ?? null,
        raw_payload: payload as Record<string, unknown>,
      });
      if (insertErr) {
        console.error("[mpesa-stk-callback] persist failed", insertErr.message);
        await insertPaymentWebhookFailure(admin, {
          source: "mpesa_stk_callback_persist",
          checkoutRequestId: checkoutId || null,
          rawBody: rawBody.slice(0, 12000),
          errorMessage: `mpesa_stk_callbacks insert: ${insertErr.message}`.slice(0, 2000),
        });
      }

      if (checkoutId) {
        let { data: payBefore } = await admin
          .from("mpesa_payments")
          .select("plan,company_id")
          .eq("checkout_request_id", checkoutId)
          .maybeSingle();

        if (!payBefore) {
          const accountRef = accountRefFromRawPayload(payload);
          let resolvedCompanyId: string | null = null;
          if (accountRef && accountRef.trim() !== "") {
            const { data: cid, error: resErr } = await admin.rpc("try_resolve_company_from_fv_account_ref", {
              p_ref: accountRef.trim(),
            });
            if (!resErr && cid != null && String(cid).trim() !== "") {
              resolvedCompanyId = String(cid).trim();
            }
          }
          const { error: ensureInsErr } = await admin.from("mpesa_payments").insert({
            checkout_request_id: checkoutId,
            company_id: resolvedCompanyId,
            billing_reference: accountRef,
            plan: null,
            billing_cycle: null,
            amount: parseCallbackAmount(amount),
            phone: phoneNumber ?? null,
            mpesa_receipt: receipt ?? null,
            status: "PENDING",
            subscription_activated: false,
            success_processed: false,
            result_code: null,
            idempotency_key: null,
          });
          if (ensureInsErr && ensureInsErr.code !== "23505") {
            console.error("[mpesa-stk-callback] ensure mpesa_payments row failed", ensureInsErr.message);
            await insertPaymentWebhookFailure(admin, {
              source: "mpesa_stk_callback_ensure_row",
              checkoutRequestId: checkoutId,
              rawBody: rawBody.slice(0, 4000),
              errorMessage: ensureInsErr.message.slice(0, 2000),
            });
          }
          await logReconciliationIssue(admin, {
            checkout_request_id: checkoutId,
            db_status: "callback_missing_payment_row",
            daraja_result_code: Number.isFinite(resultCode) ? resultCode : null,
            daraja_result_desc: (ensureInsErr?.message ?? "inserted_or_existed").slice(0, 500),
            action_taken: ensureInsErr ? "callback_ensure_row_failed" : "callback_ensure_row_inserted",
          });
          const { data: payReload } = await admin
            .from("mpesa_payments")
            .select("plan,company_id")
            .eq("checkout_request_id", checkoutId)
            .maybeSingle();
          payBefore = payReload ?? payBefore;
        }

        const success = resultCode === 0;
        const amountNum = parseCallbackAmount(amount);
        const rc = Number.isFinite(resultCode) ? resultCode : null;

        let allowActivation = success;
        if (success && checkoutId && shouldVerifyStkSuccessWithQuery()) {
          try {
            const cfg = loadMpesaConfig();
            const tok = await fetchMpesaAccessToken(cfg);
            const q = await queryStkPush(cfg, tok, checkoutId);
            await logReconciliationIssue(admin, {
              checkout_request_id: checkoutId,
              db_status: "callback_success",
              daraja_result_code: q.resultCode,
              daraja_result_desc: (q.resultDesc || q.responseDescription || "").slice(0, 500),
              action_taken: q.resultCode === 0 ? "stk_query_confirms_paid" : "stk_query_blocks_activation",
            });
            if (q.resultCode !== 0 && Number.isFinite(q.resultCode)) {
              allowActivation = false;
              console.warn("[mpesa-stk-callback] STK Query did not confirm payment; deferring activation to reconcile.", {
                checkoutId,
                queryResult: q.resultCode,
                queryDesc: q.resultDesc?.slice(0, 120),
              });
              await insertPaymentWebhookFailure(admin, {
                source: "mpesa_stk_callback_stk_query_mismatch",
                checkoutRequestId: checkoutId,
                rawBody: rawBody.slice(0, 4000),
                errorMessage:
                  `Callback ResultCode=0 but STK Query resultCode=${q.resultCode} ${(q.resultDesc || "").slice(0, 400)}`
                    .slice(0, 2000),
              });
            }
          } catch (e) {
            console.error("[mpesa-stk-callback] STK query failed:", e);
            const errMsg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
            await logReconciliationIssue(admin, {
              checkout_request_id: checkoutId,
              db_status: "callback_success",
              daraja_result_code: null,
              daraja_result_desc: errMsg,
              action_taken: trustCallbackWhenStkQueryFails()
                ? "stk_query_error_trust_callback_env"
                : "stk_query_error_pending_verification",
            });
            await insertPaymentWebhookFailure(admin, {
              source: "mpesa_stk_callback_stk_query_error",
              checkoutRequestId: checkoutId,
              rawBody: rawBody.slice(0, 4000),
              errorMessage: `STK Query threw: ${errMsg}`.slice(0, 2000),
            });
            if (!trustCallbackWhenStkQueryFails()) {
              allowActivation = false;
            }
          }
        }

        let payStatus: string;
        let payResultCode: number | null;
        let payPaidAt: string | null;
        let payResultDesc = resultDesc.slice(0, 2000) || null;

        if (!success) {
          payStatus = "FAILED";
          payResultCode = rc;
          payPaidAt = null;
        } else if (allowActivation) {
          payStatus = "SUCCESS";
          payResultCode = 0;
          payPaidAt = new Date().toISOString();
        } else {
          payStatus = "PENDING_VERIFICATION";
          payResultCode = null;
          payPaidAt = null;
          const note = "(Awaiting STK query verification)";
          payResultDesc = [resultDesc, note].filter((s) => String(s).trim() !== "").join(" ").slice(0, 2000) ||
            note.slice(0, 2000);
        }

        const { error: payUpdErr } = await admin
          .from("mpesa_payments")
          .update({
            mpesa_receipt: receipt ?? null,
            ...(amountNum != null ? { amount: amountNum } : {}),
            phone: phoneNumber ?? null,
            status: payStatus,
            result_code: payResultCode,
            result_desc: payResultDesc,
            paid_at: payPaidAt,
          })
          .eq("checkout_request_id", checkoutId);
        if (payUpdErr) {
          console.error("[mpesa-stk-callback] mpesa_payments update failed", payUpdErr.message);
          await insertPaymentWebhookFailure(admin, {
            source: "mpesa_stk_callback_payment_row",
            checkoutRequestId: checkoutId,
            rawBody: rawBody.slice(0, 8000),
            errorMessage: `mpesa_payments update: ${payUpdErr.message}`.slice(0, 2000),
          });
        }

        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
        const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
        const appUrl = (Deno.env.get("FARMVAULT_PUBLIC_APP_URL") ?? "https://farmvault.africa").replace(/\/$/, "");
        const postDeveloperNotify = (jsonBody: Record<string, unknown>) => {
          const base = (supabaseUrl ?? "").replace(/\/$/, "");
          if (!base || !serviceKey) return Promise.resolve(new Response("", { status: 204 }));
          return fetch(`${base}/functions/v1/notify-developer-transactional`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
              apikey: anonKey ?? serviceKey,
            },
            body: JSON.stringify(jsonBody),
          });
        };
        const logDevNotifyFailure = (label: string, r: Response, t: string) => {
          console.error(`[mpesa-stk-callback] ${label} failed`, r.status, t.slice(0, 400));
        };
        // Activate + PDF receipt; unified success email / admin / commission via handleSuccessfulPayment.
        const stkCompanyId =
          payBefore != null && payBefore.company_id != null && String(payBefore.company_id).trim() !== ""
            ? String(payBefore.company_id).trim()
            : "";

        if (allowActivation && stkCompanyId) {
          const { data: subPayId, error: actErr } = await admin.rpc("activate_subscription_from_mpesa_stk", {
            _checkout_request_id: checkoutId,
          });
          if (actErr) {
            console.error("[mpesa-stk-callback] activate_subscription_from_mpesa_stk", actErr.message);
            await insertPaymentWebhookFailure(admin, {
              source: "mpesa_stk_callback_activate",
              checkoutRequestId: checkoutId,
              rawBody: rawBody.slice(0, 4000),
              errorMessage: `activate_subscription_from_mpesa_stk: ${actErr.message}`.slice(0, 2000),
            });
            postDeveloperNotify({
              event: "stk_payment_received",
              checkout_request_id: checkoutId,
            })
              .then((r) => {
                if (!r.ok) {
                  return r.text().then((t) => logDevNotifyFailure("notify stk_payment_received", r, t));
                }
              })
              .catch((e) => console.error("[mpesa-stk-callback] notify stk_payment_received", e));
          } else {
            console.log("[mpesa-stk-callback] subscription activated for checkout", checkoutId);
          }

          const payId =
            subPayId != null && String(subPayId).trim() !== "" ? String(subPayId).trim() : null;
          if (!payId) {
            console.warn(
              "[mpesa-stk-callback] no subscription_payment id after activation — unified success handler skipped",
              { checkoutId, stkCompanyId },
            );
          }

          if (payId && supabaseUrl && serviceKey) {
            const companyIdForSuccess =
              payBefore?.company_id != null ? String(payBefore.company_id).trim() : stkCompanyId;
            if (companyIdForSuccess) {
              await finalizeMpesaStkBilling({
                admin,
                supabaseUrl,
                serviceKey,
                anonKey: anonKey ?? undefined,
                resendKey,
                appUrl,
                companyId: companyIdForSuccess,
                subscriptionPaymentId: payId,
                source: "mpesa_stk_callback",
              });
            }
          }
        } else if (success && !allowActivation && stkCompanyId) {
          console.log("[mpesa-stk-callback] paid per callback but activation deferred (STK query gate)", { checkoutId });
        } else if (success && !stkCompanyId) {
          console.log("[mpesa-stk-callback] STK success without company_id on mpesa_payments — skip activate/receipt", {
            checkoutId,
          });
          postDeveloperNotify({
            event: "stk_payment_received",
            checkout_request_id: checkoutId,
          })
            .then((r) => {
              if (!r.ok) {
                return r.text().then((t) => logDevNotifyFailure("notify stk_payment_received", r, t));
              }
            })
            .catch((e) => console.error("[mpesa-stk-callback] notify stk_payment_received", e));
        }
      }
    } else {
      console.warn("[mpesa-stk-callback] SUPABASE_URL or SERVICE_ROLE missing — callback not persisted");
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[mpesa-stk-callback] unhandled", e);
    const msg = e instanceof Error ? e.message : String(e);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey);
      await insertPaymentWebhookFailure(admin, {
        source: "mpesa_stk_callback",
        checkoutRequestId: null,
        rawBody: rawBody.slice(0, 12000),
        errorMessage: msg.slice(0, 2000),
      });
    }
    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: "Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
