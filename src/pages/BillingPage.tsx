import React, { useMemo, useState } from 'react';
import { Check, Crown, AlertTriangle, Zap, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCompany, type CompanyDoc, type CompanySubscription } from '@/services/companyService';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import type { SubscriptionPaymentDoc } from '@/services/subscriptionPaymentService';
import { format } from 'date-fns';
import { useCollection } from '@/hooks/useCollection';
import type { Harvest, Sale } from '@/types';
import {
  type BillingMode,
  getBillingModeDurationLabel,
  getPlanPrice,
} from '@/config/plans';
import { BillingModeSelector } from '@/components/subscription/BillingModeSelector';

export default function BillingPage() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billingMode, setBillingMode] = useState<BillingMode>('monthly');

  const { plan, status, isTrial, isExpired, daysRemaining, isOverrideActive } = useSubscriptionStatus();

  const { data: company } = useQuery<CompanyDoc | null>({
    queryKey: ['company-billing', companyId],
    enabled: !!companyId,
    queryFn: () => getCompany(companyId!),
  });

  const subscription = (company as CompanyDoc | null)?.subscription as CompanySubscription | undefined;
  const override = subscription?.override;

  const { data: payments = [] } = useQuery<SubscriptionPaymentDoc[]>({
    queryKey: ['subscription-payments', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const q = query(
        collection(db, 'subscriptionPayments'),
        where('companyId', '==', companyId!),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SubscriptionPaymentDoc[];
    },
  });

  const { data: sales = [] } = useCollection<Sale>('billing-sales', 'sales', {
    companyScoped: true,
    companyId,
    isDeveloper: user?.role === 'developer',
  });
  const { data: harvests = [] } = useCollection<Harvest>('billing-harvests', 'harvests', {
    companyScoped: true,
    companyId,
    isDeveloper: user?.role === 'developer',
  });

  const planLabel = useMemo(() => {
    switch (plan) {
      case 'basic':
        return 'Basic';
      case 'pro':
        return 'Pro';
      case 'enterprise':
        return 'Enterprise';
      case 'trial':
      default:
        return 'Trial';
    }
  }, [plan]);

  const statusLabel = useMemo(() => {
    if (isOverrideActive) return 'Developer Override';
    if (status === 'pending_payment') return 'Pending Payment';
    if (isTrial) return 'Trial';
    if (isExpired) return 'Expired';
    if (status === 'active') return 'Active';
    if (status === 'grace') return 'Grace';
    if (status === 'paused') return 'Paused';
    return 'Active';
  }, [status, isTrial, isExpired, isOverrideActive]);

  const latestPayment = useMemo(
    () =>
      [...payments].sort((a, b) => {
        const ta = (a as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = (b as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      })[0],
    [payments],
  );

  const planTypeLabel = useMemo(() => {
    if (!latestPayment) {
      return isTrial ? 'Trial' : '—';
    }
    switch (latestPayment.mode) {
      case 'monthly':
        return 'Monthly';
      case 'seasonal':
        return 'Per Season';
      case 'annual':
        return 'Annual';
      default:
        return '—';
    }
  }, [latestPayment, isTrial]);

  const expiryDate = useMemo(() => {
    if (isOverrideActive && override?.overrideEndsAt) {
      const d = (override.overrideEndsAt as any).toDate?.() as Date | undefined;
      return d ? format(d, 'PP') : '—';
    }
    const source =
      subscription?.paidUntil ??
      subscription?.trialEndsAt ??
      null;
    const d = (source as any)?.toDate?.() as Date | undefined;
    return d ? format(d, 'PP') : '—';
  }, [subscription?.paidUntil, subscription?.trialEndsAt, isOverrideActive, override?.overrideEndsAt]);

  const farmValue = useMemo(() => {
    const totalSales = sales.reduce((sum, s) => sum + (s.totalAmount ?? 0), 0);
    const harvestValueTracked = harvests.reduce((sum, h) => {
      const anyHarvest = h as Harvest & { farmTotalPrice?: number };
      return sum + (anyHarvest.farmTotalPrice ?? 0);
    }, 0);
    return totalSales + harvestValueTracked;
  }, [sales, harvests]);

  const currentPlanForPricing: 'basic' | 'pro' | null =
    plan === 'basic' || plan === 'pro' ? plan : null;
  const currentPrice =
    currentPlanForPricing != null ? getPlanPrice(currentPlanForPricing, billingMode) : null;
  const billingDurationLabel = getBillingModeDurationLabel(billingMode);

  const showUpgradeNow =
    (isTrial || isExpired) && status !== 'pending_payment' && !isOverrideActive;
  const showUpgradeToPro =
    plan === 'basic' && !isTrial && !isExpired && status === 'active' && !isOverrideActive;
  const showRenew =
    !isTrial && !isExpired && status === 'active' && !isOverrideActive;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your FarmVault subscription, payments, and benefits.
          </p>
        </div>
      </div>

      {isExpired && !isOverrideActive && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Your subscription has expired. Renew to continue writing data.</span>
        </div>
      )}

      {status === 'pending_payment' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Payment submitted. Awaiting confirmation.</span>
        </div>
      )}

      {/* Current Plan Overview */}
      <div className="fv-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-fv-gold-soft">
              <Crown className="h-7 w-7 text-fv-olive" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                {planLabel} Plan
                {isTrial && (
                  <span className="fv-badge fv-badge--gold text-[11px]">
                    7-Day Free Trial
                  </span>
                )}
                {isOverrideActive && (
                  <span className="fv-badge text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-300">
                    Developer Override Active
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Subscription Status:{' '}
                <span className="font-medium text-foreground">
                  {statusLabel}
                </span>
              </p>
            </div>
          </div>
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Plan Type:</span>{' '}
              <span className="font-medium text-foreground">{planTypeLabel}</span>
            </p>
            <p>
              <span className="text-muted-foreground">
                {isOverrideActive ? 'Override until:' : 'Expiry Date:'}
              </span>{' '}
              <span className="font-medium text-foreground">{expiryDate}</span>
            </p>
            {!isOverrideActive && typeof daysRemaining === 'number' && daysRemaining >= 0 && (
              <p className="text-xs text-muted-foreground">
                {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade / Renew Section */}
      <div className="fv-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Manage your plan</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Choose the best plan for your farm and keep your subscription active.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showUpgradeNow && (
            <button
              type="button"
              className="fv-btn fv-btn--primary"
              onClick={() => setUpgradeOpen(true)}
            >
              Upgrade Now
            </button>
          )}
          {showUpgradeToPro && (
            <button
              type="button"
              className="fv-btn fv-btn--secondary"
              onClick={() => setUpgradeOpen(true)}
            >
              Upgrade to Pro
            </button>
          )}
          {showRenew && (
            <button
              type="button"
              className="fv-btn fv-btn--outline"
            onClick={() => setUpgradeOpen(true)}
            >
              Renew Plan
            </button>
          )}
        </div>
      </div>

      {/* Change Billing Mode */}
      <div className="fv-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Change billing mode</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Choose how often you want to be billed. Prices update automatically.
            </p>
          </div>
          <BillingModeSelector mode={billingMode} onChange={setBillingMode} />
        </div>
        {currentPlanForPricing ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {planLabel} &middot; {billingDurationLabel}
              </p>
              {currentPrice != null && (
                <p className="text-xl font-bold text-foreground mt-1">
                  KES {currentPrice.toLocaleString()}
                </p>
              )}
              {billingMode === 'annual' && (
                <p className="text-xs text-emerald-700 mt-1">
                  Save more with annual billing.
                </p>
              )}
            </div>
            <button
              type="button"
              className="fv-btn fv-btn--secondary"
              onClick={() => setUpgradeOpen(true)}
            >
              Review &amp; pay
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            When you move to a paid plan, you can preview prices for each billing mode here.
          </p>
        )}
      </div>

      {/* Payment History */}
      <div className="fv-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Payment History</h2>
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subscription payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Plan</th>
                  <th>Mode</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments
                  .slice()
                  .sort((a, b) => {
                    const ta = (a as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
                    const tb = (b as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
                    return tb - ta;
                  })
                  .map((p) => {
                    const created = (p as any).createdAt?.toDate?.() as Date | undefined;
                    const statusBadgeClass =
                      p.status === 'approved'
                        ? 'fv-badge--active'
                        : p.status === 'pending'
                          ? 'fv-badge--warning'
                          : 'bg-destructive/10 text-destructive';
                    const modeLabel =
                      p.mode === 'monthly'
                        ? 'Monthly'
                        : p.mode === 'seasonal'
                          ? 'Per Season'
                          : 'Annual';
                    return (
                      <tr key={p.id}>
                        <td className="text-sm text-muted-foreground">
                          {created ? format(created, 'PPp') : '—'}
                        </td>
                        <td className="capitalize">{p.plan}</td>
                        <td className="capitalize">{modeLabel}</td>
                        <td>KES {Number(p.amount).toLocaleString()}</td>
                        <td>
                          <span className={cn('fv-badge text-xs capitalize', statusBadgeClass)}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan Comparison */}
      <div className="fv-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Compare Plans</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Choose the level that fits your farm size and team.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="fv-card border border-border/60 bg-card/80">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-foreground">Basic</h3>
            </div>
            <ul className="space-y-2 text-sm mt-2">
              <li>2 Projects</li>
              <li>3 Employees</li>
              <li>No Multi-block</li>
              <li>No Season Budget</li>
              <li>Standard Reports</li>
            </ul>
          </div>
          <div className="fv-card border border-fv-gold/70 bg-fv-gold-soft/40 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="fv-badge fv-badge--gold text-xs flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Most Popular
              </span>
            </div>
            <div className="flex items-center justify-between mb-2 mt-2">
              <h3 className="text-base font-semibold text-foreground">Pro</h3>
            </div>
            <ul className="space-y-2 text-sm mt-2">
              <li>Unlimited Projects</li>
              <li>Unlimited Employees</li>
              <li>Multi-block</li>
              <li>Season Budget</li>
              <li>Advanced Reports</li>
              <li>Exports</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Revenue Value Reminder */}
      <div className="fv-card bg-card/90 border border-border/70">
        <p className="text-sm text-foreground">
          FarmVault has tracked{' '}
          <span className="font-semibold">
            KES {farmValue.toLocaleString()}
          </span>{' '}
          in farm value this season.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Continue managing your farm operations without interruption.
        </p>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        isTrial={isTrial}
        isExpired={isExpired}
        daysRemaining={daysRemaining}
      />
    </div>
  );
}
