/**
 * After payment approval: delegate to billing-receipt-issue (PDF + email via sendCompanyPaymentEmail pipeline).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCompanyEmail } from "./companyEmailPipeline.ts";

export type SendCompanyPaymentReceiptIssueInput = {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey?: string;
  /** public.subscription_payments.id after approval */
  subscriptionPaymentId: string;
  sendEmail?: boolean;
};

export type SendCompanyPaymentReceiptIssueResult = {
  ok: boolean;
  status: number;
  deduped?: boolean;
  emailed?: boolean;
  receiptId?: string;
  receiptNumber?: string;
  error?: string;
};

/**
 * After subscription update + payment row exists: issue receipt PDF and email company
 * (billing-receipt-issue `action: issue` — same tenant email rules as notify-company-transactional).
 */
export async function sendCompanyPaymentReceipt(
  input: SendCompanyPaymentReceiptIssueInput,
): Promise<SendCompanyPaymentReceiptIssueResult> {
  const { supabaseUrl, serviceRoleKey, anonKey, subscriptionPaymentId, sendEmail } = input;
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: pay, error: payErr } = await admin
      .from("subscription_payments")
      .select("company_id")
      .eq("id", subscriptionPaymentId)
      .maybeSingle();

    if (payErr) {
      console.error("sendCompanyPaymentReceipt: subscription_payments load failed", payErr.message);
    }

    const rawCid = pay != null && typeof (pay as { company_id?: unknown }).company_id === "string"
      ? String((pay as { company_id: string }).company_id).trim()
      : "";

    if (rawCid) {
      try {
        const em = await getCompanyEmail(admin, rawCid);
        console.log("Sending receipt to (core.companies.email):", em);
      } catch {
        console.log(
          "sendCompanyPaymentReceipt: core.companies.email missing — billing-receipt-issue will try owner profile fallback",
          rawCid,
        );
      }
    }

    const fnUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/billing-receipt-issue`;
    const r = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: anonKey ?? serviceRoleKey,
      },
      body: JSON.stringify({
        action: "issue",
        subscription_payment_id: subscriptionPaymentId,
        send_email: sendEmail !== false,
      }),
    });

    const text = await r.text().catch(() => "");
    if (!r.ok) {
      console.error("Receipt email failed:", r.status, text.slice(0, 500));
      return {
        ok: false,
        status: r.status,
        error: text.slice(0, 500) || "billing-receipt-issue request failed",
      };
    }

    try {
      const j = text.trim()
        ? (JSON.parse(text) as Record<string, unknown>)
        : {};
      if (j.emailed === true || j.ok === true || j.success === true) {
        console.log("Receipt sent successfully");
      } else {
        console.log("Receipt issue completed:", text.slice(0, 300));
      }
      return {
        ok: true,
        status: r.status,
        deduped: j.deduped === true,
        emailed: j.emailed === true,
        receiptId: typeof j.receipt_id === "string" ? j.receipt_id : undefined,
        receiptNumber: typeof j.receipt_number === "string" ? j.receipt_number : undefined,
      };
    } catch {
      console.log("Receipt issue completed (non-JSON body)");
      return { ok: true, status: r.status };
    }
  } catch (err) {
    console.error("Receipt email failed:", err);
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
