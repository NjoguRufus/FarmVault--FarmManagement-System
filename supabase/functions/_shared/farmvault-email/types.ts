/** Supported transactional email kinds (extend with password_reset, invite, etc.). */
export type FarmVaultEmailType =
  | "welcome"
  | "subscription_activated"
  | "trial_ending"
  | "company_approved"
  | "custom_manual";

/**
 * Optional QR share strip (footer-adjacent in `farmVaultEmailShell`).
 * Transactional templates: default off unless `showQrCode === true`.
 * `custom_manual`: default on unless `showQrCode === false`.
 */
export type FarmVaultEmailQrOptions = {
  showQrCode?: boolean;
  qrCodeImageUrl?: string;
  qrCodeTargetUrl?: string;
};

export type WelcomeEmailData = {
  companyName: string;
  dashboardUrl: string;
} & FarmVaultEmailQrOptions;

export type SubscriptionActivatedEmailData = {
  companyName: string;
  planName: string;
  renewalDate: string;
  dashboardUrl: string;
} & FarmVaultEmailQrOptions;

export type TrialEndingEmailData = {
  companyName: string;
  daysLeft: number;
  upgradeUrl: string;
} & FarmVaultEmailQrOptions;

/** Sent when a company leaves pending approval and their workspace is ready (developer approval). */
export type CompanyApprovedEmailData = {
  companyName: string;
  dashboardUrl: string;
} & FarmVaultEmailQrOptions;

/** Developer console: manual send to any address (requires is_developer). */
export type CustomManualEmailData = {
  subject: string;
  /** Plain text; used when `html` is not set (server converts to paragraphs). */
  body?: string;
  /** Pre-rendered body HTML fragment (inserted inside branded shell). */
  html?: string;
  recipientName?: string;
  category?: string;
} & FarmVaultEmailQrOptions;

export type FarmVaultEmailDataMap = {
  welcome: WelcomeEmailData;
  subscription_activated: SubscriptionActivatedEmailData;
  trial_ending: TrialEndingEmailData;
  company_approved: CompanyApprovedEmailData;
  custom_manual: CustomManualEmailData;
};

/** Optional audit/context fields for logging (stored in email_logs). */
export type SendFarmVaultEmailContext = {
  companyId?: string | null;
  /** Denormalized display name; falls back to template data when omitted. */
  companyName?: string | null;
  triggeredBy?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SendFarmVaultEmailPayload =
  & (
    | { emailType: "welcome"; to: string; data: WelcomeEmailData }
    | { emailType: "subscription_activated"; to: string; data: SubscriptionActivatedEmailData }
    | { emailType: "trial_ending"; to: string; data: TrialEndingEmailData }
    | { emailType: "company_approved"; to: string; data: CompanyApprovedEmailData }
    | {
        emailType: "custom_manual";
        to: string;
        data: CustomManualEmailData;
        /** Optional: same as `data.subject` / `data.html` for flat client payloads. */
        subject?: string;
        html?: string;
      }
  )
  & SendFarmVaultEmailContext;
