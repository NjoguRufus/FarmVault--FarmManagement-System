/**
 * Single path after subscription payment success (manual approval or M-Pesa STK resultCode === 0):
 * workspace snapshot, company "Payment Successful" email, admin notice, ambassador commission, idempotency flags.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { awardSubscriptionCommission } from "./awardSubscriptionCommission.ts";
import { normalizeCompanyIdForUuid } from "./companyBillingContactEmail.ts";
import { buildAdminPaymentConfirmedEmail, buildPaymentSuccessfulEmail } from "./farmvault-email/paymentSuccessfulTemplate.ts";
import { getFarmvaultDeveloperInboxEmail } from "./farmvaultDeveloperInbox.ts";
import { getFarmVaultEmailFrom } from "./farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "./resendSendLogged.ts";
import { resolveBillingRecipient } from "./billingRecipientResolve.ts";
import { sendCompanyEmail } from "./sendCompanyEmail.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_TYPE_COMPANY = "company_payment_successful";
const EMAIL_TYPE_ADMIN = "developer_payment_confirmed";

export type PaymentSuccessHandlerResult =
  | { ok: true; skipped?: true; reason?: string; resendId?: string }
  | { ok: false; error: string; status: number };

export type HandleSuccessfulPaymentInput = {
  admin: SupabaseClient;
  logAdmin: SupabaseClient | null;
  resendKey: string;
  appUrl: string;
  subscriptionPaymentId: string;
  companyId: string;
  /** Correlation only (logs / metadata). */
  source?: string;
};

function sameCompanyId(a: string, b: string): boolean {
  return normalizeCompanyIdForUuid(a) === normalizeCompanyIdForUuid(b);
}

function receiptForCommission(paymentId: string, transactionCode: string | null | undefined): string {
  const tx = typeof transactionCode === "string" ? transactionCode.trim() : "";
  if (tx) return tx;
  return `subscription_payment:${paymentId.trim()}`;
}

