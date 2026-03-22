import { buildWelcomeEmail } from "./welcomeEmailTemplate.ts";
import { buildSubscriptionActivatedEmail } from "./subscriptionActivatedTemplate.ts";
import { buildTrialEndingEmail } from "./trialEndingTemplate.ts";
import { buildCompanyApprovedEmail } from "./companyApprovedTemplate.ts";
import type { FarmVaultEmailType } from "./types.ts";
import type { WelcomeEmailData } from "./types.ts";
import type { SubscriptionActivatedEmailData } from "./types.ts";
import type { TrialEndingEmailData } from "./types.ts";
import type { CompanyApprovedEmailData } from "./types.ts";

export type RenderedFarmVaultEmail = { subject: string; html: string };

export function renderFarmVaultEmail(
  emailType: FarmVaultEmailType,
  data: unknown,
): RenderedFarmVaultEmail {
  switch (emailType) {
    case "welcome":
      return buildWelcomeEmail(data as WelcomeEmailData);
    case "subscription_activated":
      return buildSubscriptionActivatedEmail(data as SubscriptionActivatedEmailData);
    case "trial_ending":
      return buildTrialEndingEmail(data as TrialEndingEmailData);
    case "company_approved":
      return buildCompanyApprovedEmail(data as CompanyApprovedEmailData);
    default: {
      const _exhaustive: never = emailType;
      throw new Error(`Unsupported email type: ${_exhaustive}`);
    }
  }
}
