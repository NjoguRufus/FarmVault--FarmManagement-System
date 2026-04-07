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
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Plan</p>
      <div
        className={cn(
          'grid grid-cols-2 gap-1.5 rounded-[10px] border border-border/30 bg-[hsl(88_12%_95%_/0.6)] p-1.5',
          'shadow-[inset_2px_2px_5px_rgba(32,42,28,0.05),inset_-1px_-1px_4px_rgba(255,255,255,0.7)]',
          'dark:border-white/[0.06] dark:bg-[hsl(145_8%_14%_/0.5)] dark:shadow-[inset_2px_2px_8px_rgba(0,0,0,0.2)]',
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
                'rounded-[8px] px-3 py-2.5 text-left transition-[box-shadow,color] duration-200',
                active
                  ? 'bg-background/95 text-foreground shadow-[3px_3px_8px_rgba(32,42,28,0.08),-2px_-2px_6px_rgba(255,255,255,0.85)] ring-1 ring-primary/22 dark:bg-[hsl(145_10%_17%)] dark:shadow-[4px_4px_12px_rgba(0,0,0,0.35)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="block text-sm font-medium tracking-tight">{billingPlanLabel(opt.id)}</span>
                {workspacePlan === opt.id ? (
                  <span className="rounded-md bg-primary/10 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-primary">
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
