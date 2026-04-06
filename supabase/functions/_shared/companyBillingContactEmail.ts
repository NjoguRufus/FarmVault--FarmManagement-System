/** Resolve workspace billing/contact email (same rules as `company_billing_contact_email` RPC). */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

/** Normalize company id for UUID RPC / core lookups (subscription_payments.company_id is text). */
export function normalizeCompanyIdForUuid(companyId: string): string {
  return companyId.trim().toLowerCase();
}

export async function resolveCompanyBillingContactEmail(
  admin: SupabaseClient,
  companyId: string,
): Promise<string> {
  const cid = normalizeCompanyIdForUuid(companyId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cid)) {
    console.warn("[companyBillingContactEmail] invalid company uuid", companyId);
    return "";
  }
  try {
    const { data, error } = await admin.rpc("company_billing_contact_email", {
      p_company_id: cid,
    });
    if (error) {
      console.warn("[companyBillingContactEmail]", error.message);
      return "";
    }
    const to = typeof data === "string" ? data.trim() : "";
    if (!to || !isValidEmail(to)) return "";
    return to;
  } catch (e) {
    console.warn("[companyBillingContactEmail]", e);
    return "";
  }
}

export type ReceiptRecipientResult = {
  /** Final Resend `to` address, or "" if none — do not send when empty. */
  to: string;
  /** `core.companies.email` when present (for debugging). */
  companyEmail: string | undefined;
};

/**
 * Resolves receipt recipient after payment approval.
 * Order: `company_billing_contact_email` RPC (creator + company + members) → core.email → owner_email → ctx fallback.
 * Logs `Sending receipt to:` with core.companies.email (may be undefined).
 */
export async function resolveReceiptRecipientEmail(
  admin: SupabaseClient,
  companyId: string,
  ctxAdminEmailFallback: string,
): Promise<ReceiptRecipientResult> {
  const cid = normalizeCompanyIdForUuid(companyId);

  const { data: company, error } = await admin
    .schema("core")
    .from("companies")
    .select("id,email,owner_email")
    .eq("id", cid)
    .maybeSingle();

  if (error) {
    console.warn("[receiptRecipient] core.companies fetch failed", error.message);
  }

  const companyEmail =
    typeof company?.email === "string" && company.email.trim().length > 0
      ? company.email.trim()
      : undefined;

  console.log("Sending receipt to:", companyEmail);

  const rpcEmail = await resolveCompanyBillingContactEmail(admin, cid);

  let to = "";
  if (rpcEmail && isValidEmail(rpcEmail)) {
    to = rpcEmail;
  } else if (companyEmail && isValidEmail(companyEmail)) {
    to = companyEmail;
  } else if (typeof company?.owner_email === "string" && company.owner_email.trim().length > 0) {
    const o = company.owner_email.trim();
    if (isValidEmail(o)) to = o;
  }

  if (!to) {
    to = String(ctxAdminEmailFallback ?? "").trim();
  }

  if (!to || !isValidEmail(to)) {
    console.warn("[receiptRecipient] No valid receipt recipient; skipping email send", { companyId: cid });
    return { to: "", companyEmail };
  }

  return { to, companyEmail };
}
