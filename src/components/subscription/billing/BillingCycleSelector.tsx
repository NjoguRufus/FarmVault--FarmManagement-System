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
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Billing cycle</p>
      <div
        className={cn(
          'flex flex-wrap gap-1.5 rounded-[10px] border border-border/30 bg-[hsl(88_12%_95%_/0.6)] p-1.5',
          'shadow-[inset_2px_2px_5px_rgba(32,42,28,0.05),inset_-1px_-1px_4px_rgba(255,255,255,0.7)]',
          'dark:border-white/[0.06] dark:bg-[hsl(145_8%_14%_/0.5)] dark:shadow-[inset_2px_2px_8px_rgba(0,0,0,0.2)]',
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
                'min-h-[40px] flex-1 min-w-[88px] rounded-[8px] px-2.5 py-2 text-center text-xs font-medium transition-[box-shadow,color] duration-200 sm:text-[13px]',
                active
                  ? 'bg-background/95 text-foreground shadow-[3px_3px_8px_rgba(32,42,28,0.08),-2px_-2px_6px_rgba(255,255,255,0.85)] ring-1 ring-primary/22 dark:bg-[hsl(145_10%_17%)] dark:shadow-[4px_4px_12px_rgba(0,0,0,0.35)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="flex flex-col items-center gap-0.5">
                <span>{billingCycleLabel(cycle)}</span>
                {workspaceCycle === cycle ? (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-primary">On file</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
