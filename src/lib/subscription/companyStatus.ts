export type CompanyStatus =
  | 'basic_active'
  | 'pro_active'
  | 'trial_active'
  | 'trial_expired'
  | 'subscription_expired'
  | 'payment_pending'
  | 'pending_confirmation'
  | 'suspended';

export type CompanyStatusCompanyLike = {
  suspended?: boolean | null | undefined;
  pending_confirmation?: boolean | null | undefined;
  trial_ends_at?: string | null | undefined;
  payment_confirmed?: boolean | null | undefined;
  active_until?: string | null | undefined;
  plan?: string | null | undefined;
  /** From list_companies / company_subscriptions (trialing tenant). */
  is_trial?: boolean | null | undefined;
  subscription_status?: string | null | undefined;
  /** True when public.mpesa_payments has a confirmed STK row (result_code 0 and/or SUCCESS|COMPLETED). */
  has_confirmed_stk_payment?: boolean | null | undefined;
};

function parseDateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normPlan(v: string | null | undefined): 'basic' | 'pro' | string {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'professional') return 'pro';
  if (!s) return '';
  // pro_trial, pro_monthly, pro_trial_7d, etc. → pro for active/paid tier logic
  if (s.startsWith('pro')) return 'pro';
  if (s.startsWith('basic')) return 'basic';
  return s;
}

export function computeCompanyStatus(company: CompanyStatusCompanyLike, now: Date = new Date()): CompanyStatus {
  if (company.suspended) return 'suspended';

  if (company.has_confirmed_stk_payment === true) {
    const plan = normPlan(company.plan);
    if (plan === 'basic') return 'basic_active';
    return 'pro_active';
  }

  if (company.pending_confirmation) return 'pending_confirmation';

  const trialEnd = parseDateOrNull(company.trial_ends_at);
  const activeUntil = parseDateOrNull(company.active_until);
  const paymentConfirmed = company.payment_confirmed === true;
  const plan = normPlan(company.plan);
  const subStatus = String(company.subscription_status ?? '').trim().toLowerCase();

  // PRIORITY 1: Confirmed paid subscription — always wins over any trial flag.
  // subscription_status = 'active' is the canonical signal; fall back to payment_confirmed +
  // active_until when the status column hasn't been synced yet.
  const subscriptionIsActive = subStatus === 'active';
  const hasActivePaid =
    subscriptionIsActive ||
    (paymentConfirmed && activeUntil != null && activeUntil > now);

  if (hasActivePaid) {
    if (activeUntil && activeUntil <= now) return 'subscription_expired';
    if (plan === 'pro' || subStatus === 'active') return 'pro_active';
    return 'basic_active';
  }

  // PRIORITY 2: Trial window open (only when no confirmed paid subscription).
  const subscriptionSaysTrialing = subStatus === 'trialing' || subStatus === 'trial';
  const flagSaysTrial = company.is_trial === true;

  if (trialEnd && trialEnd > now && (flagSaysTrial || subscriptionSaysTrialing)) {
    return 'trial_active';
  }
  if (trialEnd && trialEnd <= now && !paymentConfirmed) return 'trial_expired';

  if (activeUntil && activeUntil <= now) return 'subscription_expired';

  if (plan === 'pro' && activeUntil && activeUntil > now) return 'pro_active';
  if (plan === 'basic' && activeUntil && activeUntil > now) return 'basic_active';

  if (plan === 'pro' && !paymentConfirmed) return 'payment_pending';

  return 'basic_active';
}

export function companyStatusAccessLabel(status: CompanyStatus): string {
  switch (status) {
    case 'pro_active':
      return 'Pro Active';
    case 'basic_active':
      return 'Basic Active';
    case 'trial_active':
      return 'Trial Active';
    case 'trial_expired':
      return 'Trial Expired — Payment Required';
    case 'subscription_expired':
      return 'Subscription Expired — Pending Payment';
    case 'payment_pending':
      return 'Payment Pending';
    case 'pending_confirmation':
      return 'Pending Confirmation';
    default:
      return 'Suspended';
  }
}

export function companyStatusBadgeClass(status: CompanyStatus): string {
  if (status === 'pro_active') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  if (status === 'basic_active') return 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200';
  if (status === 'trial_active') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  if (status === 'pending_confirmation') return 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200';
  if (status === 'trial_expired' || status === 'subscription_expired') {
    return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  }
  if (status === 'payment_pending') return 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-200';
  return 'border-border bg-muted text-muted-foreground';
}

