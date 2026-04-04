import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Crown,
  CreditCard,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useBillingPrices } from '@/hooks/useBillingPrices';
import { getCompany, type CompanyDoc } from '@/services/companyService';
import {
  getCurrentCompanySubscription,
  listCompanySubscriptionPayments,
  type CompanySubscriptionRow,
  type PaymentSubmissionRow,
} from '@/services/billingSubmissionService';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { Button } from '@/components/ui/button';
import { SUBSCRIPTION_PLANS } from '@/config/plans';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import {
  billingCycleDurationMonths,
  billingCycleLabel,
  billingPlanLabel,
  computeBundleSavingsKes,
  getBillingAmountKes,
  parseBillingCycle,
} from '@/lib/billingPricing';
import { PlanSelector } from '@/components/subscription/billing/PlanSelector';
import { BillingCycleSelector } from '@/components/subscription/billing/BillingCycleSelector';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';

const TILL = (import.meta.env.VITE_MPESA_TILL_NUMBER as string | undefined)?.trim() || '5334350';
const BUSINESS = (import.meta.env.VITE_MPESA_BUSINESS_NAME as string | undefined)?.trim() || 'FarmVault';

function gatePlanToWorkspacePlan(
  p: 'trial' | 'basic' | 'pro' | 'enterprise',
): BillingSubmissionPlan {
  if (p === 'basic') return 'basic';
  return 'pro';
}

