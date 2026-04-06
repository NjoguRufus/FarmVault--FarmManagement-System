/**
 * Shared Resend sends for STK + payment-approved (used by notify-company-transactional HTTP and mpesa-stk-callback in-process).
 * Avoids edge→edge fetch, which is brittle for service-role auth and apikey headers.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeCompanyIdForUuid } from "./companyBillingContactEmail.ts";
import { resolveBillingRecipient, sameBillingCompanyId } from "./billingRecipientResolve.ts";
import { handleSuccessfulPayment } from "./handleSuccessfulPayment.ts";
import { buildStkPaymentReceivedEmail } from "./farmvault-email/stkPaymentReceivedTemplate.ts";
import { sendCompanyEmail } from "./sendCompanyEmail.ts";

const EMAIL_TYPE_STK_RECEIVED = "company_stk_payment_received";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { resolveBillingRecipient } from "./billingRecipientResolve.ts";

export type StkPaymentReceivedEmailResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; resendId?: string }
  | { ok: false; error: string; status: number };

export async function executeStkPaymentReceivedCompanyEmail(input: {
  admin: SupabaseClient;
  logAdmin: SupabaseClient | null;
  resendKey: string;
  appUrl: string;
  companyId: string;
  amountRaw: string;
  mpesaReceipt: string;
  phone: string;
  checkoutRequestId: string;
  subscriptionPaymentId: string | null;
}): Promise<StkPaymentReceivedEmailResult> {
  const companyId = normalizeCompanyIdForUuid(input.companyId.trim());
  if (!UUID_RE.test(companyId)) {
    return { ok: false, error: "company_id must be a valid UUID", status: 400 };
  }

  const subPayLinkRaw = input.subscriptionPaymentId?.trim() ?? "";
  let linkedSubscriptionPaymentId: string | null = null;
  if (subPayLinkRaw && UUID_RE.test(subPayLinkRaw)) {
    const { data: spRow, error: spErr } = await input.admin
      .from("subscription_payments")
      .select("company_id,received_email_sent")
      .eq("id", subPayLinkRaw)
      .maybeSingle();
    if (!spErr && spRow) {
      const row = spRow as { company_id?: string; received_email_sent?: boolean };
      const spCid = String(row.company_id ?? "").trim();
      if (spCid && sameBillingCompanyId(spCid, companyId)) {
        if (row.received_email_sent === true) {
          return { ok: true, skipped: true, reason: "already_sent" };
        }
        linkedSubscriptionPaymentId = subPayLinkRaw;
      }
    }
  }

  const checkoutRequestId = input.checkoutRequestId.trim();
  const mpesaReceipt = input.mpesaReceipt.trim();
  const dedupeKey = checkoutRequestId
    ? `stk_payment_received:${checkoutRequestId}`
    : linkedSubscriptionPaymentId
      ? `stk_payment_received:subpay:${linkedSubscriptionPaymentId}`
      : `stk_payment_received:${companyId}:${mpesaReceipt}`;

  const { data: prior } = await input.admin
    .from("email_logs")
    .select("id")
    .eq("email_type", EMAIL_TYPE_STK_RECEIVED)
    .eq("status", "sent")
    .contains("metadata", { dedupe_key: dedupeKey })
    .limit(1)
    .maybeSingle();
  if ((prior as { id?: string } | null)?.id) {
    if (linkedSubscriptionPaymentId) {
      await input.admin
        .from("subscription_payments")
        .update({ received_email_sent: true })
        .eq("id", linkedSubscriptionPaymentId);
    }
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  const paymentHintId =
    linkedSubscriptionPaymentId ?? (subPayLinkRaw && UUID_RE.test(subPayLinkRaw) ? subPayLinkRaw : null);
  const resolved = await resolveBillingRecipient(input.admin, companyId, {
    subscriptionPaymentId: paymentHintId,
  });
  if (!resolved) {
    return { ok: false, error: "No billing contact email found", status: 400 };
  }
  const { to, companyName } = resolved;

  const amountRaw = typeof input.amountRaw === "string" ? input.amountRaw.trim() : String(input.amountRaw ?? "").trim();
  const currency = "KES";
  const amountNum = Number(amountRaw.replace(/,/g, ""));
  const amountLabel = `${currency} ${
    Number.isFinite(amountNum) && amountNum > 0 ? amountNum.toLocaleString("en-KE") : amountRaw || "—"
  }`;

  const built = buildStkPaymentReceivedEmail({
    companyName,
    amountLabel,
    mpesaReceipt: mpesaReceipt || "—",
    phone: (input.phone ?? "").trim() || "—",
    billingUrl: `${input.appUrl.replace(/\/$/, "")}/billing`,
  });

  console.log("[subscriptionPaymentCompanyEmails] stk_payment_received → sending to:", to);

  const send = await sendCompanyEmail({
    to,
    subject: built.subject,
    html: built.html,
    type: "billing",
    admin: input.logAdmin,
    resendKey: input.resendKey,
    companyId,
    companyName,
    email_type: EMAIL_TYPE_STK_RECEIVED,
    metadata: {
      dedupe_key: dedupeKey,
      kind: "stk_payment_received",
      source: "subscriptionPaymentCompanyEmails",
      checkout_request_id: checkoutRequestId || null,
      mpesa_receipt: mpesaReceipt || null,
      subscription_payment_id: linkedSubscriptionPaymentId,
    },
  });
  if (!send.ok) return { ok: false, error: send.error, status: 500 };

  if (linkedSubscriptionPaymentId) {
    await input.admin
      .from("subscription_payments")
      .update({ received_email_sent: true })
      .eq("id", linkedSubscriptionPaymentId);
  }

  return { ok: true, resendId: send.resendId };
}

export type PaymentApprovedEmailResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; resendId?: string }
  | { ok: false; error: string; status: number };

export async function executePaymentApprovedCompanyEmail(input: {
  admin: SupabaseClient;
  logAdmin: SupabaseClient | null;
  resendKey: string;
  appUrl: string;
  companyId: string;
  subscriptionPaymentId: string;
}): Promise<PaymentApprovedEmailResult> {
  return handleSuccessfulPayment({
    admin: input.admin,
    logAdmin: input.logAdmin,
    resendKey: input.resendKey,
    appUrl: input.appUrl,
    companyId: normalizeCompanyIdForUuid(input.companyId.trim()),
    subscriptionPaymentId: input.subscriptionPaymentId.trim(),
    source: "executePaymentApprovedCompanyEmail",
  });
}
