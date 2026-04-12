import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Smartphone, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import { computeBundleSavingsKes } from '@/lib/billingPricing';
import { SUBSCRIPTION_PLANS } from '@/config/plans';
import { PlanSelector } from '@/components/subscription/billing/PlanSelector';
import { BillingCycleSelector } from '@/components/subscription/billing/BillingCycleSelector';
import { PaymentSummaryCard } from '@/components/subscription/billing/PaymentSummaryCard';
import { MpesaPaymentForm, type MpesaFieldErrors } from '@/components/subscription/billing/MpesaPaymentForm';
import {
  createPaymentSubmission,
  getPendingPaymentStatus,
} from '@/services/billingSubmissionService';
import {
  extractMpesaCodeFromPastedMessage,
  extractMpesaNameFromPastedMessage,
} from '@/lib/mpesaExtract';
import { getCompany, type CompanyDoc } from '@/services/companyService';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { useToast } from '@/hooks/use-toast';
import { useCompanyScope, TENANT_SYNC_REQUIRED } from '@/hooks/useCompanyScope';
import { useCompanyContext } from '@/hooks/useCompanyContext';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useBillingPrices } from '@/hooks/useBillingPrices';
import { CLERK_JWT_TEMPLATE_SUPABASE, getAuthedSupabase } from '@/lib/supabase';
import { initiateMpesaStkPush } from '@/services/mpesaStkService';
import { StkPushConfirmation } from '@/components/subscription/billing/StkPushConfirmation';
import { dispatchUnifiedNotificationNow } from '@/services/unifiedNotificationPipeline';
import { logger } from "@/lib/logger";

export interface BillingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  /** When opening checkout, pre-select plan/cycle from the billing page. */
  checkoutPlan?: BillingSubmissionPlan;
  checkoutCycle?: BillingSubmissionCycle;
  /**
   * When auth `user.companyId` is briefly empty, pass the workspace id from the parent
   * (same source as the billing page / shell). Optional; modal also reads `profiles.active_company_id`.
   */
  workspaceCompanyId?: string | null;
}

const TILL = '5334350';
const BUSINESS = 'FarmVault';

/** M-Pesa STK (Daraja via `mpesa-stk-push`). Set `VITE_ENABLE_MPESA_STK=false` to hide the STK block. */
const STK_PUSH_ENABLED =
  String(import.meta.env.VITE_ENABLE_MPESA_STK ?? 'true').toLowerCase() !== 'false';