export async function handleSuccessfulPayment(
  input: HandleSuccessfulPaymentInput,
): Promise<PaymentSuccessHandlerResult> {
  const subPayId = input.subscriptionPaymentId.trim();
  const companyId = normalizeCompanyIdForUuid(input.companyId.trim());
  const source = typeof input.source === "string" ? input.source.trim() : "unknown";

  if (!UUID_RE.test(subPayId) || !UUID_RE.test(companyId)) {
    return { ok: false, error: "Invalid company_id or subscription_payment_id", status: 400 };
  }

  const { data: pay, error: payErr } = await input.admin
    .from("subscription_payments")
    .select(
      "company_id,amount,plan_id,billing_cycle,transaction_code,currency,status,success_processed,success_email_sent,commission_awarded",
    )
    .eq("id", subPayId)
    .maybeSingle();

  if (payErr || !pay) {
    return { ok: false, error: "Payment not found", status: 404 };
  }

  const row = pay as Record<string, unknown>;
  const payCid = String(row.company_id ?? "").trim();
  if (!payCid || !sameCompanyId(payCid, companyId)) {
    return { ok: false, error: "Payment does not belong to company_id", status: 403 };
  }

  if (row.success_processed === true) {
    console.log("[handleSuccessfulPayment] skip already_processed", { subPayId, source });
    return { ok: true, skipped: true, reason: "already_processed" };
  }

  const st = String(row.status ?? "").toLowerCase();
  if (st !== "approved") {
    console.warn("[handleSuccessfulPayment] reject not_approved", { subPayId, status: st, source });
    return { ok: false, error: "Payment is not approved", status: 412 };
  }

  let companyUuid: string;
  try {
    companyUuid = normalizeCompanyIdForUuid(payCid);
  } catch {
    return { ok: false, error: "Invalid company_id on payment", status: 400 };
  }

  const { data: syncRow, error: coErr } = await input.admin.rpc("subscription_payment_success_sync_company", {
    p_company_id: companyUuid,
  });

  if (coErr) {
    console.error(
      "[handleSuccessfulPayment] subscription_payment_success_sync_company RPC failed",
      coErr.message,
      { subPayId, source },
    );
    return { ok: false, error: coErr.message ?? "workspace_update_failed", status: 500 };
  }

  const snap = syncRow != null && typeof syncRow === "object" && !Array.isArray(syncRow)
    ? syncRow as Record<string, unknown>
    : {};
  const snapshotCompanyName = String(snap.name ?? "").trim();
  const snapshotCompanyEmail = String(snap.email ?? "").trim();

  const amountNum = Number(row.amount ?? 0);
  const currency = String(row.currency ?? "KES").toUpperCase();
  const amountKesFormatted = Number.isFinite(amountNum) ? amountNum.toLocaleString("en-KE") : String(row.amount ?? "—");
  const amountLabel = `${currency} ${Number.isFinite(amountNum) ? amountNum.toLocaleString("en-KE") : String(row.amount ?? "—")}`;
  const receiptDisplay = String(row.transaction_code ?? "").trim() || "—";
  const planRaw = String(row.plan_id ?? "basic");

  if (row.success_email_sent !== true) {
    const dedupeKey = `payment_successful:${subPayId}`;
    const { data: prior } = await input.admin
      .from("email_logs")
      .select("id")
      .eq("email_type", EMAIL_TYPE_COMPANY)
      .eq("status", "sent")
      .contains("metadata", { dedupe_key: dedupeKey })
      .limit(1)
      .maybeSingle();
    if ((prior as { id?: string } | null)?.id) {
      await input.admin
        .from("subscription_payments")
        .update({ success_email_sent: true, approved_email_sent: true })
        .eq("id", subPayId);
    } else {
      const resolved = await resolveBillingRecipient(input.admin, companyId, { subscriptionPaymentId: subPayId });
      if (!resolved) {
        console.error("[handleSuccessfulPayment] no billing recipient", { subPayId, companyId, source });
        return { ok: false, error: "No billing contact email found", status: 400 };
      }

      console.log("Sending success email to:", resolved.to);
      if (snapshotCompanyEmail) {
        console.log("[handleSuccessfulPayment] core.companies.email (from sync RPC):", snapshotCompanyEmail);
      }

      const built = buildPaymentSuccessfulEmail({
        companyName: resolved.companyName,
        planName: planRaw,
        amountKesFormatted,
        receiptNumber:
          receiptDisplay !== "—"
            ? receiptDisplay
            : receiptForCommission(subPayId, row.transaction_code as string | undefined),
      });

      const send = await sendCompanyEmail({
        to: resolved.to,
        subject: built.subject,
        html: built.html,
        type: "billing",
        admin: input.logAdmin,
        resendKey: input.resendKey,
        companyId,
        companyName: resolved.companyName,
        email_type: EMAIL_TYPE_COMPANY,
        metadata: {
          dedupe_key: dedupeKey,
          kind: "payment_successful",
          source: "handleSuccessfulPayment",
          subscription_payment_id: subPayId,
          correlation: source,
        },
      });
      if (!send.ok) {
        console.error("[handleSuccessfulPayment] company email failed", send.error, { subPayId, source });
        return { ok: false, error: send.error, status: 500 };
      }

      await input.admin
        .from("subscription_payments")
        .update({ success_email_sent: true, approved_email_sent: true, received_email_sent: true })
        .eq("id", subPayId);
    }
  }

  const adminTo = getFarmvaultDeveloperInboxEmail();
  const adminDedupe = `payment_confirmed_admin:${subPayId}`;
  const { data: adminPrior } = await input.admin
    .from("email_logs")
    .select("id")
    .eq("email_type", EMAIL_TYPE_ADMIN)
    .eq("status", "sent")
    .contains("metadata", { dedupe_key: adminDedupe })
    .limit(1)
    .maybeSingle();

  if (!(adminPrior as { id?: string } | null)?.id && adminTo && input.resendKey) {
    const companyName = snapshotCompanyName || "—";
    const adminBuilt = buildAdminPaymentConfirmedEmail({
      companyName,
      amountLabel,
      receipt: receiptDisplay,
    });
    const adminSend = await sendResendWithEmailLog({
      admin: input.logAdmin,
      resendKey: input.resendKey,
      from: getFarmVaultEmailFrom("developer"),
      to: adminTo,
      subject: adminBuilt.subject,
      html: adminBuilt.html,
      email_type: EMAIL_TYPE_ADMIN,
      company_id: companyUuid,
      company_name: companyName,
      metadata: {
        dedupe_key: adminDedupe,
        subscription_payment_id: subPayId,
        source: "handleSuccessfulPayment",
        correlation: source,
      },
    });
    if (!adminSend.ok) {
      console.error("[handleSuccessfulPayment] admin email failed", adminSend.error, { subPayId, source });
    }
  }

  if (row.commission_awarded !== true) {
    const rcpt = receiptForCommission(subPayId, row.transaction_code as string | undefined);
    const comm = await awardSubscriptionCommission(input.admin, companyUuid, rcpt);
    if (!comm.ok) {
      console.error("[handleSuccessfulPayment] commission RPC failed", comm.error, { subPayId, source });
      return { ok: false, error: comm.error ?? "commission_failed", status: 500 };
    }
    if (comm.skipped) {
      console.log("[handleSuccessfulPayment] commission skipped", comm.reason, { subPayId, source });
    } else {
      console.log("[handleSuccessfulPayment] commission awarded", {
        subPayId,
        amount: comm.amount,
        first_subscription_payment: comm.first_subscription_payment,
        source,
      });
    }
    await input.admin.from("subscription_payments").update({ commission_awarded: true }).eq("id", subPayId);
  }

  const { error: doneErr } = await input.admin.from("subscription_payments").update({ success_processed: true }).eq(
    "id",
    subPayId,
  );

  if (doneErr) {
    console.error("[handleSuccessfulPayment] success_processed update failed", doneErr.message, { subPayId, source });
    return { ok: false, error: doneErr.message ?? "finalize_failed", status: 500 };
  }

  console.log("[handleSuccessfulPayment] complete", { subPayId, source });
  return { ok: true };
}
