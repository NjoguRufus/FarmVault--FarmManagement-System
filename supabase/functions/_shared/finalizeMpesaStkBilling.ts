import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceRoleClientForEmailLogs } from "./emailLogs.ts";
import { handleSuccessfulPayment } from "./handleSuccessfulPayment.ts";
import { sendCompanyPaymentReceipt } from "./sendCompanyPaymentReceipt.ts";

/**
 * After `activate_subscription_from_mpesa_stk` succeeds: receipt PDF + unified success emails/commission.
 */
export async function finalizeMpesaStkBilling(opts: {
  admin: SupabaseClient;
  supabaseUrl: string;
  serviceKey: string;
  anonKey?: string;
  resendKey: string;
  appUrl: string;
  companyId: string;
  subscriptionPaymentId: string;
  source: string;
}): Promise<void> {
  const logAdmin = getServiceRoleClientForEmailLogs();

  await sendCompanyPaymentReceipt({
    supabaseUrl: opts.supabaseUrl,
    serviceRoleKey: opts.serviceKey,
    anonKey: opts.anonKey,
    subscriptionPaymentId: opts.subscriptionPaymentId,
    sendEmail: false,
  });

  if (!opts.resendKey) {
    console.error(`[finalizeMpesaStkBilling] RESEND_API_KEY missing — ${opts.source}`);
    return;
  }

  if (!logAdmin) {
    console.warn(`[finalizeMpesaStkBilling] email_logs client unavailable — ${opts.source}`);
  }

  try {
    const succ = await handleSuccessfulPayment({
      admin: opts.admin,
      logAdmin,
      resendKey: opts.resendKey,
      appUrl: opts.appUrl,
      companyId: opts.companyId,
      subscriptionPaymentId: opts.subscriptionPaymentId,
      source: opts.source,
    });
    if (!succ.ok) {
      console.error("[finalizeMpesaStkBilling] handleSuccessfulPayment failed", succ.status, succ.error, opts.source);
    } else if ("skipped" in succ && succ.skipped) {
      console.log("[finalizeMpesaStkBilling] skipped:", succ.reason, opts.source);
    }
  } catch (e) {
    console.error("[finalizeMpesaStkBilling] handleSuccessfulPayment threw", e, opts.source);
  }
}
