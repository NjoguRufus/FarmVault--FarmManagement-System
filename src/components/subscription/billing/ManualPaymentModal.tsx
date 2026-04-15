import React, { useCallback, useEffect, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import { CLERK_JWT_TEMPLATE_SUPABASE, getAuthedSupabase } from '@/lib/supabase';
import { extractMpesaCodeFromPastedMessage, extractMpesaNameFromPastedMessage } from '@/lib/mpesaExtract';
import { createPaymentSubmission } from '@/services/billingSubmissionService';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { useToast } from '@/hooks/use-toast';

export interface ManualPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planCode: BillingSubmissionPlan;
  billingCycle: BillingSubmissionCycle;
  /** Expected KES amount for the selected plan + cycle (must match server RPC). */
  amountKes: number | null;
}

function mapSubmitError(raw: string): string {
  const t = raw.toLowerCase();
  if (
    t.includes('already been used') ||
    t.includes('already submitted') ||
    t.includes('invalid') ||
    t.includes('not authorized') ||
    t.includes('amount does not match') ||
    t.includes('required')
  ) {
    return 'This code is invalid or already used.';
  }
  return 'This code is invalid or already used.';
}

export function ManualPaymentModal({
  open,
  onOpenChange,
  planCode,
  billingCycle,
  amountKes,
}: ManualPaymentModalProps) {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transactionInput, setTransactionInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const clerkSupabaseToken = useCallback(
    () => getToken({ template: CLERK_JWT_TEMPLATE_SUPABASE }),
    [getToken],
  );

  const companyId = user?.companyId?.trim() ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('No workspace');
      if (amountKes == null || !Number.isFinite(amountKes)) throw new Error('Amount unavailable');
      const raw = transactionInput.trim();
      const finalTx =
        extractMpesaCodeFromPastedMessage(raw) ||
        raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
      if (finalTx.length < 8) {
        throw new Error('Enter a valid M-Pesa confirmation code (at least 8 characters).');
      }
      const fromSms = extractMpesaNameFromPastedMessage(raw).trim();
      const accountNameFallback =
        user?.name?.trim() ||
        user?.fullName?.trim() ||
        user?.email?.split('@')[0]?.trim() ||
        'Customer';
      const mpesaName = fromSms.length >= 2 ? fromSms : accountNameFallback;
      const client = await getAuthedSupabase(clerkSupabaseToken);
      return createPaymentSubmission(
        {
          planCode,
          billingCycle,
          amount: amountKes,
          mpesaName,
          mpesaPhone: '',
          transactionCode: finalTx,
          currency: 'KES',
        },
        client,
        clerkSupabaseToken,
      );
    },
    onSuccess: async () => {
      toast({
        title: 'Payment submitted for verification',
        description: 'We will confirm your M-Pesa payment and activate your plan when verified.',
      });
      if (companyId) {
        captureEvent(AnalyticsEvents.UPGRADE_COMPLETED, {
          company_id: companyId,
          subscription_plan: planCode,
          module_name: 'billing',
          route_path: '/billing',
        });
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['subscription-gate', companyId], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['subscription-payment-pending', companyId], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['subscription-payments-supabase', companyId], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['company-subscription-row', companyId], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['company-billing', companyId], type: 'active' }),
        ]);
      }
      setTransactionInput('');
      setLocalError(null);
      onOpenChange(false);
    },
    onError: (e: Error) => {
      const msg = e.message ?? '';
      if (msg.includes('at least 8')) {
        setLocalError(msg);
        return;
      }
      setLocalError(mapSubmitError(msg));
    },
  });

  useEffect(() => {
    if (!open) {
      setTransactionInput('');
      setLocalError(null);
    }
  }, [open]);

  const disabled =
    mutation.isPending ||
    !companyId ||
    amountKes == null ||
    !Number.isFinite(amountKes) ||
    (planCode !== 'basic' && planCode !== 'pro');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-md border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-sm',
          'gap-0 overflow-hidden sm:rounded-2xl',
        )}
        onPointerDownOutside={(e) => {
          if (mutation.isPending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (mutation.isPending) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-2 border-b border-border/50 bg-muted/15 px-5 pb-4 pt-6 text-center sm:px-6 sm:pt-7">
          <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">Verify Your Payment</DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed text-muted-foreground">
            If you have already completed an M-Pesa payment but your subscription is not active, enter your transaction
            code below. You can paste the full M-Pesa SMS — we will read the code and payer name when present.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          {amountKes != null && Number.isFinite(amountKes) ? (
            <p className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
              Amount for this submission:{' '}
              <span className="font-semibold text-foreground">KES {amountKes.toLocaleString()}</span>
              <span className="text-muted-foreground">
                {' '}
                · {planCode === 'pro' ? 'Pro' : 'Basic'} · {billingCycle}
              </span>
            </p>
          ) : (
            <p className="text-center text-xs text-destructive">Select a plan and billing cycle on this page first.</p>
          )}

          {localError ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {localError}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="manual-payment-tx" className="text-xs font-medium text-foreground">
              Transaction code
            </Label>
            <Input
              id="manual-payment-tx"
              value={transactionInput}
              onChange={(e) => {
                setTransactionInput(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder="e.g. QK1ABC2DE3 or paste M-Pesa SMS"
              className="h-11 font-mono text-sm tracking-wide"
              disabled={mutation.isPending}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-border/50 bg-muted/10 px-5 py-4 sm:flex-row sm:px-6">
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full gap-2 sm:w-auto"
            disabled={disabled}
            onClick={() => {
              setLocalError(null);
              void mutation.mutateAsync().catch(() => {});
            }}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