export function BillingModal({
  open,
  onOpenChange,
  isTrial,
  isExpired,
  daysRemaining,
  checkoutPlan,
  checkoutCycle,
  workspaceCompanyId: workspaceCompanyIdProp,
}: BillingModalProps) {
  const { user } = useAuth();
  const { getToken, isLoaded: clerkAuthLoaded, isSignedIn: clerkSignedIn } = useClerkAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scope = useCompanyScope();
  const { activeCompanyId } = useCompanyContext();
  const { activeCompanyId: profileActiveCompanyId } = useActiveCompany();
  const { billingReferenceFromGate } = useSubscriptionStatus();
  const { matrix: billingPriceMatrix, getAmount: getBillingPriceAmount, getBundleSavings: getBillingBundleSavings } =
    useBillingPrices();

  const clerkSupabaseToken = useCallback(
    () => getToken({ template: CLERK_JWT_TEMPLATE_SUPABASE }),
    [getToken],
  );

  const seedCompanyId = useMemo(() => {
    const pick = (v: string | null | undefined) => {
      const t = v?.trim();
      return t ? t : null;
    };
    const fromProp = pick(workspaceCompanyIdProp);
    if (fromProp) return fromProp;
    const fromScope = pick(scope.companyId);
    if (fromScope) return fromScope;
    const fromContext = pick(activeCompanyId);
    if (fromContext) return fromContext;
    const fromUser = pick(user?.companyId);
    if (fromUser) return fromUser;
    return pick(profileActiveCompanyId);
  }, [
    workspaceCompanyIdProp,
    scope.companyId,
    activeCompanyId,
    user?.companyId,
    profileActiveCompanyId,
  ]);

  const { data: companyDoc } = useQuery({
    queryKey: ['company-billing', seedCompanyId],
    enabled: open && !!seedCompanyId && clerkAuthLoaded,
    queryFn: async () => {
      const client = await getAuthedSupabase(clerkSupabaseToken);
      return getCompany(seedCompanyId!, client);
    },
    staleTime: 60_000,
  });

  const effectiveCompanyId = useMemo(() => {
    const fromDoc = companyDoc?.id?.trim();
    if (fromDoc) return fromDoc;
    if (seedCompanyId) return seedCompanyId;
    return null;
  }, [companyDoc?.id, seedCompanyId]);

  const companyId = effectiveCompanyId;
  const workspaceName = companyDoc?.name ?? null;

  /** PayBill ref: row (`billing_reference` | `billingReference`) → gate RPC → `FV-` + first 8 chars of company id (UI only). */
  const billingReference = useMemo(() => {
    const row = companyDoc as CompanyDoc & { billing_reference?: string | null };
    const fromSnake =
      row?.billing_reference != null && String(row.billing_reference).trim() !== ''
        ? String(row.billing_reference).trim()
        : '';
    const fromCamel = row?.billingReference?.trim() ?? '';
    const fromServer = fromSnake || fromCamel;
    if (fromServer) return fromServer;
    const fromGate = billingReferenceFromGate?.trim() ?? '';
    if (fromGate) return fromGate;
    const id = row?.id ?? companyId ?? seedCompanyId ?? '';
    const prefix = id.slice(0, 8);
    return prefix ? `FV-${prefix}` : '';
  }, [companyDoc, billingReferenceFromGate, companyId, seedCompanyId]);

  /** Only DB/gate values — omit from STK body when empty so edge uses `core.companies.billing_reference`. */
  const stkBillingReference = useMemo(() => {
    const row = companyDoc as CompanyDoc & { billing_reference?: string | null };
    const fromSnake =
      row?.billing_reference != null && String(row.billing_reference).trim() !== ''
        ? String(row.billing_reference).trim()
        : '';
    const fromCamel = row?.billingReference?.trim() ?? '';
    if (fromSnake || fromCamel) return fromSnake || fromCamel;
    return billingReferenceFromGate?.trim() ?? '';
  }, [companyDoc, billingReferenceFromGate]);

  const [plan, setPlan] = useState<BillingSubmissionPlan>(() => checkoutPlan ?? 'pro');
  const [cycle, setCycle] = useState<BillingSubmissionCycle>(() => checkoutCycle ?? 'monthly');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mpesaName, setMpesaName] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [transactionCode, setTransactionCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<MpesaFieldErrors>({});
  const [stkLoading, setStkLoading] = useState(false);
  const [stkCheckoutRequestId, setStkCheckoutRequestId] = useState<string | null>(null);
  const [stkPhone, setStkPhone] = useState('');
  const [stkActivating, setStkActivating] = useState(false);
  const [manualSubmissionOpen, setManualSubmissionOpen] = useState(false);
  const activationFallbackRef = useRef<number | null>(null);
  /** Rapid refetch while STK callback activates subscription (realtime can lag a few hundred ms). */
  const stkGatePollRef = useRef<number | null>(null);
  /** One idempotency key per modal open / STK attempt chain so double-submit does not create duplicate STKs. */
  const stkIdempotencyKeyRef = useRef<string | null>(null);
  const upgradeOpenTrackedRef = useRef(false);
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    stkIdempotencyKeyRef.current = null;
  }, [open]);

  const { data: pendingStatus, isLoading: pendingLoading } = useQuery({
    queryKey: ['subscription-payment-pending', companyId],
    enabled: open && !!companyId && clerkAuthLoaded,
    queryFn: async () => {
      const client = await getAuthedSupabase(clerkSupabaseToken);
      return getPendingPaymentStatus(companyId!, client);
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (input: Parameters<typeof createPaymentSubmission>[0]) => {
      const client = await getAuthedSupabase(clerkSupabaseToken);
      // Same JWT as `client` — `getSupabaseAccessToken` can be null before Clerk bridge runs, which skipped emails silently.
      return createPaymentSubmission(input, client, clerkSupabaseToken);
    },
    onSuccess: async () => {
      setSuccess(true);
      dispatchUnifiedNotificationNow({
        tier: 'premium',
        kind: 'premium_payment',
        title: 'Payment submitted',
        body: "We're verifying your payment. Your plan will activate shortly.",
        path: '/billing',
        toastType: 'success',
        audiences: ['company'],
      });
      if (companyId) {
        captureEvent(AnalyticsEvents.UPGRADE_COMPLETED, {
          company_id: companyId,
          subscription_plan: planRef.current,
          module_name: 'billing',
        });
      }
      const cid = companyId;
      if (cid) {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['subscription-gate', cid], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['subscription-payment-pending', cid], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['subscription-payments-supabase', cid], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['company-subscription-row', cid], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['company-billing', cid], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['billing-receipts', 'company', cid], type: 'active' }),
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
      setMpesaName('');
      setMpesaPhone('');
      setTransactionCode('');
      setFieldErrors({});
      setStkLoading(false);
      setStkCheckoutRequestId(null);
      setStkPhone('');
      setStkActivating(false);
      setManualSubmissionOpen(false);
      if (activationFallbackRef.current) {
        window.clearTimeout(activationFallbackRef.current);
        activationFallbackRef.current = null;
      }
      if (stkGatePollRef.current) {
        window.clearInterval(stkGatePollRef.current);
        stkGatePollRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      upgradeOpenTrackedRef.current = false;
      return;
    }
    if (!companyId || upgradeOpenTrackedRef.current) return;
    upgradeOpenTrackedRef.current = true;
    captureEvent(AnalyticsEvents.UPGRADE_STARTED, {
      company_id: companyId,
      subscription_plan: planRef.current,
      module_name: 'billing',
      route_path: '/billing',
    });
  }, [open, companyId]);

  useEffect(() => {
    if (!open) return;
    setPlan(checkoutPlan ?? 'pro');
    if (checkoutCycle) setCycle(checkoutCycle);
  }, [open, checkoutPlan, checkoutCycle]);

  const trialBadge =
    isTrial && !isExpired && typeof daysRemaining === 'number' && daysRemaining >= 0
      ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in trial`
      : null;

  const subtitle = useMemo(() => {
    if (!STK_PUSH_ENABLED) {
      if (isExpired) {
        return 'Your trial has ended. Choose a plan, then pay at our Till and submit details for manual verification.';
      }
      return 'Choose a plan and cycle. Pay at our Till and submit your confirmation for manual review.';
    }
    if (isExpired) {
      return 'Your trial has ended. Choose a plan, then pay with M-Pesa STK (instant activation) or pay at our Till and submit details for manual verification.';
    }
    return 'Choose a plan and cycle. Pay with M-Pesa STK for immediate activation, or pay at our Till and submit your confirmation for manual review.';
  }, [isExpired]);

  const selectedPlan = useMemo(() => {
    const p = SUBSCRIPTION_PLANS.find((x) => x.value === plan);
    if (!p || (p.value !== 'basic' && p.value !== 'pro')) return null;
    return {
      id: p.value as BillingSubmissionPlan,
      monthlyPrice: p.pricing.monthly,
      seasonalPrice: p.pricing.season,
      annualPrice: p.pricing.annual,
    };
  }, [plan]);

  const amount = useMemo(() => {
    if (!selectedPlan) return null;
    const fromDb = getBillingPriceAmount(selectedPlan.id, cycle);
    if (fromDb != null) return fromDb;
    if (cycle === 'monthly') return selectedPlan.monthlyPrice;
    if (cycle === 'seasonal') return selectedPlan.seasonalPrice;
    return selectedPlan.annualPrice;
  }, [selectedPlan, cycle, getBillingPriceAmount]);

  const summaryBundleSavingsKes = useMemo(() => {
    if (billingPriceMatrix && getBillingPriceAmount(plan, cycle) != null) {
      return getBillingBundleSavings(plan, cycle);
    }
    return computeBundleSavingsKes(plan, cycle);
  }, [billingPriceMatrix, getBillingPriceAmount, getBillingBundleSavings, plan, cycle]);

  const handleSubmit = async () => {
    setFormError(null);
    setFieldErrors({});
    if (!companyId) {
      setFormError('Workspace not found. Please refresh.');
      return;
    }
    if (amount == null || typeof amount !== 'number') {
      setFormError('Price not available for this plan. Choose Basic or Pro.');
      return;
    }
    const nextErrors: MpesaFieldErrors = {};
    if (!mpesaName.trim()) nextErrors.mpesaName = 'Enter the name as shown on the M-Pesa SMS.';
    const phoneTrim = mpesaPhone.trim();
    if (phoneTrim && phoneTrim.length < 8) nextErrors.mpesaPhone = 'Enter a valid phone number or leave blank.';
    const txNorm = extractMpesaCodeFromPastedMessage(transactionCode.trim()) || transactionCode.trim().replace(/[^A-Za-z0-9]/g, '');
    if (txNorm.length < 8) nextErrors.transactionCode = 'Enter the M-Pesa message or transaction code (at least 8 characters).';
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    const finalTx =
      extractMpesaCodeFromPastedMessage(transactionCode.trim()) ||
      transactionCode.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);

    await mutation.mutateAsync({
      planCode: plan,
      billingCycle: cycle,
      amount,
      mpesaName: mpesaName.trim(),
      mpesaPhone: phoneTrim,
      transactionCode: finalTx,
      currency: 'KES',
    });
  };

  const handleStkPush = async () => {
    setFormError(null);
    if (!clerkAuthLoaded || !clerkSignedIn) {
      toast({
        variant: 'destructive',
        title: 'Sign in required',
        description: 'Wait for sign-in to finish, then try STK again.',
      });
      return;
    }
    if (!scope.isDeveloper && scope.error) {
      toast({
        variant: 'destructive',
        title: 'No active workspace',
        description:
          scope.error === TENANT_SYNC_REQUIRED
            ? 'Your workspace is still syncing. Wait a moment and try again, or refresh the page.'
            : 'Pick your farm workspace in the app (or finish company setup), then retry STK.',
      });
      setFormError('No active company for STK. Use the workspace switcher or finish setup.');
      return;
    }
    const phoneTrim = stkPhone.trim();
    const billingRefTrim = stkBillingReference.trim();
    const safeAmount = Math.round(Number(amount));

    const missing: string[] = [];
    if (!companyId) missing.push('company_id');
    if (plan !== 'basic' && plan !== 'pro') missing.push('plan');
    if (cycle !== 'monthly' && cycle !== 'seasonal' && cycle !== 'annual') missing.push('billing_cycle');
    if (!phoneTrim || phoneTrim.length < 9) missing.push('phone');
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) missing.push('amount');

    // eslint-disable-next-line no-console
    logger.log('STK preflight (BillingModal):', {
      company_id: companyId,
      billing_reference: billingRefTrim || '(omitted — server uses DB)',
      plan,
      billing_cycle: cycle,
      phone: phoneTrim || null,
      amount_raw: amount,
      amount_rounded: safeAmount,
      companyDocLoaded: companyDoc != null,
      missing_fields: missing,
    });

    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[BillingModal] STK blocked — missing or invalid:', missing.join(', '));
      const label =
        missing[0] === 'company_id'
          ? 'Workspace not found'
          : missing[0] === 'phone'
            ? 'Phone required for STK'
            : missing[0] === 'amount'
              ? 'Invalid amount'
              : 'Cannot start STK';
      const description =
        missing[0] === 'company_id'
          ? 'Sign in again or pick your workspace, then retry.'
          : missing[0] === 'phone'
            ? 'Enter the M-Pesa number that should receive the prompt (e.g. 07… or +254…).'
            : missing[0] === 'amount'
              ? 'Choose Basic or Pro and a billing cycle so the price is set.'
              : `Fix: ${missing.join(', ')}`;
      toast({ variant: 'destructive', title: label, description });
      setFormError(`${label}. ${description}`);
      return;
    }

    setStkLoading(true);
    try {
      // eslint-disable-next-line no-console
      logger.log('STK company context:', {
        company_id: companyId,
        billing_reference: billingRefTrim || undefined,
        plan,
        billing_cycle: cycle,
      });
      if (!stkIdempotencyKeyRef.current) {
        stkIdempotencyKeyRef.current = crypto.randomUUID();
      }
      const res = await initiateMpesaStkPush(
        {
          companyId: companyId!,
          phoneNumber: phoneTrim,
          planCode: plan,
          billingCycle: cycle,
          ...(billingRefTrim ? { billingReference: billingRefTrim } : {}),
          amount: safeAmount,
          idempotencyKey: stkIdempotencyKeyRef.current,
        },
        { getAccessToken: clerkSupabaseToken },
      );
      setStkCheckoutRequestId(res.checkoutRequestId);
      toast({
        title: 'Check your phone',
        description: res.customerMessage ?? 'Approve the M-Pesa prompt to complete payment.',
      });
    } catch (e) {
      stkIdempotencyKeyRef.current = null;
      const msg = e instanceof Error ? e.message : 'STK request failed.';
      setFormError(msg);
      toast({ variant: 'destructive', title: 'STK failed', description: msg });
    } finally {
      setStkLoading(false);
    }
  };

  const refetchSubscriptionQueries = useCallback(async (cid: string) => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['subscription-gate', cid], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['subscription-payment-pending', cid], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['subscription-payments-supabase', cid], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['company-subscription-row', cid], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['company-billing', cid], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['billing-receipts', 'company', cid], type: 'active' }),
    ]);
  }, [queryClient]);

  const stopStkGatePoll = useCallback(() => {
    if (stkGatePollRef.current != null) {
      window.clearInterval(stkGatePollRef.current);
      stkGatePollRef.current = null;
    }
  }, []);

  const startStkGatePoll = useCallback(
    (cid: string) => {
      stopStkGatePoll();
      void refetchSubscriptionQueries(cid);
      stkGatePollRef.current = window.setInterval(() => {
        void refetchSubscriptionQueries(cid);
      }, 280);
      window.setTimeout(() => stopStkGatePoll(), 12_000);
    },
    [refetchSubscriptionQueries, stopStkGatePoll],
  );

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const handleStkPaymentSuccess = useCallback(() => {
    // Don't close immediately — wait for subscription_activated event so queries get refreshed.
    // Show activating state instead.
    setStkActivating(true);
    const cid = companyIdRef.current;
    if (cid) startStkGatePoll(cid);
    // Fallback: if subscription_activated never arrives within 10s (e.g. edge function delay),
    // force refetch and close so the user isn't stuck.
    activationFallbackRef.current = window.setTimeout(async () => {
      activationFallbackRef.current = null;
      const id = companyIdRef.current;
      stopStkGatePoll();
      if (id) await refetchSubscriptionQueries(id);
      onOpenChangeRef.current(false);
    }, 10_000);
  }, [refetchSubscriptionQueries, startStkGatePoll, stopStkGatePoll]);

  const handleSubscriptionActivatedFromStk = async () => {
    // Clear fallback timer — the real activation event arrived in time.
    if (activationFallbackRef.current) {
      window.clearTimeout(activationFallbackRef.current);
      activationFallbackRef.current = null;
    }
    stopStkGatePoll();
    dispatchUnifiedNotificationNow({
      tier: 'premium',
      kind: 'premium_subscription',
      title: 'Subscription active',
      body: 'Your FarmVault plan is now active.',
      path: '/dashboard',
      toastType: 'success',
      audiences: ['company'],
    });
    const cid = companyIdRef.current;
    if (cid) await refetchSubscriptionQueries(cid);
    // Let one paint cycle show updated plan in navbar before unmounting checkout.
    window.requestAnimationFrame(() => {
      window.setTimeout(() => onOpenChange(false), 120);
    });
  };

  const handleTransactionCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData('text');
    const looksLikeSms =
      raw.length >= 25 ||
      /\bconfirmed\b/i.test(raw) ||
      /\bm-?pesa\b/i.test(raw) ||
      /\bsafaricom\b/i.test(raw);
    if (!looksLikeSms) return;
    const code = extractMpesaCodeFromPastedMessage(raw);
    if (code.length < 8) return;
    e.preventDefault();
    setTransactionCode(code);
    setFieldErrors((p) => ({ ...p, transactionCode: undefined }));
    const name = extractMpesaNameFromPastedMessage(raw);
    if (name && !mpesaName.trim()) {
      setMpesaName(name);
      setFieldErrors((p) => ({ ...p, mpesaName: undefined }));
    }
  };

  const busy = mutation.isPending || (STK_PUSH_ENABLED && stkLoading);
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

                {formError ? (
                  <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive sm:mb-6 sm:px-4 sm:py-3 sm:text-sm">
                    {formError}
                  </div>
                ) : null}

                {/*
                  Mobile: plan → cycle → summary (list) + STK → manual submission (collapsible).
                  Desktop: summary (left) + STK (right); full-width manual submission row at bottom.
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

                  <div
                    className={cn(
                      'order-3 flex flex-col gap-0 max-lg:border-t max-lg:border-border/40 max-lg:pt-3',
                      'lg:contents lg:border-0 lg:pt-0',
                    )}
                  >
                    <PaymentSummaryCard
                      plan={plan}
                      cycle={cycle}
                      businessName={BUSINESS}
                      workspaceName={workspaceName}
                      displayAmountKes={amount}
                      bundleSavingsKes={summaryBundleSavingsKes}
                      className={cn(
                        'max-lg:rounded-none max-lg:border-0 max-lg:shadow-none max-lg:ring-0',
                        'lg:col-span-3 lg:col-start-1 lg:row-start-3 lg:self-start lg:border-t-0 lg:pt-0',
                      )}
                    />

                    <div className="flex flex-col gap-4 max-lg:border-t max-lg:border-border/40 max-lg:bg-muted/10 max-lg:p-4 lg:col-span-3 lg:col-start-4 lg:row-start-3 lg:self-start lg:border-t-0 lg:bg-transparent lg:p-0">
                      <section className="space-y-3 rounded-xl border border-border/50 bg-muted/10 p-3 sm:p-4 max-lg:border-0 max-lg:bg-transparent max-lg:p-0">
                        <div className="border-b border-border/40 pb-2 max-lg:border-border/30">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Pay via M-Pesa STK push
                        </p>
                        {STK_PUSH_ENABLED ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Approve the prompt on your phone; your subscription activates automatically.
                          </p>
                        ) : (
                          <p className="mt-2 text-xs font-medium text-muted-foreground">
                            STK push prompt coming soon. Open Manual submission below to pay at our Till.
                          </p>
                        )}
                        </div>
                        {STK_PUSH_ENABLED ? (
                        <>
                          <div className="space-y-1.5">
                            <label htmlFor="billing-stk-phone" className="text-xs font-medium text-foreground">
                              Phone number
                            </label>
                            <Input
                              id="billing-stk-phone"
                              className="h-9 rounded-md bg-background lg:h-10 lg:rounded-lg"
                              value={stkPhone}
                              disabled={busy}
                              onChange={(e) => setStkPhone(e.target.value)}
                              placeholder="07… or +254…"
                              inputMode="tel"
                              autoComplete="tel"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy || stkLoading}
                            className="h-9 w-full gap-2 rounded-md text-xs lg:h-10 lg:rounded-lg lg:text-sm"
                            onClick={() => void handleStkPush()}
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                            {stkLoading ? 'Sending STK prompt…' : 'Send STK prompt'}
                          </Button>
                          {stkActivating && (
                            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100/90">
                              <span aria-hidden>✅</span> Payment confirmed — activating your subscription…
                            </div>
                          )}
                          {/* Always keep StkPushConfirmation mounted while checkoutRequestId is set.
                              When stkActivating=true the component internally returns null (status=SUCCESS)
                              so it's invisible, but its Realtime subscription stays alive to catch the
                              subscription_activated event and fire onSubscriptionActivated. */}
                          {stkCheckoutRequestId ? (
                            <StkPushConfirmation
                              checkoutRequestId={stkCheckoutRequestId}
                              confirmationContext="billing"
                              onPaymentSuccess={stkActivating ? undefined : handleStkPaymentSuccess}
                              onSubscriptionActivated={() => void handleSubscriptionActivatedFromStk()}
                            />
                          ) : null}
                        </>
                      ) : null}
                      </section>
                    </div>
                  </div>

                  <Collapsible
                    open={manualSubmissionOpen}
                    onOpenChange={setManualSubmissionOpen}
                    className="order-4 max-lg:border-t max-lg:border-border/40 max-lg:pt-3 lg:order-none lg:col-span-6 lg:col-start-1 lg:row-start-4"
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full justify-between gap-2 rounded-xl border-dashed px-4 text-sm font-medium lg:h-11"
                      >
                        <span>Manual submission</span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                            manualSubmissionOpen && 'rotate-180',
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="overflow-hidden">
                      <section className="mt-3 space-y-3 rounded-xl border border-border/50 bg-muted/10 p-3 sm:mt-4 sm:p-4">
                        <div className="border-b border-border/40 pb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Till number
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Pay the amount shown in the summary to our Till. Use the account name below when M-Pesa asks
                            for it, then submit your details here for verification.
                          </p>
                        </div>
                        <dl className="space-y-2 rounded-lg bg-background/60 px-3 py-2 text-xs ring-1 ring-border/40">
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Till number</dt>
                            <dd className="font-mono font-medium text-foreground">{TILL}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Account name</dt>
                            <dd className="text-right font-medium text-foreground">FarmVault Technologies</dd>
                          </div>
                        </dl>
                        <MpesaPaymentForm
                          mpesaName={mpesaName}
                          mpesaPhone={mpesaPhone}
                          transactionCode={transactionCode}
                          onMpesaNameChange={(v) => {
                            setMpesaName(v);
                            if (fieldErrors.mpesaName) setFieldErrors((p) => ({ ...p, mpesaName: undefined }));
                          }}
                          onMpesaPhoneChange={(v) => {
                            setMpesaPhone(v);
                            if (fieldErrors.mpesaPhone) setFieldErrors((p) => ({ ...p, mpesaPhone: undefined }));
                          }}
                          onTransactionCodeChange={(v) => {
                            setTransactionCode(v);
                            if (fieldErrors.transactionCode) setFieldErrors((p) => ({ ...p, transactionCode: undefined }));
                          }}
                          onTransactionCodePaste={handleTransactionCodePaste}
                          fieldErrors={fieldErrors}
                          disabled={busy}
                          onSubmit={() => void handleSubmit()}
                          onDismiss={() => onOpenChange(false)}
                          submitLoading={mutation.isPending}
                          className="space-y-3 lg:space-y-4"
                        />
                      </section>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
