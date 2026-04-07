import React from 'react';
import { cn } from '@/lib/utils';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import {
  billingCycleDurationMonths,
  billingCycleLabel,
  billingPlanLabel,
  computeBundleSavingsKes,
  getBillingAmountKes,
} from '@/lib/billingPricing';

export interface PaymentSummaryCardProps {
  plan: BillingSubmissionPlan;
  cycle: BillingSubmissionCycle;
  businessName: string;
  workspaceName?: string | null;
  /** Overrides catalog headline amount when dynamic pricing is loaded. */
  displayAmountKes?: number | null;
  /** When provided with dynamic pricing, controls the savings line (vs catalog). */
  bundleSavingsKes?: number;
  className?: string;
}

export function PaymentSummaryCard({
  plan,
  cycle,
  businessName,
  workspaceName,
  displayAmountKes,
  bundleSavingsKes,
  className,
}: PaymentSummaryCardProps) {
  const catalogAmount = getBillingAmountKes(plan, cycle);
  const amount = displayAmountKes != null ? displayAmountKes : catalogAmount;
  const months = billingCycleDurationMonths(cycle);
  const savings =
    bundleSavingsKes !== undefined ? bundleSavingsKes : computeBundleSavingsKes(plan, cycle);

  const row = 'flex justify-between gap-3 py-2.5 text-sm';

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 max-lg:shadow-none max-lg:ring-0',
        'lg:rounded-2xl lg:border lg:border-border/50 lg:bg-gradient-to-b lg:from-muted/40 lg:to-background lg:p-5 lg:shadow-sm lg:ring-1 lg:ring-black/[0.03] lg:ring-primary/10 dark:lg:ring-white/[0.06]',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 hidden h-28 w-28 rounded-full bg-primary/[0.07] blur-2xl lg:block" />

      <div className="relative space-y-3 lg:space-y-4">
        {/* Desktop: headline amount + savings (same as before) */}
        <div className="hidden lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Payment summary</p>
          <p className="mt-2 text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground lg:mt-3 lg:text-3xl">
            KES {amount.toLocaleString()}
            <span className="ml-1 text-xs font-medium text-muted-foreground lg:ml-1.5 lg:text-sm">
              / {months} mo{months > 1 ? 's' : ''}
            </span>
          </p>
          {savings > 0 && (
            <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 lg:mt-1.5 lg:text-xs">
              Save KES {savings.toLocaleString()} vs paying monthly
            </p>
          )}
        </div>

        {/* Mobile: label + list rows only (no large headline block) */}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:hidden">Payment summary</p>

        {/* Same divided list as desktop; mobile prepends total + savings via display:contents */}
        <dl className="divide-y divide-border/50 text-sm">
          <div className="contents lg:hidden">
            <div className={row}>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-right font-semibold tabular-nums text-foreground">
                KES {amount.toLocaleString()}
                <span className="ml-1 text-xs font-medium text-muted-foreground">
                  / {months} mo{months > 1 ? 's' : ''}
                </span>
              </dd>
            </div>
            {savings > 0 ? (
              <div className={row}>
                <dt className="text-muted-foreground">vs monthly</dt>
                <dd className="text-right text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Save KES {savings.toLocaleString()}
                </dd>
              </div>
            ) : null}
          </div>

          <div className={row}>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-semibold text-foreground lg:font-medium">{billingPlanLabel(plan)}</dd>
          </div>
          <div className={row}>
            <dt className="text-muted-foreground">Cycle</dt>
            <dd className="font-medium text-foreground">{billingCycleLabel(cycle)}</dd>
          </div>
          {workspaceName ? (
            <div className={row}>
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="max-w-[58%] truncate text-right font-medium text-foreground" title={workspaceName}>
                {workspaceName}
              </dd>
            </div>
          ) : null}
          <div className={row}>
            <dt className="text-muted-foreground">Business name</dt>
            <dd className="font-medium text-foreground">{businessName}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
