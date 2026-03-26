import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  tillNumber: string;
  businessName: string;
  workspaceName?: string | null;
  className?: string;
}

export function PaymentSummaryCard({
  plan,
  cycle,
  tillNumber,
  businessName,
  workspaceName,
  className,
}: PaymentSummaryCardProps) {
  const [copied, setCopied] = useState(false);
  const amount = getBillingAmountKes(plan, cycle);
  const months = billingCycleDurationMonths(cycle);
  const savings = computeBundleSavingsKes(plan, cycle);

  const copyTill = async () => {
    try {
      await navigator.clipboard.writeText(tillNumber.replace(/\s/g, ''));
      setCopied(true);
      toast.success('Till number copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — copy manually');
    }
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-muted/40 to-background p-4 shadow-sm ring-1 ring-black/[0.03] ring-primary/10 dark:ring-white/[0.06] lg:p-5 lg:ring-primary/0',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/[0.07] blur-2xl" />
      <div className="relative space-y-3 lg:space-y-4">
        <div>
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

        <dl className="divide-y divide-border/50 rounded-xl bg-background/60 px-3 py-1 text-sm ring-1 ring-border/40 lg:space-y-2.5 lg:divide-y-0 lg:px-0 lg:py-0 lg:ring-0">
          <div className="flex justify-between gap-3 py-2 first:pt-1.5 last:pb-1.5 lg:border-b lg:border-border/40 lg:py-0 lg:pb-2">
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-semibold text-foreground lg:font-medium">{billingPlanLabel(plan)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2 lg:border-b lg:border-border/40 lg:py-0 lg:pb-2">
            <dt className="text-muted-foreground">Cycle</dt>
            <dd className="font-medium text-foreground">{billingCycleLabel(cycle)}</dd>
          </div>
          {workspaceName ? (
            <div className="flex justify-between gap-3 py-2 lg:border-b lg:border-border/40 lg:py-0 lg:pb-2">
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="max-w-[58%] truncate text-right font-medium text-foreground" title={workspaceName}>
                {workspaceName}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 py-2 lg:border-b lg:border-border/40 lg:py-0 lg:pb-2">
            <dt className="text-muted-foreground">Till number</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold tracking-wide sm:text-sm">{tillNumber}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1 rounded-md px-2 text-xs lg:h-8 lg:rounded-lg"
                onClick={() => void copyTill()}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy
              </Button>
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-2 last:pb-1.5 lg:border-b-0 lg:py-0">
            <dt className="text-muted-foreground">Business name</dt>
            <dd className="font-medium text-foreground">{businessName}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
