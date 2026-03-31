export type ApprovalStatus = 'pending' | 'approved' | 'suspended' | 'rejected' | 'deleted';
export type PlanCode = 'basic' | 'pro';
export type AccessSource = 'trial' | 'subscription';
export type PaymentStatus = 'unpaid' | 'pending_confirmation' | 'paid' | 'rejected';
export type AccessStatus = 'active' | 'expired' | 'suspended';

export type CompanySubscriptionStateInput = {
  // Company lifecycle (hybrid approval)
  companyStatus?: string | null | undefined;

  // Subscription row signals (company_subscriptions)
  planCode?: string | null | undefined;
  subscriptionStatus?: string | null | undefined;
  isTrial?: boolean | null | undefined;
  trialStartsAt?: string | null | undefined;
  trialEndsAt?: string | null | undefined;
  activeUntil?: string | null | undefined;

  // Latest payment signal (subscription_payments)
  latestPaymentStatus?: string | null | undefined;
};

export type CompanySubscriptionState = {
  approvalStatus: ApprovalStatus;
  plan: PlanCode;
  accessSource: AccessSource;
  paymentStatus: PaymentStatus;
  accessStatus: AccessStatus;

  trialStart: string | null;
  trialEnd: string | null;
  activeUntil: string | null;

  /** Which date drives access countdown (trial_end vs active_until). */
  effectiveUntil: string | null;
  /** Countdown in days (ceil). Null when no effective date. */
  daysRemaining: number | null;

  paymentRequired: boolean;
  displayLabel:
    | 'Pro Trial'
    | 'Trial Expired'
    | 'Pending Confirmation'
    | 'Pro Subscription'
    | 'Basic Subscription'
    | 'Subscription Expired'
    | 'Suspended';
};

function norm(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffDaysCeil(until: Date, now: Date): number {
  const ms = until.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function normalizePlan(planCode: string | null | undefined): PlanCode {
  const p = norm(planCode);
  if (p === 'pro' || p === 'professional') return 'pro';
  return 'basic';
}

function normalizeApprovalStatus(companyStatus: string | null | undefined): ApprovalStatus {
  const cs = norm(companyStatus);
  if (cs === 'pending') return 'pending';
  if (cs === 'active') return 'approved';
  if (cs === 'suspended') return 'suspended';
  if (cs === 'rejected') return 'rejected';
  if (cs === 'deleted') return 'deleted';
  // Default: treat unknown/missing as approved (most existing workspaces are active).
  return 'approved';
}

function normalizePaymentStatus(latestPaymentStatus: string | null | undefined): PaymentStatus {
  const ps = norm(latestPaymentStatus);
  if (!ps) return 'unpaid';
  if (ps === 'approved') return 'paid';
  if (ps === 'rejected') return 'rejected';
  if (ps === 'pending' || ps === 'pending_verification') return 'pending_confirmation';
  // Unknown payment enum values should not grant paid access.
  return 'unpaid';
}

export function computeCompanySubscriptionState(
  input: CompanySubscriptionStateInput,
  now: Date = new Date(),
): CompanySubscriptionState {
  const approvalStatus = normalizeApprovalStatus(input.companyStatus);
  const plan = normalizePlan(input.planCode);

  const subStatus = norm(input.subscriptionStatus);
  const suspended =
    approvalStatus === 'suspended' || subStatus === 'suspended';

  const trialEndDate = parseDate(input.trialEndsAt);
  const activeUntilDate = parseDate(input.activeUntil);

  const paymentStatus = normalizePaymentStatus(input.latestPaymentStatus);

  const isTrialLike =
    Boolean(input.isTrial) || subStatus === 'trial' || subStatus === 'trialing';

  const hasActiveTrial = !!trialEndDate && trialEndDate.getTime() > now.getTime();
  const hasActiveSubscription = !!activeUntilDate && activeUntilDate.getTime() > now.getTime();

  const accessStatus: AccessStatus = suspended
    ? 'suspended'
    : hasActiveTrial || hasActiveSubscription
      ? 'active'
      : 'expired';

  // Source of access is about *why* access exists, not whether money is paid.
  // A company can have pending_confirmation while still on trial.
  const accessSource: AccessSource =
    isTrialLike && (hasActiveTrial || (!hasActiveSubscription && !!trialEndDate))
      ? 'trial'
      : 'subscription';

  // Countdown date must match the real access source.
  // - Trial → trialEnd (approval/extension)
  // - Subscription → activeUntil (paid billing cycle)
  const effectiveUntilDate = accessSource === 'trial' ? trialEndDate : activeUntilDate;
  const effectiveUntil = effectiveUntilDate ? effectiveUntilDate.toISOString() : null;
  const daysRemaining = effectiveUntilDate ? diffDaysCeil(effectiveUntilDate, now) : null;

  const paymentRequired =
    accessStatus === 'expired' &&
    accessSource !== 'subscription' // trial ended
      ? paymentStatus !== 'paid'
      : accessStatus === 'expired' && accessSource === 'subscription'
        ? true
        : false;

  let displayLabel: CompanySubscriptionState['displayLabel'];
  if (accessStatus === 'suspended') {
    displayLabel = 'Suspended';
  } else if (paymentStatus === 'pending_confirmation') {
    displayLabel = 'Pending Confirmation';
  } else if (accessSource === 'trial') {
    displayLabel = accessStatus === 'active' ? 'Pro Trial' : 'Trial Expired';
  } else {
    if (accessStatus === 'expired') {
      displayLabel = 'Subscription Expired';
    } else {
      displayLabel = plan === 'pro' ? 'Pro Subscription' : 'Basic Subscription';
    }
  }

  return {
    approvalStatus,
    plan,
    accessSource,
    paymentStatus,
    accessStatus,
    trialStart: input.trialStartsAt ? String(input.trialStartsAt) : null,
    trialEnd: input.trialEndsAt ? String(input.trialEndsAt) : null,
    activeUntil: input.activeUntil ? String(input.activeUntil) : null,
    effectiveUntil,
    daysRemaining,
    paymentRequired: accessStatus !== 'suspended' && (paymentRequired || (accessStatus === 'expired' && paymentStatus !== 'paid')),
    displayLabel,
  };
}

export function companySubscriptionBadgeClass(s: Pick<CompanySubscriptionState, 'displayLabel'>): string {
  if (s.displayLabel === 'Suspended') return 'border-border bg-muted text-muted-foreground';
  if (s.displayLabel === 'Pro Trial') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  if (s.displayLabel === 'Pending Confirmation') return 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200';
  if (s.displayLabel === 'Trial Expired' || s.displayLabel === 'Subscription Expired') {
    return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  }
  // Paid active
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
}

