import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_RAW = 12_000;

export async function insertPaymentWebhookFailure(
  admin: SupabaseClient,
  input: {
    source: string;
    checkoutRequestId?: string | null;
    rawBody: string;
    errorMessage: string;
  },
): Promise<void> {
  try {
    await admin.from("payment_webhook_failures").insert({
      source: input.source.slice(0, 120),
      checkout_request_id: input.checkoutRequestId?.trim() || null,
      raw_body: input.rawBody.slice(0, MAX_RAW),
      error_message: input.errorMessage.slice(0, 2000),
    });
  } catch (e) {
    console.error("[paymentWebhookFailure] insert failed", e);
  }
}
