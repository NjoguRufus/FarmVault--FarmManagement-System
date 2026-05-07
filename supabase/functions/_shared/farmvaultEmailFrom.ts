/**
 * Central Resend `from` configuration (RFC 5322: `Display Name <addr@domain>`).
 * Use `getFarmVaultEmailFrom`, `getFarmVaultEmailFromForEmailType(email_type)`, or `EMAIL_SENDERS`.
 *
 * Do not use noreply@ or Resend’s default onboarding domain in production.
 *
 * Sender identities by purpose:
 *   companion  → companion@  — morning / evening / inactivity / weekly companion notifications
 *   onboarding → hello@      — welcome, company approval, onboarding lifecycle
 *   billing    → billing@    — invoices, receipts, subscription events sent to tenants
 *   alerts     → alerts@     — trial expiry, system-level operational alerts
 *   developer  → alerts@     — developer inbox (same address, distinct display name)
 *   support    → support@    — support correspondence
 *
 * Optional env overrides:
 *   FARMVAULT_EMAIL_FROM_COMPANION | FARMVAULT_EMAIL_FROM_ONBOARDING |
 *   FARMVAULT_EMAIL_FROM_BILLING   | FARMVAULT_EMAIL_FROM_ALERTS     |
 *   FARMVAULT_EMAIL_FROM_DEVELOPER | FARMVAULT_EMAIL_FROM_SUPPORT
 * Aliases: FARMVAULT_EMAIL_FROM_HELLO → onboarding; FARMVAULT_BILLING_EMAIL_FROM → billing
 */

export type FarmVaultEmailSenderKey = keyof typeof EMAIL_SENDERS;

export const EMAIL_SENDERS = {
  /** Smart Companion daily messages — warm, human, farm-companion tone. */
  companion:  "FarmVault Companion <companion@farmvault.africa>",
  onboarding: "FarmVault <hello@farmvault.africa>",
  billing:    "FarmVault Billing <billing@farmvault.africa>",
  /** Trial reminders, system-level operational alerts. */
  alerts:     "FarmVault Alerts <alerts@farmvault.africa>",
  /** Developer-facing alerts; same address as alerts, branded as System. */
  developer:  "FarmVault System <alerts@farmvault.africa>",
  support:    "FarmVault Support <support@farmvault.africa>",
} as const;

const ENV_KEY: Record<FarmVaultEmailSenderKey, string> = {
  companion:  "FARMVAULT_EMAIL_FROM_COMPANION",
  onboarding: "FARMVAULT_EMAIL_FROM_ONBOARDING",
  billing:    "FARMVAULT_EMAIL_FROM_BILLING",
  alerts:     "FARMVAULT_EMAIL_FROM_ALERTS",
  developer:  "FARMVAULT_EMAIL_FROM_DEVELOPER",
  support:    "FARMVAULT_EMAIL_FROM_SUPPORT",
};

const LEGACY_BILLING = "FARMVAULT_BILLING_EMAIL_FROM";
const LEGACY_HELLO_ALIAS = "FARMVAULT_EMAIL_FROM_HELLO";

export function getFarmVaultEmailFrom(key: FarmVaultEmailSenderKey): string {
  const specific = Deno.env.get(ENV_KEY[key])?.trim();
  if (specific) return specific;
  if (key === "onboarding") {
    const helloAlias = Deno.env.get(LEGACY_HELLO_ALIAS)?.trim();
    if (helloAlias) return helloAlias;
  }
  if (key === "billing") {
    const billingOnly = Deno.env.get(LEGACY_BILLING)?.trim();
    if (billingOnly) return billingOnly;
  }
  return EMAIL_SENDERS[key];
}

/**
 * Map persisted / logical `email_type` strings to the correct sender (for logs, cron, send-farmvault-email).
 * Unknown types default to onboarding (hello@), not noreply.
 */
export function getFarmVaultEmailFromForEmailType(emailType: string): string {
  const t = emailType.trim().toLowerCase().replace(/-/g, "_");
  if (!t) return getFarmVaultEmailFrom("onboarding");

  if (t.startsWith("developer_")) return getFarmVaultEmailFrom("developer");

  const developerInboxTypes = new Set([
    "submission_admin_notify",
    "submission_onboarding_complete_developer_notify",
    "company_registration_developer_notify",
    "ambassador_onboarding_admin_notify",
  ]);
  if (developerInboxTypes.has(t)) return getFarmVaultEmailFrom("developer");

  // Smart Companion daily messages → greetings@ (warm companion identity)
  const companionTypes = new Set([
    "smart_farmer_morning",
    "smart_farmer_evening",
    "engagement_inactivity",
    "smart_farmer_weekly",
    // legacy aliases kept for backward compatibility with existing email_logs rows
    "engagement_morning",
    "engagement_evening_reminder",
    "engagement_weekly_summary",
  ]);
  if (companionTypes.has(t)) return getFarmVaultEmailFrom("companion");
  if (t.startsWith("smart_farmer_")) return getFarmVaultEmailFrom("companion");

  const onboardingTypes = new Set([
    "welcome",
    "company_approved",
    "company_pro_trial_started",
    "pro_trial_started",
    "workspace_ready",
    "submission_received",
    "ambassador_welcome",
    "custom_manual",
  ]);
  if (onboardingTypes.has(t)) return getFarmVaultEmailFrom("onboarding");

  const billingTypes = new Set([
    "company_payment_received",
    "payment_received",
    "payment_approved",
    "company_payment_approved",
    "billing_receipt",
    "company_manual_payment_awaiting_approval",
    "company_manual_payment_submitted",
    "company_stk_payment_received",
    "subscription_activated",
  ]);
  if (billingTypes.has(t)) return getFarmVaultEmailFrom("billing");

  const alertsTypes = new Set([
    "trial_ending",
    "trial_expiring",
    "company_trial_expiring_soon",
    "company_trial_expired",
    "subscription_expired",
    "daily_summary",
  ]);
  if (alertsTypes.has(t)) return getFarmVaultEmailFrom("alerts");

  if (t.includes("trial_expir") || t.includes("subscription_expired")) {
    return getFarmVaultEmailFrom("alerts");
  }

  if (t.startsWith("engagement_")) return getFarmVaultEmailFrom("companion");

  if (
    t.includes("billing_receipt") ||
    t.includes("receipt") && (t.includes("billing") || t.includes("payment"))
  ) {
    return getFarmVaultEmailFrom("billing");
  }

  return getFarmVaultEmailFrom("onboarding");
}
