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
        const success = resultCode === 0;
        const amountNum = parseCallbackAmount(amount);
        const paidAt = success ? new Date().toISOString() : null;
        const { error: payUpdErr } = await admin
          .from("mpesa_payments")
          .update({
            mpesa_receipt: receipt ?? null,
            ...(amountNum != null ? { amount: amountNum } : {}),
            phone: phoneNumber ?? null,
            status: success ? "SUCCESS" : "FAILED",
            result_desc: resultDesc.slice(0, 2000) || null,
            paid_at: paidAt,
          })
          .eq("checkout_request_id", checkoutId);
        if (payUpdErr) {
          console.error("[mpesa-stk-callback] mpesa_payments update failed", payUpdErr.message);
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
