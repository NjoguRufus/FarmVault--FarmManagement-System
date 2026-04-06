import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeCompanyIdForUuid } from "./companyBillingContactEmail.ts";
import { resolveCompanyTenantEmail } from "./companyEmailPipeline.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_RE_TO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sameBillingCompanyId(a: string, b: string): boolean {
  return normalizeCompanyIdForUuid(a) === normalizeCompanyIdForUuid(b);
}

async function companyDisplayName(admin: SupabaseClient, companyId: string): Promise<string> {
  const { data: c } = await admin.schema("core").from("companies").select("name").eq("id", companyId).maybeSingle();
  return String((c as { name?: string } | null)?.name ?? "").trim() || "Your workspace";
}

/**
 * Server-side billing recipients (STK + payment success). Order: tenant pipeline →
 * billing_notify_email on subscription_payments (submitter JWT at manual submit) →
 * company_billing_contact_email RPC. billing_notify must run before RPC so we do not
 * prefer created_by / internal profiles over the inbox that received "awaiting approval".
 */
export async function resolveBillingRecipient(
  admin: SupabaseClient,
  companyId: string,
  opts?: { subscriptionPaymentId?: string | null },
): Promise<{ to: string; companyName: string } | null> {
  const cid = normalizeCompanyIdForUuid(companyId.trim());
  if (!UUID_RE.test(cid)) return null;

  const tenant = await resolveCompanyTenantEmail(admin, cid);
  if (tenant) {
    return { to: tenant.email, companyName: tenant.name };
  }

  const pid = typeof opts?.subscriptionPaymentId === "string" ? opts.subscriptionPaymentId.trim() : "";
  if (pid && UUID_RE.test(pid)) {
    const { data: paySnip } = await admin
      .from("subscription_payments")
      .select("billing_notify_email,company_id")
      .eq("id", pid)
      .maybeSingle();
    const snip = paySnip as { billing_notify_email?: string | null; company_id?: string } | null;
    if (snip && sameBillingCompanyId(String(snip.company_id ?? ""), cid)) {
      const hint = typeof snip.billing_notify_email === "string" ? snip.billing_notify_email.trim() : "";
      if (hint && EMAIL_RE_TO.test(hint)) {
        return { to: hint.toLowerCase(), companyName: await companyDisplayName(admin, cid) };
      }
    }
  }

  const { data: rpcEmail, error: rpcErr } = await admin.rpc("company_billing_contact_email", {
    p_company_id: cid,
  });
  const rpcStr = typeof rpcEmail === "string" ? rpcEmail.trim() : "";
  if (!rpcErr && rpcStr && EMAIL_RE_TO.test(rpcStr)) {
    return { to: rpcStr.toLowerCase(), companyName: await companyDisplayName(admin, cid) };
  }

  return null;
}
