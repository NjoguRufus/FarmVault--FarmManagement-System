/** FarmVault operator inbox for billing/signup alerts (Resend `to`). */
export const FARMVAULT_DEVELOPER_INBOX_DEFAULT = "farmvaultke@gmail.com";

/**
 * Prefer FARMVAULT_DEVELOPER_INBOX_EMAIL, then FARMVAULT_DEVELOPER_COMPANY_NOTIFY_EMAIL / FARMVAULT_AMBASSADOR_ADMIN_EMAIL / legacy ADMIN_EMAIL.
 */
export function getFarmvaultDeveloperInboxEmail(): string {
  const a = Deno.env.get("FARMVAULT_DEVELOPER_INBOX_EMAIL")?.trim();
  if (a) return a;
  const b = Deno.env.get("FARMVAULT_DEVELOPER_COMPANY_NOTIFY_EMAIL")?.trim();
  if (b) return b;
  const c = Deno.env.get("FARMVAULT_AMBASSADOR_ADMIN_EMAIL")?.trim();
  if (c) return c;
  const d = Deno.env.get("DEVELOPER_ADMIN_EMAIL")?.trim() ?? Deno.env.get("ADMIN_EMAIL")?.trim();
  if (d) return d;
  return FARMVAULT_DEVELOPER_INBOX_DEFAULT;
}
