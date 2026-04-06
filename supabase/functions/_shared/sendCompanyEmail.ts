/**
 * FarmVault unified company email sender.
 *
 * Pass `type` and the correct sender is resolved automatically:
 *   "onboarding" → FarmVault <hello@farmvault.africa>
 *   "billing"    → FarmVault Billing <billing@farmvault.africa>
 *   "alerts"     → FarmVault Alerts <alerts@farmvault.africa>
 *
 * All sends are logged to email_logs via sendResendWithEmailLog.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFarmVaultEmailFrom } from "./farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "./resendSendLogged.ts";

export type CompanyEmailType = "onboarding" | "billing" | "alerts";

export function getSender(type: CompanyEmailType): string {
  if (type === "billing") return getFarmVaultEmailFrom("billing");
  if (type === "alerts") return getFarmVaultEmailFrom("alerts");
  return getFarmVaultEmailFrom("onboarding");
}

export type SendCompanyEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Determines sender address. "onboarding"→hello@ "billing"→billing@ "alerts"→alerts@ */
  type: CompanyEmailType;
  admin: SupabaseClient | null;
  resendKey: string;
  companyId: string;
  companyName: string;
  /** Logical email type persisted in email_logs (e.g. "company_payment_received"). */
  email_type: string;
  metadata: Record<string, unknown>;
  attachments?: { filename: string; content: string }[];
};

export async function sendCompanyEmail(
  input: SendCompanyEmailInput,
): Promise<
  { ok: true; resendId?: string; logId: string | null } | { ok: false; error: string }
> {
  return sendResendWithEmailLog({
    admin: input.admin,
    resendKey: input.resendKey,
    from: getSender(input.type),
    to: input.to,
    subject: input.subject,
    html: input.html,
    email_type: input.email_type,
    company_id: input.companyId,
    company_name: input.companyName,
    metadata: input.metadata,
    attachments: input.attachments,
  });
}
