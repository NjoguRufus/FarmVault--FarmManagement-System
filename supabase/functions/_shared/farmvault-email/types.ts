/** Supported transactional email kinds (extend with password_reset, invite, etc.). */
export type FarmVaultEmailType =
  | "welcome"
  | "subscription_activated"
  | "trial_ending"
  | "company_approved";

export type WelcomeEmailData = {
  companyName: string;
  dashboardUrl: string;
};

export type SubscriptionActivatedEmailData = {
  companyName: string;
  planName: string;
  renewalDate: string;
  dashboardUrl: string;
};

export type TrialEndingEmailData = {
  companyName: string;
  daysLeft: number;
  upgradeUrl: string;
};

/** Sent when a company leaves pending approval and their workspace is ready (developer approval). */
export type CompanyApprovedEmailData = {
  companyName: string;
  dashboardUrl: string;
};

export type FarmVaultEmailDataMap = {
  welcome: WelcomeEmailData;
  subscription_activated: SubscriptionActivatedEmailData;
  trial_ending: TrialEndingEmailData;
  company_approved: CompanyApprovedEmailData;
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
  )
  & SendFarmVaultEmailContext;
