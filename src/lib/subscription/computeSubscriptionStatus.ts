export type ComputedCompanySubscriptionStatus =
  | 'ACTIVE_PRO'
  | 'PRO_TRIAL'
  | 'PAYMENT_DUE'
  | 'EXPIRED'
  | 'BASIC';

export type CompanySubscriptionStatusCompanyLike = {
  trial_ends_at?: string | null | undefined;
  active_until?: string | null | undefined;
  payment_confirmed?: boolean | null | undefined;
};

function parseDateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeSubscriptionStatus(
  company: CompanySubscriptionStatusCompanyLike,
  now: Date = new Date(),
): ComputedCompanySubscriptionStatus {
  const trialExpiry = parseDateOrNull(company.trial_ends_at);
  const subscriptionExpiry = parseDateOrNull(company.active_until);
  const hasConfirmedPayment = company.payment_confirmed === true;

  if (hasConfirmedPayment && subscriptionExpiry && subscriptionExpiry > now) {
    return 'ACTIVE_PRO';
  }

  if (!hasConfirmedPayment && trialExpiry && trialExpiry > now) {
    return 'PRO_TRIAL';
  }

  if (!hasConfirmedPayment && trialExpiry && trialExpiry < now) {
    return 'PAYMENT_DUE';
  }

  if (hasConfirmedPayment && subscriptionExpiry && subscriptionExpiry < now) {
    return 'EXPIRED';
  }

  return 'BASIC';
}

export function subscriptionStatusLabel(status: ComputedCompanySubscriptionStatus): string {
  switch (status) {
    case 'ACTIVE_PRO':
      return 'Pro Subscription';
    case 'PRO_TRIAL':
      return 'Pro Trial';
    case 'PAYMENT_DUE':
      return 'Trial Expired — Payment Required';
    case 'EXPIRED':
      return 'Subscription Expired';
    default:
      return 'Basic Plan';
  }
}

