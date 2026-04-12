export type ResolvedCompanyStatus =
  | 'suspended'
  | 'basic'
  | 'pro_active'
  | 'subscription_expired'
  | 'trial_active'
  | 'trial_expired'
  | 'payment_pending'
  | 'unknown';

export type ResolveCompanyStatusCompanyLike = {
  suspended?: boolean | null | undefined;
  plan?: string | null | undefined;
  payment_confirmed?: boolean | null | undefined;
  active_until?: string | null | undefined;
  trial_ends_at?: string | null | undefined;
};

function parseDateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normPlan(v: string | null | undefined): 'basic' | 'pro' | string {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'professional') return 'pro';
  if (s === 'starter') return 'basic';
  if (!s) return '';
  return s;
}

export function resolveCompanyStatus(
  company: ResolveCompanyStatusCompanyLike,
  now: Date = new Date(),
): ResolvedCompanyStatus {
  if (company.suspended) return 'suspended';

  const plan = normPlan(company.plan);
  if (plan === 'basic') return 'basic';

  if (plan === 'pro') {
    const activeUntil = parseDateOrNull(company.active_until);
    const trialEndsAt = parseDateOrNull(company.trial_ends_at);
    const paymentConfirmed = company.payment_confirmed === true;

    if (paymentConfirmed && activeUntil && activeUntil > now) return 'pro_active';
    if (paymentConfirmed && activeUntil && activeUntil <= now) return 'subscription_expired';

    if (!paymentConfirmed && trialEndsAt && trialEndsAt > now) return 'trial_active';
    if (!paymentConfirmed && trialEndsAt && trialEndsAt <= now) return 'trial_expired';

    return 'payment_pending';
  }

  return 'unknown';
}

export function resolveCompanyStatusLabel(status: ResolvedCompanyStatus): string {
  switch (status) {
    case 'pro_active':
      return 'Pro Subscription';
    case 'trial_active':
      return 'Pro Trial';
    case 'trial_expired':
      return 'Trial Expired — Payment Required';
    case 'subscription_expired':
      return 'Subscription Expired';
    case 'basic':
      return 'Basic Plan';
    case 'suspended':
      return 'Suspended';
    case 'payment_pending':
      return 'Payment Pending';
    default:
      return 'Unknown';
  }
}

export function resolveCompanyStatusBadgeClass(status: ResolvedCompanyStatus): string {
  if (status === 'pro_active') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  if (status === 'trial_active') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  if (status === 'trial_expired' || status === 'subscription_expired') {
    return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  }
  if (status === 'payment_pending') return 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200';
  if (status === 'suspended') return 'border-border bg-muted text-muted-foreground';
  if (status === 'basic') return 'border-border bg-muted text-muted-foreground';
  return 'border-border bg-muted text-muted-foreground';
}

