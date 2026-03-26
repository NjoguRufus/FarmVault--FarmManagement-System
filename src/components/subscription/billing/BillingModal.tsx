import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import { getBillingAmountKes } from '@/lib/billingPricing';
import { PlanSelector } from '@/components/subscription/billing/PlanSelector';
import { BillingCycleSelector } from '@/components/subscription/billing/BillingCycleSelector';
import { PaymentSummaryCard } from '@/components/subscription/billing/PaymentSummaryCard';
import { MpesaInstructionsCard } from '@/components/subscription/billing/MpesaInstructionsCard';
import {
  createPaymentRequest,
  getPendingPaymentStatus,
} from '@/services/billingSubmissionService';
import { getCompany } from '@/services/companyService';

export interface BillingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  /** When opening checkout, pre-select plan/cycle from the billing page. */
  checkoutPlan?: BillingSubmissionPlan;
  checkoutCycle?: BillingSubmissionCycle;
}

const TILL = '5334350';
const BUSINESS = 'FarmVault';

export function BillingModal({
  open,
  onOpenChange,
  isTrial,
  isExpired,
  daysRemaining,
  checkoutPlan,
  checkoutCycle,
}: BillingModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;

  const { data: companyDoc } = useQuery({
    queryKey: ['company-billing', companyId],
    enabled: open && !!companyId,
    queryFn: () => getCompany(companyId!),
    staleTime: 60_000,
  });
  const workspaceName = companyDoc?.name ?? null;

  const [plan, setPlan] = useState<BillingSubmissionPlan>('basic');
  const [cycle, setCycle] = useState<BillingSubmissionCycle>('monthly');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data: pendingStatus, isLoading: pendingLoading } = useQuery({
    queryKey: ['subscription-payment-pending', companyId],
    enabled: open && !!companyId,
    queryFn: () => getPendingPaymentStatus(companyId!),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: createPaymentRequest,
    onSuccess: async () => {
      setSuccess(true);
      const cid = companyId;
      if (cid) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['company-subscription', cid] }),
          queryClient.invalidateQueries({ queryKey: ['subscription-gate', cid] }),
          queryClient.invalidateQueries({ queryKey: ['subscription-payment-pending', cid] }),
          queryClient.invalidateQueries({ queryKey: ['subscription-payments-supabase', cid] }),
          queryClient.invalidateQueries({ queryKey: ['company-subscription-row', cid] }),
        ]);
      }
    },
    onError: (e: Error) => {
      setFormError(e.message ?? 'Something went wrong. Try again.');
    },
  });

  useEffect(() => {
    if (!open) {
      setSuccess(false);
      setFormError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (checkoutPlan) setPlan(checkoutPlan);
    if (checkoutCycle) setCycle(checkoutCycle);
  }, [open, checkoutPlan, checkoutCycle]);

  const trialBadge =
    isTrial && !isExpired && typeof daysRemaining === 'number' && daysRemaining >= 0
      ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in trial`
      : null;

  const subtitle = useMemo(() => {
    if (isExpired) {
      return 'Your trial has ended. Choose a plan, pay via M-Pesa, and we will activate access after we verify your payment — usually within one business day.';
    }
    return 'Pick a plan and billing cycle, pay the exact amount to our till, then submit your M-Pesa details. Your subscription stays inactive until we manually verify the payment.';
  }, [isExpired]);

  const amount = useMemo(() => getBillingAmountKes(plan, cycle), [plan, cycle]);

  const handleSubmit = async (payload: { phoneNumber: string; mpesaCode: string | null }) => {
    setFormError(null);
    if (!companyId) {
      onOpenChange(false);
      return;
    }
    await mutation.mutateAsync({
      companyId,
      plan,
      amount,
      phoneNumber: payload.phoneNumber,
      mpesaCode: payload.mpesaCode,
    });
  };

  const busy = mutation.isPending;
  const showPendingBanner = !success && (pendingStatus?.hasPending ?? false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'relative z-[102] max-h-[min(92vh,760px)] w-full max-w-[min(100%,720px)] gap-0 overflow-hidden border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-sm sm:rounded-2xl',
        )}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className="relative z-[1] max-h-[min(92vh,760px)] overflow-y-auto">
          {success ? (
            <div className="flex flex-col items-center px-4 py-12 text-center sm:px-10 sm:py-14">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-8 w-8" strokeWidth={1.75} />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Payment submitted successfully</h2>
              <div className="mt-4 max-w-md space-y-2 text-sm leading-relaxed text-muted-foreground">
                <p>Payment submitted. We&apos;ll activate your subscription after verification.</p>
              </div>
              <Button className="mt-8 rounded-lg px-8 font-semibold" type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader className="space-y-2 border-b border-border/50 bg-muted/20 px-4 pb-4 pt-5 text-left sm:space-y-3 sm:px-8 sm:pb-5 sm:pt-8">
                <div className="flex flex-wrap items-start justify-between gap-2 pr-7 sm:gap-3 sm:pr-8">
                  <div className="min-w-0 space-y-1.5 sm:space-y-2">
                    <DialogTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
                      Choose your plan
                    </DialogTitle>
                    <DialogDescription className="text-xs leading-relaxed text-muted-foreground sm:text-sm sm:max-w-xl">
                      {subtitle}
                    </DialogDescription>
                  </div>
                  {trialBadge ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-900 dark:text-amber-100">
                      <Sparkles className="h-3.5 w-3.5" />
                      {trialBadge}
                    </span>
                  ) : null}
                </div>
              </DialogHeader>

              <div className="px-4 py-4 sm:px-8 sm:py-8">
                {showPendingBanner ? (
                  <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 text-xs text-sky-950 dark:text-sky-100/90 sm:mb-6 sm:px-4 sm:py-3 sm:text-sm">
                    {pendingLoading
                      ? 'Checking for existing submissions…'
                      : 'You already have a payment awaiting verification. You can submit again after it is processed, or wait for our team to review.'}
                  </div>
                ) : null}

                {/*
                  Mobile (<lg): plan → billing cycle → summary → M-Pesa (flex order).
                  Desktop (lg+): plan + cycle + form in col 1–3; sticky summary in col 4–5.
                */}
                <div
                  className={cn(
                    'flex flex-col gap-3.5 sm:gap-4',
                    'lg:grid lg:grid-cols-6 lg:gap-x-5 lg:gap-y-5',
                  )}
                >
                  <PlanSelector
                    value={plan}
                    onChange={setPlan}
                    disabled={busy}
                    className="order-1 shrink-0 lg:order-none lg:col-span-6 lg:col-start-1 lg:row-start-1"
                  />

                  <BillingCycleSelector
                    value={cycle}
                    onChange={setCycle}
                    disabled={busy}
                    className="order-2 shrink-0 max-lg:border-t max-lg:border-border/40 max-lg:pt-3 lg:order-none lg:col-span-6 lg:col-start-1 lg:row-start-2 lg:border-t-0 lg:pt-0"
                  />

                  <PaymentSummaryCard
                    plan={plan}
                    cycle={cycle}
                    tillNumber={TILL}
                    businessName={BUSINESS}
                    workspaceName={workspaceName}
                    className={cn(
                      'order-3 max-lg:border-t max-lg:border-border/40 max-lg:pt-3 lg:order-none lg:col-span-3 lg:col-start-1 lg:row-start-3 lg:self-start lg:border-t-0 lg:pt-0',
                    )}
                  />

                  <MpesaInstructionsCard
                    tillNumber={TILL}
                    onPaidSubmit={handleSubmit}
                    submitLoading={busy}
                    submitError={formError}
                    className="order-4 lg:order-none lg:col-span-3 lg:col-start-4 lg:row-start-3 lg:self-start"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
