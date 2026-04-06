/**
 * FarmVault transactional email to a workspace contact (Resend + email_logs).
 * Same pipeline as notify-company-transactional (e.g. pro trial) and billing-receipt-issue.
 *
 * Use `EMAIL_SENDERS` / `getFarmVaultEmailFrom` from `farmvaultEmailFrom.ts` for `from`.
 * For payment receipts with PDF, billing-receipt-issue uses companyEmailPipeline (core.companies.email).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendResendWithEmailLog } from "./resendSendLogged.ts";

export type SendCompanyEmailInput = {
  admin: SupabaseClient | null;
  resendKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  companyId: string;
  companyName: string;
  email_type: string;
  metadata: Record<string, unknown>;
};

export async function sendCompanyEmail(
  input: SendCompanyEmailInput,
): Promise<
  { ok: true; resendId?: string; logId: string | null } | { ok: false; error: string }
> {
  return sendResendWithEmailLog({
    admin: input.admin,
    resendKey: input.resendKey,
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    email_type: input.email_type,
    company_id: input.companyId,
    company_name: input.companyName,
    metadata: input.metadata,
  });
}
