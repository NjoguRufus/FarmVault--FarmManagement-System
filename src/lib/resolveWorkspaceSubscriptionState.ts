import type { CompanySubscriptionGateState } from '@/services/subscriptionService';

export type WorkspaceSubscriptionPlan = 'trial' | 'basic' | 'pro' | 'enterprise';

export type WorkspaceSubscriptionStatus =
  | 'pending_approval'
  | 'pending_payment'
  | 'trial'
  | 'trialing'
  | 'active'
  | 'suspended'
  | 'rejected'
  | 'expired'
  | 'grace'
  | 'paused';

export interface ResolvedWorkspaceSubscriptionState {
  canWrite: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  isOverrideActive: boolean;
  plan: WorkspaceSubscriptionPlan;
  status: WorkspaceSubscriptionStatus;
  trialExpiredNeedsPlan: boolean;
  trialEndsAt: string | null;
  /** Trial end or paid period end (ISO), for billing / renewal display. */
  displayAccessEndIso: string | null;
  /** Paid subscription active (not trial window); use for navbar + badges. */
  isActivePaid: boolean;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapGatePlanToWorkspacePlan(plan: string | null | undefined): WorkspaceSubscriptionPlan {
  if (!plan) return 'basic';
  switch (plan) {
    case 'trial':
      return 'trial';
    case 'starter':
    case 'basic':
      return 'basic';
    case 'professional':
    case 'pro':
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'basic';
  }
}

export function normalizeGateStatus(raw: string | null | undefined): WorkspaceSubscriptionStatus {
  const s = (raw ?? 'pending_approval').toLowerCase();
  if (s === 'trialing') return 'trialing';
  if (s === 'trial') return 'trial';
  if (s === 'active') return 'active';
  if (s === 'suspended') return 'suspended';
  if (s === 'rejected') return 'rejected';
  if (s === 'expired') return 'expired';
  if (s === 'pending_approval') return 'pending_approval';
  if (s === 'pending_payment') return 'pending_payment';
  return 'pending_approval';
}

/**
 * Single source of truth for workspace subscription presentation (billing, navbar, gates).
 * Call with the current `get_subscription_gate_state` row; pass `isDeveloper` for platform devs.
 */
export type ResolveWorkspaceSubscriptionOptions = {
  /** True when public.mpesa_payments has a confirmed STK row for this company (tenant read). */
  hasConfirmedStkPayment?: boolean;
};

export function resolveWorkspaceSubscriptionState(
  subscriptionState: CompanySubscriptionGateState | null,
  companyId: string | null,
  isDeveloper: boolean,
  now: Date = new Date(),
  options?: ResolveWorkspaceSubscriptionOptions,
): ResolvedWorkspaceSubscriptionState {
  if (isDeveloper) {
    return {
      canWrite: true,
      isTrial: false,
      isExpired: false,
      daysRemaining: null,
      isOverrideActive: false,
      plan: 'enterprise',
      status: 'active',
      trialExpiredNeedsPlan: false,
      trialEndsAt: null,
      displayAccessEndIso: null,
      isActivePaid: true,
    };
  }

  if (!companyId || !subscriptionState) {
    return {
      canWrite: true,
      isTrial: false,
      isExpired: false,
      daysRemaining: null,
      isOverrideActive: false,
      plan: 'basic',
      status: 'pending_approval',
      trialExpiredNeedsPlan: false,
      trialEndsAt: null,
      displayAccessEndIso: null,
      isActivePaid: false,
    };
  }

  const overrideActive = subscriptionState.developer_override_active === true;
  if (overrideActive) {
    return {
      canWrite: true,
      isTrial: false,
      isExpired: false,
      daysRemaining: null,
      isOverrideActive: true,
      plan: 'enterprise',
      status: 'active',
      trialExpiredNeedsPlan: false,
      trialEndsAt: subscriptionState.trial_ends_at ?? null,
      displayAccessEndIso:
        subscriptionState.current_period_end ??
        subscriptionState.active_until ??
        subscriptionState.trial_ends_at ??
        null,
      isActivePaid: true,
    };
  }

  const rawGateStatus = normalizeGateStatus(subscriptionState.status);
  const stkPaid =
    options?.hasConfirmedStkPayment === true &&
    rawGateStatus !== 'suspended' &&
    rawGateStatus !== 'rejected';

  const planSource = stkPaid
    ? String(subscriptionState.selected_plan ?? '')
        .toLowerCase()
        .includes('basic')
      ? 'basic'
      : 'pro'
    : subscriptionState.selected_plan;

  const subPlan = mapGatePlanToWorkspacePlan(planSource);
  const subStatus: WorkspaceSubscriptionStatus = stkPaid ? 'active' : rawGateStatus;

  // Gate RPC normalizes is_trial / trial_ends_at when status is active; treat active as paid regardless of legacy columns.
  const trialEnd = parseIsoDate(subscriptionState.trial_ends_at ?? undefined);
  const trialEnded = trialEnd != null && trialEnd.getTime() <= now.getTime();
  const trialRunning = trialEnd != null && trialEnd.getTime() > now.getTime();

  const dbIsTrial = subscriptionState.is_trial === true;

  // Paid active always wins over stale is_trial / trial_ends_at in DB.
  const isActivePaidRow = subStatus === 'active';

  // Count as Pro trial whenever the trial window is open and the row is not paid-active.
  // Include legacy pending_approval rows that already have trial end dates (pre–auto-activate migrations).
  const inProTrialWindow =
    !isActivePaidRow &&
    trialRunning &&
    (subStatus === 'trial' ||
      subStatus === 'trialing' ||
      (subStatus === 'pending_approval' && (dbIsTrial || subPlan === 'pro')));

  const trialExpiredNeedsPlan =
    !isActivePaidRow &&
    dbIsTrial &&
    trialEnded &&
    (subStatus === 'trial' || subStatus === 'trialing');

  let daysRemaining: number | null = null;
  if (inProTrialWindow && trialEnd) {
    const diff = trialEnd.getTime() - now.getTime();
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // Include pending_approval: hybrid onboarding lets new farms use the app (create projects, etc.)
  // while admin approval is pending — same as SubscriptionAccessGate allowing that status.
  const hasWorkspaceAccess =
    subStatus === 'trial' ||
    subStatus === 'trialing' ||
    subStatus === 'active' ||
    subStatus === 'pending_payment' ||
    subStatus === 'pending_approval';

  const canWrite =
    hasWorkspaceAccess && subStatus !== 'expired' && subStatus !== 'suspended' && subStatus !== 'rejected';

  const isTrial = inProTrialWindow;
  const isExpired = subStatus === 'expired' || trialExpiredNeedsPlan;

  const paidEnd =
    subscriptionState.current_period_end ?? subscriptionState.active_until ?? null;
  const paidEndStr = paidEnd ? String(paidEnd) : null;

  let displayAccessEndIso: string | null = null;
  if (isTrial && subscriptionState.trial_ends_at) {
    displayAccessEndIso = subscriptionState.trial_ends_at;
  } else if (isActivePaidRow && paidEndStr) {
    displayAccessEndIso = paidEndStr;
  } else if (subStatus === 'pending_payment' && paidEndStr) {
    displayAccessEndIso = paidEndStr;
  }

  const isActivePaid =
    isActivePaidRow && !inProTrialWindow && !trialExpiredNeedsPlan;

  return {
    canWrite,
    isTrial,
    isExpired,
    daysRemaining,
    isOverrideActive: false,
    plan: subPlan,
    status: subStatus,
    trialExpiredNeedsPlan,
    trialEndsAt: subscriptionState.trial_ends_at ?? null,
    displayAccessEndIso,
    isActivePaid,
  };
}
