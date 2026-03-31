export type ComputedSubscriptionStatusKey =
  | 'trial_active'
  | 'trial_expired'
  | 'active_paid'
  | 'subscription_expired'
  | 'suspended';

export type ComputedSubscriptionStatus = {
  key: ComputedSubscriptionStatusKey;
  label: string;
  /**
   * True when access should be blocked until payment is confirmed.
   * Rule: (trial expired OR subscription expired) AND not suspended.
   */
  paymentRequired: boolean;
  /** Positive/zero means remaining; negative means already expired (in days). */
  daysRemaining: number | null;
  /** ISO string used to compute `daysRemaining` (trial_end or active_until). */
  effectiveUntil: string | null;
};

type StatusInputs = {
  trialEnd: string | null | undefined;
  activeUntil: string | null | undefined;
  /** Suspension should win over all other states. */
  isSuspended: boolean;
  /** Optional plan name/code for labels (Pro/Basic/etc). */
  planCode?: string | null | undefined;
};

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffDaysCeil(until: Date, now: Date): number {
  const ms = until.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatPlan(planCode: string | null | undefined): string | null {
  const p = String(planCode ?? '').trim();
  if (!p) return null;
  const lowered = p.toLowerCase();
  if (lowered === 'pro' || lowered === 'professional') return 'Pro';
  if (lowered === 'basic') return 'Basic';
  if (lowered === 'enterprise') return 'Enterprise';
  return p;
}

/**
 * Compute subscription lifecycle status from real dates.
 *
 * Precedence:
 * - Suspended
 * - Active Paid (active_until > now)
 * - Trial Active (trial_end > now)
 * - Trial Expired (trial_end < now AND not Active Paid)
 * - Subscription Expired (active_until < now)
 *
 * Notes:
 * - "no active payment" is treated as "not currently active paid" (active_until <= now or null).
 */
export function computeSubscriptionStatus(input: StatusInputs, now: Date = new Date()): ComputedSubscriptionStatus {
  const trialEndDate = parseDate(input.trialEnd);
  const activeUntilDate = parseDate(input.activeUntil);
  const planLabel = formatPlan(input.planCode);

  if (input.isSuspended) {
    return {
      key: 'suspended',
      label: 'Suspended',
      paymentRequired: false,
      daysRemaining: null,
      effectiveUntil: null,
    };
  }

  if (activeUntilDate && activeUntilDate.getTime() > now.getTime()) {
    return {
      key: 'active_paid',
      label: planLabel ? `Active (${planLabel})` : 'Active',
      paymentRequired: false,
      daysRemaining: diffDaysCeil(activeUntilDate, now),
      effectiveUntil: activeUntilDate.toISOString(),
    };
  }

  if (trialEndDate && trialEndDate.getTime() > now.getTime()) {
    const days = diffDaysCeil(trialEndDate, now);
    return {
      key: 'trial_active',
      label: days <= 14 ? `Trial (${days} day${days === 1 ? '' : 's'} left)` : 'Trial',
      paymentRequired: false,
      daysRemaining: days,
      effectiveUntil: trialEndDate.toISOString(),
    };
  }

  const trialExpired = !!trialEndDate && trialEndDate.getTime() <= now.getTime();
  if (trialExpired) {
    return {
      key: 'trial_expired',
      label: 'Trial expired',
      paymentRequired: true,
      daysRemaining: diffDaysCeil(trialEndDate!, now),
      effectiveUntil: trialEndDate!.toISOString(),
    };
  }

  if (activeUntilDate && activeUntilDate.getTime() <= now.getTime()) {
    return {
      key: 'subscription_expired',
      label: 'Subscription expired',
      paymentRequired: true,
      daysRemaining: diffDaysCeil(activeUntilDate, now),
      effectiveUntil: activeUntilDate.toISOString(),
    };
  }

  // No dates present (new tenant / unset). Treat as trial expired → payment required.
  return {
    key: 'trial_expired',
    label: 'Payment due',
    paymentRequired: true,
    daysRemaining: null,
    effectiveUntil: null,
  };
}

export function subscriptionStatusBadgeClass(status: ComputedSubscriptionStatus): string {
  if (status.key === 'suspended') return 'border-border bg-muted text-muted-foreground';
  if (status.key === 'active_paid') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  if (status.key === 'trial_active') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  if (status.key === 'trial_expired' || status.key === 'subscription_expired') {
    return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  }
  return 'border-border bg-muted text-muted-foreground';
}

