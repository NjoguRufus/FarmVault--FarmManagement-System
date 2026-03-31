export type SubscriptionPlanCode = 'basic' | 'pro';
export type AccessType = 'trial' | 'subscription';
export type AccessStatus = 'active' | 'expired' | 'suspended';

export type SubscriptionVisibilityInput = {
  planCode?: string | null | undefined;
  trialStartsAt?: string | null | undefined;
  trialEndsAt?: string | null | undefined;
  activeUntil?: string | null | undefined;
  /**
   * Canonical trial indicator from billing/subscription row.
   * IMPORTANT: approval flow may set `active_until` for trial access; this flag must override that
   * so trials are never displayed as paid subscriptions.
   */
  isTrial?: boolean | null | undefined;
  /**
   * Optional raw subscription status (e.g. "trialing", "active", "expired").
   * Used as an additional signal to avoid marking trials as paid.
   */
  subscriptionStatus?: string | null | undefined;
  isSuspended: boolean;
};

export type SubscriptionVisibility = {
  plan: SubscriptionPlanCode;
  accessType: AccessType;
  accessStatus: AccessStatus;
  paymentRequired: boolean;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  activeUntil: string | null;
  /**
   * Convenience label: "Pro Trial Active", "Basic Subscription Expired", "Suspended", etc.
   * Always explicit about Access Type when not suspended.
   */
  displayLabel: string;
};

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizePlanCode(v: string | null | undefined): SubscriptionPlanCode {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'pro' || s === 'professional') return 'pro';
  return 'basic';
}

export function formatPlanLabel(plan: SubscriptionPlanCode): 'Basic' | 'Pro' {
  return plan === 'pro' ? 'Pro' : 'Basic';
}

export function computeSubscriptionVisibility(
  input: SubscriptionVisibilityInput,
  now: Date = new Date(),
): SubscriptionVisibility {
  const plan = normalizePlanCode(input.planCode);
  const trialStartsAt = input.trialStartsAt ? String(input.trialStartsAt) : null;
  const trialEndsAt = input.trialEndsAt ? String(input.trialEndsAt) : null;
  const activeUntil = input.activeUntil ? String(input.activeUntil) : null;

  if (input.isSuspended) {
    return {
      plan,
      accessType: 'subscription',
      accessStatus: 'suspended',
      paymentRequired: false,
      trialStartsAt,
      trialEndsAt,
      activeUntil,
      displayLabel: 'Suspended',
    };
  }

  const trialEndDate = parseDate(trialEndsAt);
  const activeUntilDate = parseDate(activeUntil);

  const statusNorm = String(input.subscriptionStatus ?? '').trim().toLowerCase();
  const isTrialLike = Boolean(input.isTrial) || statusNorm === 'trialing' || statusNorm === 'trial';

  // Paid access must be BOTH time-valid AND not trial-like.
  // This prevents "approved 7-day trial" companies from showing as paid just because active_until exists.
  const hasActivePaid = !isTrialLike && !!activeUntilDate && activeUntilDate.getTime() > now.getTime();
  const hasActiveTrial = !!trialEndDate && trialEndDate.getTime() > now.getTime();

  const accessStatus: AccessStatus = hasActivePaid || hasActiveTrial ? 'active' : 'expired';

  const accessType: AccessType = isTrialLike
    ? 'trial'
    : hasActivePaid
      ? 'subscription'
      : hasActiveTrial
        ? 'trial'
        : activeUntilDate
          ? 'subscription'
          : trialEndDate
            ? 'trial'
            : 'subscription';

  const paymentRequired = accessStatus === 'expired';

  const labelPlan = formatPlanLabel(plan);
  const labelType = accessType === 'trial' ? 'Trial' : 'Subscription';
  const labelStatus = accessStatus === 'active' ? 'Active' : 'Expired';

  return {
    plan,
    accessType,
    accessStatus,
    paymentRequired,
    trialStartsAt,
    trialEndsAt,
    activeUntil,
    displayLabel: `${labelPlan} ${labelType} ${labelStatus}`,
  };
}

export function subscriptionVisibilityBadgeClass(v: Pick<SubscriptionVisibility, 'accessStatus' | 'accessType'>): string {
  if (v.accessStatus === 'suspended') return 'border-border bg-muted text-muted-foreground';
  if (v.accessStatus === 'expired') return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  // active
  if (v.accessType === 'subscription') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
}

