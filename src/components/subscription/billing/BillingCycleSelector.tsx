import React from 'react';
import { cn } from '@/lib/utils';
import type { BillingSubmissionCycle } from '@/lib/billingPricing';
import { billingCycleLabel } from '@/lib/billingPricing';

export interface BillingCycleSelectorProps {
  value: BillingSubmissionCycle;
  onChange: (cycle: BillingSubmissionCycle) => void;
  disabled?: boolean;
  /** Saved billing cycle on subscription row, if any. */
  workspaceCycle?: BillingSubmissionCycle | null;
  className?: string;
}

const CYCLES: BillingSubmissionCycle[] = ['monthly', 'seasonal', 'annual'];

export function BillingCycleSelector({ value, onChange, disabled, workspaceCycle, className }: BillingCycleSelectorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Billing cycle</p>
      <div
        className={cn(
          'flex flex-wrap gap-1.5 rounded-xl bg-muted/50 p-1.5 ring-1 ring-border/60',
          disabled && 'pointer-events-none opacity-60',
        )}
        role="tablist"
        aria-label="Billing cycle"
      >
        {CYCLES.map((cycle) => {
          const active = value === cycle;
          return (
            <button
              key={cycle}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => onChange(cycle)}
              className={cn(
                'min-h-[40px] flex-1 min-w-[88px] rounded-lg px-2.5 py-2 text-center text-xs font-medium transition-all duration-200 sm:text-[13px]',
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-primary/25'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="flex flex-col items-center gap-0.5">
                <span>{billingCycleLabel(cycle)}</span>
                {workspaceCycle === cycle ? (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-primary">On file</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
