/**
 * Billing / alert wrappers around companyEmailPipeline (resolveCompanyTenantEmail order).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCompanyTenantEmail, sendCompanyPipelineEmail } from "./companyEmailPipeline.ts";
import { getFarmVaultEmailFromForEmailType } from "./farmvaultEmailFrom.ts";
import { sendResendWithEmailLog } from "./resendSendLogged.ts";

export {
  getCompanyEmail,
  getCompanyEmailAndName,
  resolveCompanyBillingRecipient,
  resolveCompanyTenantEmail,
  sendCompanyPipelineEmail,
} from "./companyEmailPipeline.ts";

/** Clerk `sub` from Bearer JWT, or null when Authorization is missing or is service role key. */
export function clerkSubForBillingReceipt(authHeader: string | null | undefined, serviceRoleKey: string): string | null {
  const auth = authHeader?.trim();
  if (!auth?.toLowerCase().startsWith("bearer ") || auth.length < 12) return null;
  const bearer = auth.slice(7).trim();
  if (bearer === serviceRoleKey) return null;
  return clerkSubFromBearerJwt(auth);
}

export function clerkSubFromBearerJwt(authHeader: string | null | undefined): string | null {
  const auth = authHeader?.trim();
  if (!auth?.toLowerCase().startsWith("bearer ") || auth.length < 12) return null;
  const token = auth.slice(7).trim();
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1])) as { sub?: string };
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

export type CompanyPaymentEmailInput = {
  admin: SupabaseClient;
  resendKey: string;
  companyId: string;
  subject: string;
  html: string;
  email_type: string;
  metadata: Record<string, unknown>;
  attachments?: { filename: string; content: string }[];
};

export async function sendCompanyPaymentEmail(
  input: CompanyPaymentEmailInput,
): Promise<{ ok: true; resendId?: string } | { ok: false; error: string }> {
  const { admin, resendKey, companyId, subject, html, email_type, metadata, attachments } = input;
  if (!admin) {
    return { ok: false, error: "Server misconfiguration (no admin client for email)" };
  }

  const resolved = await resolveCompanyTenantEmail(admin, companyId);
  if (!resolved) {
    console.error("PAYMENT EMAIL ERROR (no recipient): skipped — no resolved company email");
    return { ok: false, error: "No company email recipient" };
  }

  const { email, name: companyName } = resolved;
  console.log("Sending to:", email);

  const from = getFarmVaultEmailFromForEmailType("billing_receipt");
  try {
    return await sendResendWithEmailLog({
      admin,
      resendKey,
      from,
      to: email,
      subject,
      html,
      email_type,
      company_id: companyId,
      company_name: companyName,
      metadata,
      attachments,
    });
  } catch (e) {
    console.error("PAYMENT EMAIL ERROR:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export type CompanyAlertEmailInput = {
  admin: SupabaseClient;
  resendKey: string;
  companyId: string;
  subject: string;
  html: string;
  email_type: string;
  metadata: Record<string, unknown>;
};

export async function sendCompanyAlertEmail(
  input: CompanyAlertEmailInput,
): Promise<{ ok: true; resendId?: string } | { ok: false; error: string }> {
  return sendCompanyPipelineEmail({
    admin: input.admin,
    resendKey: input.resendKey,
    companyId: input.companyId,
    from: "alerts",
    subject: input.subject,
    html: input.html,
    email_type: input.email_type,
    metadata: input.metadata,
  });
}
