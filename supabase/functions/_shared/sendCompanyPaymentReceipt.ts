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

/**
 * After subscription update + payment row exists: issue receipt PDF and email company
 * (billing-receipt-issue `action: issue` — same tenant email rules as notify-company-transactional).
 */
export async function sendCompanyPaymentReceipt(input: SendCompanyPaymentReceiptIssueInput): Promise<void> {
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
      return;
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
    } catch {
      console.log("Receipt issue completed (non-JSON body)");
    }
  } catch (err) {
    console.error("Receipt email failed:", err);
  }
}
