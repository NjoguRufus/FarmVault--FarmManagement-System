import React from 'react';
import { cn } from '@/lib/utils';
import type { BillingSubmissionPlan } from '@/lib/billingPricing';
import { billingPlanLabel } from '@/lib/billingPricing';

export interface PlanSelectorProps {
  value: BillingSubmissionPlan;
  onChange: (plan: BillingSubmissionPlan) => void;
  disabled?: boolean;
  /** Workspace subscription plan (e.g. Pro trial) — shows a "Current" marker. */
  workspacePlan?: BillingSubmissionPlan | null;
  className?: string;
}

const OPTIONS: { id: BillingSubmissionPlan; hint: string }[] = [
  { id: 'basic', hint: 'Core tracking for smaller farms' },
  { id: 'pro', hint: 'Full power & analytics' },
];

export function PlanSelector({ value, onChange, disabled, workspacePlan, className }: PlanSelectorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Plan</p>
      <div
        className={cn(
          'grid grid-cols-2 gap-1.5 rounded-xl bg-muted/50 p-1.5 ring-1 ring-border/60',
          disabled && 'pointer-events-none opacity-60',
        )}
        role="tablist"
        aria-label="Subscription plan"
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={cn(
                'rounded-lg px-3 py-2.5 text-left transition-all duration-200',
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-primary/25'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="block text-sm font-semibold tracking-tight">{billingPlanLabel(opt.id)}</span>
                {workspacePlan === opt.id ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Current
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
