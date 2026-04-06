// M-Pesa STK callback — Daraja posts here (set MPESA_CALLBACK_URL in Edge secrets to this function’s public URL).
// Same URL for sandbox and production apps in the Safaricom portal.
// Persists callback rows to public.mpesa_stk_callbacks (service_role).
// Deploy: supabase functions deploy mpesa-stk-callback --no-verify-jwt
//
// Note: Path `/api/mpesa/callback` is not hosted on Supabase Edge; use your function URL or reverse-proxy
// `/api/mpesa/callback` → `https://<ref>.supabase.co/functions/v1/mpesa-stk-callback` if needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readMpesaEnvMode } from "../_shared/mpesaConfig.ts";

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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const cfgEnv = readMpesaEnvMode();

    const raw = await req.text();
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
      }

      if (checkoutId) {
        const { data: payBefore } = await admin
          .from("mpesa_payments")
          .select("plan,company_id")
          .eq("checkout_request_id", checkoutId)
          .maybeSingle();

        const success = resultCode === 0;
        const amountNum = parseCallbackAmount(amount);
        const paidAt = success ? new Date().toISOString() : null;
        const rc = Number.isFinite(resultCode) ? resultCode : null;

        const { error: payUpdErr } = await admin
          .from("mpesa_payments")
          .update({
            mpesa_receipt: receipt ?? null,
            ...(amountNum != null ? { amount: amountNum } : {}),
            phone: phoneNumber ?? null,
            status: success ? "SUCCESS" : "FAILED",
            result_code: success ? 0 : rc,
            result_desc: resultDesc.slice(0, 2000) || null,
            paid_at: paidAt,
          })
          .eq("checkout_request_id", checkoutId);
        if (payUpdErr) {
          console.error("[mpesa-stk-callback] mpesa_payments update failed", payUpdErr.message);
        }

        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
        const postDeveloperNotify = (jsonBody: Record<string, unknown>) => {
          const base = (supabaseUrl ?? "").replace(/\/$/, "");
          if (!base || !serviceKey) return Promise.resolve();
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

        if (success) {
          postDeveloperNotify({
            event: "stk_payment_received",
            checkout_request_id: checkoutId,
          })
            .then((r) => {
              if (!r.ok) {
                return r.text().then((t) => {
                  console.error("[mpesa-stk-callback] notify stk_payment_received failed", r.status, t.slice(0, 400));
                });
              }
            })
            .catch((e) => console.error("[mpesa-stk-callback] notify stk_payment_received", e));
        }

        // Activate + receipt email whenever the STK row is tied to a company. Do not require `plan` on the row:
        // `activate_subscription_from_mpesa_stk` defaults plan/cycle; gating on plan skipped customer receipt emails
        // when `plan` was null (legacy rows, partial writes, or env quirks) while the developer notify still fired.
        const stkCompanyId =
          payBefore != null && payBefore.company_id != null && String(payBefore.company_id).trim() !== ""
            ? String(payBefore.company_id).trim()
            : "";
        if (success && stkCompanyId) {
          const { data: subPayId, error: actErr } = await admin.rpc("activate_subscription_from_mpesa_stk", {
            _checkout_request_id: checkoutId,
          });
          if (actErr) {
            console.error("[mpesa-stk-callback] activate_subscription_from_mpesa_stk", actErr.message);
          } else {
            console.log("[mpesa-stk-callback] subscription activated for checkout", checkoutId);
            postDeveloperNotify({
              event: "subscription_activated",
              source: "mpesa_stk",
              checkout_request_id: checkoutId,
            })
              .then((r) => {
                if (!r.ok) {
                  return r.text().then((t) => {
                    console.error(
                      "[mpesa-stk-callback] notify subscription_activated failed",
                      r.status,
                      t.slice(0, 400),
                    );
                  });
                }
              })
              .catch((e) => console.error("[mpesa-stk-callback] notify subscription_activated", e));
          }

          const payId =
            subPayId != null && String(subPayId).trim() !== "" ? String(subPayId).trim() : null;
          if (!payId) {
            console.warn(
              "[mpesa-stk-callback] no subscription_payment id after activation — customer receipt email skipped",
              { checkoutId, stkCompanyId },
            );
          }

          if (payId && supabaseUrl && serviceKey) {
            const fnUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/billing-receipt-issue`;
            try {
              const r = await fetch(fnUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                  apikey: anonKey ?? serviceKey,
                },
                body: JSON.stringify({
                  action: "issue",
                  subscription_payment_id: payId,
                  send_email: true,
                }),
              });
              if (!r.ok) {
                const t = await r.text().catch(() => "");
                console.error("[mpesa-stk-callback] billing-receipt-issue failed", r.status, t.slice(0, 500));
              }
            } catch (e) {
              console.error("[mpesa-stk-callback] billing-receipt-issue invoke", e);
            }
          }
        } else if (success && !stkCompanyId) {
          console.log("[mpesa-stk-callback] STK success without company_id on mpesa_payments — skip activate/receipt", {
            checkoutId,
          });
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
    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: "Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