function paymentStatusMeta(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  if (s === 'approved') {
    return { label: 'Approved', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' };
  }
  if (s === 'rejected') {
    return { label: 'Rejected', className: 'bg-destructive/15 text-destructive' };
  }
  if (s === 'pending_verification') {
    return { label: 'Pending review', className: 'bg-amber-500/15 text-amber-950 dark:text-amber-200' };
  }
  return { label: 'Pending', className: 'bg-sky-500/10 text-sky-900 dark:text-sky-200' };
}

function cycleLabelFromRow(mode: string | null, cycle: string | null): string {
  const parsed = parseBillingCycle(cycle ?? mode);
  if (parsed) return billingCycleLabel(parsed);
  const m = (mode ?? '').toLowerCase().trim();
  if (m === 'manual' || m === 'mpesa_manual') {
    const c = parseBillingCycle(cycle);
    if (c) return billingCycleLabel(c);
    return 'M-Pesa (manual)';
  }
  return '—';
}

export default function BillingPage() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BillingSubmissionPlan>('pro');
  const [selectedCycle, setSelectedCycle] = useState<BillingSubmissionCycle>('monthly');
  const prefsInitialized = useRef(false);

  const {
    plan: gatePlan,
    status: gateStatus,
    isTrial,
    isExpired,
    daysRemaining,
    isOverrideActive,
    trialExpiredNeedsPlan,
    isLoading: gateLoading,
    trialEndsAt,
    displayAccessEndIso,
    isActivePaid,
    billingModeFromGate,
    billingCycleFromGate,
  } = useSubscriptionStatus();

  const { matrix: billingPriceMatrix, getAmount: getLivePrice, getBundleSavings: getLiveBundleSavings } =
    useBillingPrices({ enabled: !isDeveloper });

  const { data: company } = useQuery<CompanyDoc | null>({
    queryKey: ['company-billing', companyId],
    enabled: !!companyId,
    queryFn: () => getCompany(companyId!),
  });

  const { data: subRow, isLoading: subLoading } = useQuery({
    queryKey: ['company-subscription-row', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => getCurrentCompanySubscription(companyId!),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['subscription-payments-supabase', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => listCompanySubscriptionPayments(companyId!),
  });

  const workspacePlan = useMemo(() => gatePlanToWorkspacePlan(gatePlan), [gatePlan]);

  useEffect(() => {
    if (!companyId || isDeveloper) return;
    captureEvent(AnalyticsEvents.SUBSCRIPTION_PAGE_VIEWED, {
      company_id: companyId,
      subscription_plan: workspacePlan,
      module_name: 'billing',
      route_path: '/billing',
    });
  }, [companyId, isDeveloper, workspacePlan]);

  const latestApprovedBillingCycle = useMemo(() => {
    const approved = (payments as PaymentSubmissionRow[]).find((p) => (p.status ?? '').toLowerCase() === 'approved');
    return approved?.billing_cycle ?? null;
  }, [payments]);

  const workspaceCycle = useMemo(() => {
    const row = subRow as CompanySubscriptionRow | null | undefined;
    return parseBillingCycle(
      row?.billing_cycle ?? billingCycleFromGate ?? latestApprovedBillingCycle ?? row?.billing_mode ?? billingModeFromGate,
    );
  }, [subRow, billingCycleFromGate, billingModeFromGate, latestApprovedBillingCycle]);

  useEffect(() => {
    prefsInitialized.current = false;
  }, [companyId]);

  useEffect(() => {
    if (prefsInitialized.current || isDeveloper || gateLoading) return;
    if (!companyId) return;
    if (subLoading) return;
    setSelectedPlan(workspacePlan);
    setSelectedCycle(workspaceCycle ?? 'monthly');
    prefsInitialized.current = true;
  }, [companyId, workspacePlan, workspaceCycle, gateLoading, subLoading, isDeveloper]);

  useEffect(() => {
    if (!import.meta.env.DEV || isDeveloper || !companyId) return;
    // eslint-disable-next-line no-console
    console.log('[BillingPage] resolved subscription for UI', {
      companyId,
      isActivePaid,
      gateStatus,
      displayAccessEndIso,
      subRowStatus: (subRow as CompanySubscriptionRow | null)?.status ?? null,
    });
  }, [companyId, isDeveloper, isActivePaid, gateStatus, displayAccessEndIso, subRow]);

  const checkoutAmount = useMemo(() => {
    const live = getLivePrice(selectedPlan, selectedCycle);
    if (live != null) return live;
    return getBillingAmountKes(selectedPlan, selectedCycle);
  }, [selectedPlan, selectedCycle, getLivePrice]);

  const checkoutSavings = useMemo(() => {
    if (billingPriceMatrix) return getLiveBundleSavings(selectedPlan, selectedCycle);
    return computeBundleSavingsKes(selectedPlan, selectedCycle);
  }, [selectedPlan, selectedCycle, billingPriceMatrix, getLiveBundleSavings]);

  const periodSuffix = useMemo(() => {
    switch (selectedCycle) {
      case 'monthly':
        return '/ month';
      case 'seasonal':
        return '/ season';
      case 'annual':
        return '/ year';
    }
  }, [selectedCycle]);

  const planTitle = useMemo(() => {
    if (isDeveloper) return 'Developer';
    if (isTrial) return 'Pro';
    switch (gatePlan) {
      case 'basic':
        return 'Basic';
      case 'pro':
        return 'Pro';
      case 'enterprise':
        return 'Enterprise';
      default:
        return 'Workspace';
    }
  }, [gatePlan, isTrial, isDeveloper]);

  const statusHeadline = useMemo(() => {
    if (isDeveloper) return 'Full platform access';
    if (isOverrideActive) return 'Developer override active';
    if (gateStatus === 'pending_approval') return 'Awaiting approval';
    if (gateStatus === 'pending_payment') return 'Payment under review';
    if (isActivePaid) return 'Active';
    if (isTrial) return 'Pro trial active';
    if (isExpired || trialExpiredNeedsPlan) return 'Subscription inactive';
    if (gateStatus === 'active') return 'Active';
    return 'Subscription';
  }, [isDeveloper, isOverrideActive, gateStatus, isActivePaid, isTrial, isExpired, trialExpiredNeedsPlan]);

  const statusDetail = useMemo(() => {
    if (isDeveloper) return 'Your account is not billed through this workspace.';
    if (isOverrideActive) return 'Billing and limits are managed by the FarmVault team.';
    if (gateStatus === 'pending_approval') return 'Complete activation to start your trial or paid plan.';
    if (gateStatus === 'pending_payment') return 'We will activate your plan after M-Pesa verification.';
    if (isActivePaid) return 'Your paid subscription is active. Renew before the end date to avoid interruption.';
    if (trialExpiredNeedsPlan) return 'Choose Basic or Pro to continue with full access.';
    if (isExpired) return 'Renew to restore full write access to your farm data.';
    if (isTrial) return 'Enjoy full Pro features during your trial window.';
    return 'Thank you for being a FarmVault customer.';
  }, [isDeveloper, isOverrideActive, gateStatus, isActivePaid, trialExpiredNeedsPlan, isExpired, isTrial]);

  const expiryLabel = useMemo(() => {
    if (isDeveloper) return '—';
    const iso =
      displayAccessEndIso ??
      subRow?.current_period_end ??
      subRow?.active_until ??
      trialEndsAt ??
      subRow?.trial_ends_at ??
      null;
    if (!iso) return '—';
    try {
      return format(parseISO(iso), 'PP');
    } catch {
      return '—';
    }
  }, [isDeveloper, displayAccessEndIso, trialEndsAt, subRow]);

  const billingCycleDisplay = useMemo(() => {
    if (isDeveloper) return '—';
    const row = subRow as CompanySubscriptionRow | null | undefined;
    const mode = row?.billing_mode ?? billingModeFromGate ?? null;
    const cycle = row?.billing_cycle ?? billingCycleFromGate ?? latestApprovedBillingCycle ?? null;
    return cycleLabelFromRow(mode, cycle);
  }, [isDeveloper, subRow, billingModeFromGate, billingCycleFromGate, latestApprovedBillingCycle]);

  const primaryCtaLabel = useMemo(() => {
    if (isDeveloper) return null;
    if (isOverrideActive || gateStatus === 'pending_approval' || gateStatus === 'pending_payment') return null;
    if (isExpired || trialExpiredNeedsPlan) return 'Activate subscription';
    if (isTrial) return 'Upgrade';
    if (gatePlan === 'basic' && gateStatus === 'active') return 'Upgrade';
    return 'Renew & pay';
  }, [isDeveloper, isOverrideActive, gateStatus, isExpired, trialExpiredNeedsPlan, isTrial, gatePlan]);

  const showPaySection =
    !isDeveloper &&
    !isOverrideActive &&
    gateStatus !== 'pending_approval' &&
    gateStatus !== 'pending_payment';

  const trialBannerText = useMemo(() => {
    if (!isTrial || isExpired || typeof daysRemaining !== 'number' || daysRemaining < 0) return null;
    return `Pro trial · ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`;
  }, [isTrial, isExpired, daysRemaining]);

  if (!companyId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 animate-fade-in">
        <p className="text-sm text-muted-foreground">Join or select a company to manage billing.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscription, M-Pesa payments, and plan options for your workspace.
        </p>
      </div>

      {/* Alerts */}
      {(isExpired || trialExpiredNeedsPlan) && !isOverrideActive && !isDeveloper && (
        <div
          className="flex gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-sm"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Access limited</p>
            <p className="mt-1 text-destructive/90">
              {trialExpiredNeedsPlan
                ? 'Your Pro trial has ended. Pick a plan and submit payment to restore full access, or use the plan picker in the app header if you are a company admin.'
                : 'Your subscription has expired. Submit a payment to continue without interruption.'}
            </p>
          </div>
        </div>
      )}

      {gateStatus === 'pending_approval' && !isDeveloper && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 shadow-sm dark:text-amber-100/90">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Awaiting approval</p>
            <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
              Your workspace is not active yet. You will receive Pro trial access once approved.
            </p>
          </div>
        </div>
      )}

      {gateStatus === 'pending_payment' && !isDeveloper && (
        <div className="flex gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm shadow-sm">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <div>
            <p className="font-semibold text-foreground">Payment received — pending verification</p>
            <p className="mt-1 text-muted-foreground">
              Our team is reviewing your M-Pesa submission. No need to pay again unless we contact you.
            </p>
          </div>
        </div>
      )}

      {isOverrideActive && !isDeveloper && (
        <div className="flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm shadow-sm">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-foreground">Developer override</p>
            <p className="mt-1 text-muted-foreground">Your plan and billing are managed directly by FarmVault.</p>
          </div>
        </div>
      )}

      {/* SECTION 1 — Subscription status */}
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {trialBannerText ? (
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  {trialBannerText}
                </span>
              ) : null}
              {isActivePaid && !isDeveloper ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Active
                </span>
              ) : null}
              {!isTrial && gateStatus === 'active' && !isDeveloper && !isActivePaid ? (
                <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {planTitle} plan
                </span>
              ) : null}
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                <Crown className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {isDeveloper ? 'Developer access' : `${planTitle} subscription`}
                </h2>
                <p className="text-sm text-muted-foreground">{statusDetail}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/30 px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plan</dt>
                <dd className="mt-0.5 text-sm font-medium text-foreground">{isDeveloper ? '—' : planTitle}</dd>
              </div>
              <div className="rounded-xl bg-muted/30 px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Billing cycle
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-foreground">{billingCycleDisplay}</dd>
              </div>
              <div className="rounded-xl bg-muted/30 px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {isTrial ? 'Trial ends' : 'Next renewal / ends'}
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-foreground">{expiryLabel}</dd>
              </div>
              <div className="rounded-xl bg-muted/30 px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                <dd
                  className={cn(
                    'mt-0.5 text-sm font-medium',
                    isActivePaid ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
                  )}
                >
                  {statusHeadline}
                </dd>
              </div>
            </dl>

            {typeof daysRemaining === 'number' && daysRemaining >= 0 && isTrial && !isDeveloper ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{daysRemaining}</span> day
                {daysRemaining === 1 ? '' : 's'} remaining on your trial.
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            {primaryCtaLabel ? (
              <Button className="h-11 rounded-xl px-6 font-semibold shadow-sm" onClick={() => setCheckoutOpen(true)}>
                {primaryCtaLabel}
              </Button>
            ) : null}
            {showPaySection && !primaryCtaLabel ? (
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setCheckoutOpen(true)}>
                Pay with M-Pesa
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {!isDeveloper ? (
        <>
          {/* SECTION 2 & 3 — Plan + cycle */}
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Choose plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Selection updates your checkout amount. Your current workspace plan is marked below.
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
              <PlanSelector
                value={selectedPlan}
                onChange={setSelectedPlan}
                workspacePlan={workspacePlan}
                disabled={subLoading}
              />
              <BillingCycleSelector
                value={selectedCycle}
                onChange={setSelectedCycle}
                workspaceCycle={workspaceCycle}
                disabled={subLoading}
              />
            </div>
            <div className="mt-6 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Price preview</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                KES {checkoutAmount.toLocaleString()}
                <span className="text-base font-medium text-muted-foreground">{periodSuffix}</span>
              </p>
              {checkoutSavings > 0 ? (
                <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Save KES {checkoutSavings.toLocaleString()} vs paying monthly for{' '}
                  {billingCycleDurationMonths(selectedCycle)} months.
                </p>
              ) : null}
            </div>
          </section>

          {/* SECTION 4 — Payment CTA */}
          {showPaySection ? (
            <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent p-5 shadow-md sm:p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Activate subscription</h2>
                  <p className="text-sm text-muted-foreground">
                    Pay via M-Pesa to the till below, then complete checkout with your transaction code.
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex justify-between gap-8 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground">Till number</span>
                      <span className="font-mono font-semibold text-foreground">{TILL}</span>
                    </li>
                    <li className="flex justify-between gap-8 border-b border-border/40 pb-1.5">
                      <span className="text-muted-foreground">Business</span>
                      <span className="font-medium text-foreground">{BUSINESS}</span>
                    </li>
                    <li className="flex justify-between gap-8 pt-0.5">
                      <span className="text-muted-foreground">Amount due</span>
                      <span className="text-lg font-semibold text-foreground">
                        KES {checkoutAmount.toLocaleString()}
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="flex flex-col items-stretch gap-2 md:w-52">
                  <Button
                    size="lg"
                    className="h-12 rounded-xl text-base font-semibold shadow-md"
                    onClick={() => setCheckoutOpen(true)}
                  >
                    Pay now
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">Opens secure payment form</p>
                </div>
              </div>
            </section>
          ) : null}

          {/* SECTION 5 — Payment history */}
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Payment history</h2>
            <p className="mt-1 text-sm text-muted-foreground">M-Pesa subscription submissions for this workspace.</p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border/50">
              {paymentsLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading payments…</p>
              ) : payments.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Cycle</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p: PaymentSubmissionRow) => {
                      const meta = paymentStatusMeta(String(p.status));
                      const c = parseBillingCycle(p.billing_cycle ?? p.billing_mode);
                      return (
                        <tr key={p.id} className="border-b border-border/40 last:border-0">
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {p.created_at ? format(parseISO(p.created_at), 'PPp') : '—'}
                          </td>
                          <td className="px-4 py-3 capitalize">{p.plan_id}</td>
                          <td className="px-4 py-3">{c ? billingCycleLabel(c) : '—'}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {p.currency ?? 'KES'} {Number(p.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* SECTION 6 — Compare plans */}
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Compare plans</h2>
            <p className="mt-1 text-sm text-muted-foreground">Feature overview for Basic vs Pro.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {SUBSCRIPTION_PLANS.filter((p) => p.value === 'basic' || p.value === 'pro').map((planOpt) => {
                const isPro = planOpt.value === 'pro';
                const planKey = planOpt.value as BillingSubmissionPlan;
                const live = getLivePrice(planKey, selectedCycle);
                const catalogMode = selectedCycle === 'seasonal' ? 'season' : selectedCycle;
                const price = live ?? planOpt.pricing[catalogMode];
                return (
                  <div
                    key={planOpt.value}
                    className={cn(
                      'relative flex flex-col rounded-2xl border p-5 shadow-sm',
                      isPro
                        ? 'border-primary/30 bg-gradient-to-b from-primary/[0.07] to-card'
                        : 'border-border/60 bg-muted/10',
                    )}
                  >
                    {isPro ? (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 dark:text-amber-100">
                          <Zap className="h-3 w-3" />
                          Most popular
                        </span>
                      </div>
                    ) : null}
                    <h3 className={cn('text-lg font-semibold', isPro ? 'mt-2' : '')}>{planOpt.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{planOpt.description}</p>
                    <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                      {price != null ? (
                        <>
                          KES {price.toLocaleString()}
                          <span className="text-sm font-medium text-muted-foreground">
                            {selectedCycle === 'monthly' ? '/mo' : selectedCycle === 'seasonal' ? '/season' : '/yr'}
                          </span>
                        </>
                      ) : (
                        <span className="text-base font-medium text-muted-foreground">Custom</span>
                      )}
                    </p>
                    <ul className="mt-4 flex-1 space-y-2 border-t border-border/40 pt-4">
                      {planOpt.features.slice(0, 7).map((f) => (
                        <li key={f} className="flex gap-2 text-sm text-foreground/90">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={isPro ? 'default' : 'outline'}
                      className="mt-5 h-10 w-full rounded-xl font-semibold"
                      disabled={!showPaySection}
                      onClick={() => {
                        setSelectedPlan(planOpt.value as BillingSubmissionPlan);
                        setCheckoutOpen(true);
                      }}
                    >
                      {planOpt.value === 'basic' ? 'Choose Basic' : 'Choose Pro'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        Workspace: <span className="font-medium text-foreground">{company?.name ?? companyId}</span>
      </p>

      {!isDeveloper ? (
        <UpgradeModal
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          isTrial={isTrial}
          isExpired={isExpired}
          daysRemaining={daysRemaining}
          checkoutPlan={selectedPlan}
          checkoutCycle={selectedCycle}
          workspaceCompanyId={companyId}
        />
      ) : null}
    </div>
  );
}
