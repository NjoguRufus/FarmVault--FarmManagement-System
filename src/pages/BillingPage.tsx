import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Crown,
  CreditCard,
  Download,
  Loader2,
  Shield,
  Zap,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useBillingPrices } from '@/hooks/useBillingPrices';
import { getCompany, type CompanyDoc } from '@/services/companyService';
import {
  getCurrentCompanySubscription,
  listCompanySubscriptionPayments,
  type CompanySubscriptionRow,
  type PaymentSubmissionRow,
} from '@/services/billingSubmissionService';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { Button } from '@/components/ui/button';
import { SUBSCRIPTION_PLANS } from '@/config/plans';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import {
  billingCycleDurationMonths,
  billingCycleLabel,
  computeBundleSavingsKes,
  getBillingAmountKes,
  parseBillingCycle,
} from '@/lib/billingPricing';
import { PlanSelector } from '@/components/subscription/billing/PlanSelector';
import { BillingCycleSelector } from '@/components/subscription/billing/BillingCycleSelector';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import {
  createReceiptPdfSignedUrl,
  sendCompanyPaymentReceipt,
  listReceiptsForCompany,
  type BillingReceiptRow,
} from '@/services/receiptsService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { logger } from "@/lib/logger";

/** Independent blocks share this width; no single outer max-width wrapper. */
const BILLING_CONTENT = 'mx-auto w-full max-w-[760px]';

const billingPageCanvas =
  'min-h-full bg-[hsl(72_18%_95%)] px-4 py-6 sm:px-6 dark:bg-[hsl(145_14%_10%)]';

/** Soft neumorphism: raised panel, calm agri-tech surface. */
const billingSectionSurface = cn(
  BILLING_CONTENT,
  'rounded-[11px] border border-[hsl(88_10%_86%)]/85 bg-[hsl(82_16%_97%)]',
  'p-5 sm:p-6',
  'shadow-[6px_6px_18px_rgba(32,42,28,0.08),-5px_-5px_14px_rgba(255,255,255,0.92)]',
  'dark:border-white/[0.07] dark:bg-[hsl(145_9%_16%)] dark:shadow-[8px_8px_22px_rgba(0,0,0,0.38),-4px_-4px_12px_rgba(255,255,255,0.03)]',
);

const billingSectionTitle = 'text-[17px] font-semibold tracking-tight text-foreground';
const billingSectionDesc = 'text-sm text-muted-foreground/90';
const billingSectionHead = 'mb-5 space-y-2';

const billingPriceInset = cn(
  'mt-6 rounded-[10px] border border-[hsl(90_8%_88%)]/60 bg-[hsl(88_14%_96%)]/90 px-4 py-3.5',
  'shadow-[inset_2px_2px_6px_rgba(32,42,28,0.05),inset_-2px_-2px_6px_rgba(255,255,255,0.85)]',
  'dark:border-white/[0.06] dark:bg-[hsl(145_8%_14%)] dark:shadow-[inset_2px_2px_8px_rgba(0,0,0,0.25)]',
);

const billingPrimaryBtn = cn(
  'rounded-[9px] px-6 font-medium shadow-[3px_3px_8px_rgba(32,42,28,0.12),-2px_-2px_6px_rgba(255,255,255,0.5)]',
  'transition-[box-shadow,transform] hover:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.12),inset_-1px_-1px_4px_rgba(255,255,255,0.25)] hover:brightness-[1.02] active:scale-[0.99]',
  'dark:hover:shadow-[inset_2px_2px_8px_rgba(0,0,0,0.35)]',
);

const billingOutlineBtn = cn(
  'rounded-[9px] font-medium',
  'shadow-[2px_2px_6px_rgba(32,42,28,0.06),-2px_-2px_6px_rgba(255,255,255,0.7)]',
  'transition-[box-shadow] hover:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.06),inset_-1px_-1px_4px_rgba(255,255,255,0.4)]',
);

const TILL = (import.meta.env.VITE_MPESA_TILL_NUMBER as string | undefined)?.trim() || '5334350';
const BUSINESS = (import.meta.env.VITE_MPESA_BUSINESS_NAME as string | undefined)?.trim() || 'FarmVault';

function gatePlanToWorkspacePlan(
  p: 'trial' | 'basic' | 'pro' | 'enterprise',
): BillingSubmissionPlan {
  if (p === 'basic') return 'basic';
  return 'pro';
}

function paymentStatusMeta(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  if (s === 'approved') {
    return { label: 'Approved', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' };
  }
  if (s === 'failed') {
    return { label: 'Failed', className: 'bg-destructive/15 text-destructive' };
  }
  if (s === 'rejected') {
    return { label: 'Rejected', className: 'bg-destructive/15 text-destructive' };
  }
  if (s === 'pending_verification') {
    return { label: 'Pending review', className: 'bg-amber-500/15 text-amber-950 dark:text-amber-200' };
  }
  return { label: 'Pending', className: 'bg-sky-500/10 text-sky-900 dark:text-sky-200' };
}

function paymentRowKind(p: PaymentSubmissionRow): 'manual' | 'stk' {
  const pm = String(p.payment_method ?? '').toLowerCase();
  const bm = String(p.billing_mode ?? '').toLowerCase();
  if (p.ledger_source === 'mpesa_stk' || pm === 'mpesa_stk' || bm === 'mpesa_stk') return 'stk';
  return 'manual';
}

/** Prefer approval / paid time; matches developer payment history ordering. */
function paymentHistoryDisplayIso(p: PaymentSubmissionRow): string | null {
  return p.approved_at ?? p.submitted_at ?? p.created_at ?? null;
}

/** Status label for tenant table: approved rows show “Paid” (manual + STK). */
function tenantPaymentStatusMeta(p: PaymentSubmissionRow): { label: string; className: string } {
  if (String(p.status).toLowerCase() === 'approved') {
    return { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' };
  }
  return paymentStatusMeta(String(p.status));
}

function cycleLabelFromRow(mode: string | null, cycle: string | null): string {
  const parsed = parseBillingCycle(cycle ?? mode);
  if (parsed) return billingCycleLabel(parsed);
  const m = (mode ?? '').toLowerCase().trim();
  if (m === 'manual' || m === 'mpesa_manual') {
    const c = parseBillingCycle(cycle);
    if (c) return billingCycleLabel(c);
    return 'M-Pesa (manual)';
  }
  return '—';
}

/** Match `subscription_payments.id` to `receipts.subscription_payment_id` (handles UUID string quirks). */
function billingPaymentLookupKey(id: string | null | undefined): string {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '');
}

export default function BillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';
  const [searchParams, setSearchParams] = useSearchParams();
  const receiptFromQuery = searchParams.get('receipt');
  const receiptHandledRef = useRef(false);
  const receiptBackfillRunKeyRef = useRef<string | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BillingSubmissionPlan>('pro');
  const [selectedCycle, setSelectedCycle] = useState<BillingSubmissionCycle>('monthly');
  const prefsInitialized = useRef(false);

  const {
    plan: gatePlan,
    status: gateStatus,
    isTrial,
    isExpired,
    daysRemaining,
    isOverrideActive,
    trialExpiredNeedsPlan,
    isLoading: gateLoading,
    trialEndsAt,
    displayAccessEndIso,
    isActivePaid,
    billingModeFromGate,
    billingCycleFromGate,
  } = useSubscriptionStatus();

  const { matrix: billingPriceMatrix, getAmount: getLivePrice, getBundleSavings: getLiveBundleSavings } =
    useBillingPrices({ enabled: !isDeveloper });

  const { data: company } = useQuery<CompanyDoc | null>({
    queryKey: ['company-billing', companyId],
    enabled: !!companyId,
    queryFn: () => getCompany(companyId!),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: subRow, isLoading: subLoading } = useQuery({
    queryKey: ['company-subscription-row', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => getCurrentCompanySubscription(companyId!),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['subscription-payments-supabase', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => listCompanySubscriptionPayments(companyId!),
  });

  const paymentsSyncKey = useMemo(
    () =>
      (payments as PaymentSubmissionRow[])
        .map((p) => `${p.id}:${String(p.status).toLowerCase()}:${p.amount}`)
        .sort()
        .join('|'),
    [payments],
  );

  useEffect(() => {
    if (!companyId || isDeveloper || paymentsLoading) return;
    void queryClient.refetchQueries({ queryKey: ['company-billing', companyId], type: 'active' });
  }, [companyId, isDeveloper, paymentsLoading, paymentsSyncKey, queryClient]);

  const {
    data: billingReceipts = [],
    isFetched: receiptsFetched,
    isError: receiptsIsError,
    error: receiptsFetchErr,
  } = useQuery({
    queryKey: ['billing-receipts', 'company', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => listReceiptsForCompany(companyId!),
  });

  const receiptByPaymentId = useMemo(() => {
    const m = new Map<string, BillingReceiptRow>();
    for (const r of billingReceipts) {
      const k = billingPaymentLookupKey(r.subscription_payment_id);
      if (k) m.set(k, r);
    }
    return m;
  }, [billingReceipts]);

  const [receiptIssuingPaymentId, setReceiptIssuingPaymentId] = useState<string | null>(null);
  const [receiptDialogRow, setReceiptDialogRow] = useState<BillingReceiptRow | null>(null);
  const [receiptPdfUrl, setReceiptPdfUrl] = useState<string | null>(null);
  const [receiptPdfLoading, setReceiptPdfLoading] = useState(false);

  const openReceiptForRow = useCallback(
    async (row: BillingReceiptRow) => {
      setReceiptDialogRow(row);
      setReceiptPdfUrl(null);
      setReceiptPdfLoading(true);
      try {
        const url = await createReceiptPdfSignedUrl(row.pdf_storage_path, 600);
        setReceiptPdfUrl(url);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not load receipt';
        toast({ variant: 'destructive', title: 'Receipt', description: msg });
        setReceiptDialogRow(null);
      } finally {
        setReceiptPdfLoading(false);
      }
    },
    [toast],
  );

  const requestReceiptForPayment = useCallback(
    async (paymentId: string, options?: { openAfter?: boolean }) => {
      if (!companyId) return;
      setReceiptIssuingPaymentId(paymentId);
      try {
        await sendCompanyPaymentReceipt(paymentId, undefined, { sendEmail: false });
        const rows = await listReceiptsForCompany(companyId);
        await queryClient.invalidateQueries({ queryKey: ['billing-receipts', 'company', companyId] });
        const key = billingPaymentLookupKey(paymentId);
        const row = rows.find((r) => billingPaymentLookupKey(r.subscription_payment_id) === key) ?? null;
        if (options?.openAfter && row) {
          await openReceiptForRow(row);
        } else if (row) {
          toast({
            title: 'Receipt ready',
            description: 'Use View receipt to open or download your PDF.',
          });
        } else {
          toast({
            title: 'Receipt created',
            description: 'Refresh the page if the View receipt button does not appear yet.',
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not create receipt';
        toast({
          variant: 'destructive',
          title: 'Receipt',
          description: msg,
        });
      } finally {
        setReceiptIssuingPaymentId(null);
      }
    },
    [companyId, openReceiptForRow, queryClient, toast],
  );

  useEffect(() => {
    receiptHandledRef.current = false;
  }, [receiptFromQuery]);

  useEffect(() => {
    receiptBackfillRunKeyRef.current = null;
  }, [companyId]);

  // Issue PDF receipts for approved payments that pre-date receipt issuance (no duplicate email).
  useEffect(() => {
    if (isDeveloper || !companyId || !receiptsFetched || receiptsIsError || paymentsLoading) return;

    const paidIds = new Set(
      billingReceipts.map((r) => billingPaymentLookupKey(r.subscription_payment_id)).filter(Boolean),
    );
    const missing = payments.filter(
      (p) =>
        String(p.status).toLowerCase() === 'approved' &&
        p.ledger_source !== 'mpesa_stk' &&
        !paidIds.has(billingPaymentLookupKey(p.id)),
    );
    if (missing.length === 0) return;

    const runKey = `${companyId}:${missing
      .map((m) => m.id)
      .sort()
      .join(',')}`;
    if (receiptBackfillRunKeyRef.current === runKey) return;
    receiptBackfillRunKeyRef.current = runKey;

    void (async () => {
      for (const p of missing) {
        try {
          await sendCompanyPaymentReceipt(p.id, undefined, { sendEmail: false });
        } catch (e) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[BillingPage] receipt backfill failed for payment', p.id, e);
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['billing-receipts', 'company', companyId] });
    })();
  }, [
    isDeveloper,
    companyId,
    receiptsFetched,
    receiptsIsError,
    paymentsLoading,
    payments,
    billingReceipts,
    queryClient,
  ]);

  // Deep link ?receipt=<receipt id> from email
  useEffect(() => {
    if (!receiptFromQuery || receiptHandledRef.current || isDeveloper || !companyId) return;
    if (!receiptsFetched) return;

    receiptHandledRef.current = true;

    const clearReceiptParam = () =>
      setSearchParams(
        (p) => {
          p.delete('receipt');
          return p;
        },
        { replace: true },
      );

    if (receiptsIsError) {
      toast({
        variant: 'destructive',
        title: 'Receipt',
        description:
          receiptsFetchErr instanceof Error ? receiptsFetchErr.message : 'Could not load receipts',
      });
      clearReceiptParam();
      return;
    }

    const hit = billingReceipts.find((r) => r.id === receiptFromQuery);
    if (hit) {
      void openReceiptForRow(hit);
    } else {
      toast({
        title: 'Receipt not found',
        description: 'This link may be invalid or the receipt may belong to another workspace.',
      });
    }
    clearReceiptParam();
  }, [
    receiptFromQuery,
    receiptsFetched,
    receiptsIsError,
    receiptsFetchErr,
    billingReceipts,
    isDeveloper,
    companyId,
    openReceiptForRow,
    setSearchParams,
    toast,
  ]);

  const workspacePlan = useMemo(() => gatePlanToWorkspacePlan(gatePlan), [gatePlan]);

  useEffect(() => {
    if (!companyId || isDeveloper) return;
    captureEvent(AnalyticsEvents.SUBSCRIPTION_PAGE_VIEWED, {
      company_id: companyId,
      subscription_plan: workspacePlan,
      module_name: 'billing',
      route_path: '/billing',
    });
  }, [companyId, isDeveloper, workspacePlan]);

  const latestApprovedBillingCycle = useMemo(() => {
    const approved = (payments as PaymentSubmissionRow[]).find((p) => (p.status ?? '').toLowerCase() === 'approved');
    return approved?.billing_cycle ?? null;
  }, [payments]);

  const workspaceCycle = useMemo(() => {
    const row = subRow as CompanySubscriptionRow | null | undefined;
    return parseBillingCycle(
      row?.billing_cycle ?? billingCycleFromGate ?? latestApprovedBillingCycle ?? row?.billing_mode ?? billingModeFromGate,
    );
  }, [subRow, billingCycleFromGate, billingModeFromGate, latestApprovedBillingCycle]);

  useEffect(() => {
    prefsInitialized.current = false;
  }, [companyId]);

  useEffect(() => {
    if (prefsInitialized.current || isDeveloper || gateLoading) return;
    if (!companyId) return;
    if (subLoading) return;
    setSelectedPlan(workspacePlan);
    setSelectedCycle(workspaceCycle ?? 'monthly');
    prefsInitialized.current = true;
  }, [companyId, workspacePlan, workspaceCycle, gateLoading, subLoading, isDeveloper]);

  useEffect(() => {
    if (!import.meta.env.DEV || isDeveloper || !companyId) return;
    // eslint-disable-next-line no-console
    logger.log('[BillingPage] resolved subscription for UI', {
      companyId,
      isActivePaid,
      gateStatus,
      displayAccessEndIso,
      subRowStatus: (subRow as CompanySubscriptionRow | null)?.status ?? null,
    });
  }, [companyId, isDeveloper, isActivePaid, gateStatus, displayAccessEndIso, subRow]);

  const checkoutAmount = useMemo(() => {
    const live = getLivePrice(selectedPlan, selectedCycle);
    if (live != null) return live;
    return getBillingAmountKes(selectedPlan, selectedCycle);
  }, [selectedPlan, selectedCycle, getLivePrice]);

  const checkoutSavings = useMemo(() => {
    if (billingPriceMatrix) return getLiveBundleSavings(selectedPlan, selectedCycle);
    return computeBundleSavingsKes(selectedPlan, selectedCycle);
  }, [selectedPlan, selectedCycle, billingPriceMatrix, getLiveBundleSavings]);

  const periodSuffix = useMemo(() => {
    switch (selectedCycle) {
      case 'monthly':
        return '/ month';
      case 'seasonal':
        return '/ season';
      case 'annual':
        return '/ year';
    }
  }, [selectedCycle]);

  const planTitle = useMemo(() => {
    if (isDeveloper) return 'Developer';
    if (isTrial) return 'Pro';
    switch (gatePlan) {
      case 'basic':
        return 'Basic';
      case 'pro':
        return 'Pro';
      case 'enterprise':
        return 'Enterprise';
      default:
        return 'Workspace';
    }
  }, [gatePlan, isTrial, isDeveloper]);

  const statusHeadline = useMemo(() => {
    if (isDeveloper) return 'Full platform access';
    if (isOverrideActive) return 'Developer override active';
    if (isTrial) return 'Pro trial active';
    if (gateStatus === 'pending_approval') return 'Awaiting approval';
    if (gateStatus === 'pending_payment') return 'Payment under review';
    if (isActivePaid) {
      if (gatePlan === 'basic') return 'Basic Active';
      if (gatePlan === 'pro') return 'Pro Active';
      return 'Active';
    }
    if (isExpired || trialExpiredNeedsPlan) return 'Subscription inactive';
    if (gateStatus === 'active') return 'Active';
    return 'Subscription';
  }, [isDeveloper, isOverrideActive, gateStatus, isActivePaid, isTrial, isExpired, trialExpiredNeedsPlan, gatePlan]);

  const statusDetail = useMemo(() => {
    if (isDeveloper) return 'Your account is not billed through this workspace.';
    if (isOverrideActive) return 'Billing and limits are managed by the FarmVault team.';
    if (isTrial) return 'Enjoy full Pro features during your trial window.';
    if (gateStatus === 'pending_approval') return 'Complete activation to start your trial or paid plan.';
    if (gateStatus === 'pending_payment') return 'We will activate your plan after M-Pesa verification.';
    if (isActivePaid) return 'Your paid subscription is active. Renew before the end date to avoid interruption.';
    if (trialExpiredNeedsPlan) return 'Choose Basic or Pro to continue with full access.';
    if (isExpired) return 'Renew to restore full write access to your farm data.';
    return 'Thank you for being a FarmVault customer.';
  }, [isDeveloper, isOverrideActive, gateStatus, isActivePaid, trialExpiredNeedsPlan, isExpired, isTrial]);

  const expiryLabel = useMemo(() => {
    if (isDeveloper) return '—';
    const iso =
      displayAccessEndIso ??
      subRow?.current_period_end ??
      subRow?.active_until ??
      trialEndsAt ??
      subRow?.trial_ends_at ??
      null;
    if (!iso) return '—';
    try {
      return format(parseISO(iso), 'PP');
    } catch {
      return '—';
    }
  }, [isDeveloper, displayAccessEndIso, trialEndsAt, subRow]);

  const billingCycleDisplay = useMemo(() => {
    if (isDeveloper) return '—';
    const row = subRow as CompanySubscriptionRow | null | undefined;
    const mode = row?.billing_mode ?? billingModeFromGate ?? null;
    const cycle = row?.billing_cycle ?? billingCycleFromGate ?? latestApprovedBillingCycle ?? null;
    return cycleLabelFromRow(mode, cycle);
  }, [isDeveloper, subRow, billingModeFromGate, billingCycleFromGate, latestApprovedBillingCycle]);

  const primaryCtaLabel = useMemo(() => {
    if (isDeveloper) return null;
    if (isOverrideActive || gateStatus === 'pending_payment') return null;
    if (isExpired || trialExpiredNeedsPlan) return 'Activate subscription';
    if (isTrial) return 'Upgrade';
    if (gatePlan === 'basic' && gateStatus === 'active') return 'Upgrade';
    return 'Renew & pay';
  }, [isDeveloper, isOverrideActive, gateStatus, isExpired, trialExpiredNeedsPlan, isTrial, gatePlan]);

  const showPaySection = !isDeveloper && !isOverrideActive && gateStatus !== 'pending_payment';

  const trialBannerText = useMemo(() => {
    if (!isTrial || isExpired || typeof daysRemaining !== 'number' || daysRemaining < 0) return null;
    return `Pro trial · ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`;
  }, [isTrial, isExpired, daysRemaining]);

  if (!companyId) {
    return (
      <div className={cn(billingPageCanvas, 'animate-fade-in')}>
        <p className={cn(BILLING_CONTENT, 'text-sm text-muted-foreground')}>
          Join or select a company to manage billing.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(billingPageCanvas, 'animate-fade-in')}>
      <div className="flex flex-col gap-[30px]">
        {/* Page header — independent width, no shared content wrapper */}
        <header className={cn(BILLING_CONTENT, 'space-y-2')}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Billing</h1>
          <p className="text-sm text-muted-foreground/90">
            Subscription, M-Pesa payments, and plan options for your workspace.
          </p>
        </header>

        {/* Alerts */}
        {(isExpired || trialExpiredNeedsPlan) && !isOverrideActive && !isDeveloper && (
          <div
            className={cn(
              BILLING_CONTENT,
              'flex gap-3 rounded-[11px] border border-destructive/20 bg-[hsl(0_0%_100%_/0.55)] px-4 py-3.5 text-sm text-destructive',
              'shadow-[4px_4px_12px_rgba(32,42,28,0.06),-3px_-3px_10px_rgba(255,255,255,0.85)]',
              'dark:bg-destructive/10',
            )}
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Access limited</p>
              <p className="mt-1.5 text-destructive/90">
                {trialExpiredNeedsPlan
                  ? 'Your Pro trial has ended. Pick a plan and submit payment to restore full access, or use the plan picker in the app header if you are a company admin.'
                  : 'Your subscription has expired. Submit a payment to continue without interruption.'}
              </p>
            </div>
          </div>
        )}

        {gateStatus === 'pending_payment' && !isDeveloper && (
          <div
            className={cn(
              BILLING_CONTENT,
              'flex gap-3 rounded-[11px] border border-sky-500/18 bg-[hsl(200_40%_98%_/0.7)] px-4 py-3.5 text-sm',
              'shadow-[4px_4px_12px_rgba(32,42,28,0.05),-3px_-3px_10px_rgba(255,255,255,0.85)]',
              'dark:bg-sky-500/10',
            )}
          >
            <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-400" />
            <div>
              <p className="font-medium text-foreground">Payment received — pending verification</p>
              <p className="mt-1.5 text-muted-foreground">
                Our team is reviewing your M-Pesa submission. No need to pay again unless we contact you.
              </p>
            </div>
          </div>
        )}

        {isOverrideActive && !isDeveloper && (
          <div
            className={cn(
              BILLING_CONTENT,
              'flex gap-3 rounded-[11px] border border-emerald-500/20 bg-[hsl(142_35%_97%_/0.75)] px-4 py-3.5 text-sm',
              'shadow-[4px_4px_12px_rgba(32,42,28,0.05),-3px_-3px_10px_rgba(255,255,255,0.85)]',
              'dark:bg-emerald-500/10',
            )}
          >
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <div>
              <p className="font-medium text-foreground">Developer override</p>
              <p className="mt-1.5 text-muted-foreground">Your plan and billing are managed directly by FarmVault.</p>
            </div>
          </div>
        )}

        {/* Active subscription */}
        <section className={billingSectionSurface}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {trialBannerText ? (
                  <span className="inline-flex items-center rounded-md border border-primary/22 bg-primary/[0.09] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
                    {trialBannerText}
                  </span>
                ) : null}
                {isActivePaid && !isDeveloper ? (
                  <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                    Active
                  </span>
                ) : null}
                {!isTrial && gateStatus === 'active' && !isDeveloper && !isActivePaid ? (
                  <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {planTitle} plan
                  </span>
                ) : null}
              </div>

              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] text-primary',
                    'bg-[hsl(88_20%_94%)] shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06),inset_-2px_-2px_6px_rgba(255,255,255,0.85)]',
                    'dark:bg-[hsl(145_12%_18%)] dark:shadow-[inset_2px_2px_8px_rgba(0,0,0,0.35)]',
                  )}
                >
                  <Crown className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 space-y-2">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {isDeveloper ? 'Developer access' : `${planTitle} subscription`}
                  </h2>
                  <p className="text-sm text-muted-foreground/90">{statusDetail}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/35 pt-4">
                <div className="space-y-1">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Plan</dt>
                  <dd className="text-sm font-medium text-foreground">{isDeveloper ? '—' : planTitle}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Billing cycle
                  </dt>
                  <dd className="text-sm font-medium text-foreground">{billingCycleDisplay}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {isTrial ? 'Trial ends' : 'Next renewal / ends'}
                  </dt>
                  <dd className="text-sm font-medium text-foreground">{expiryLabel}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</dt>
                  <dd
                    className={cn(
                      'text-sm font-medium',
                      isActivePaid ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
                    )}
                  >
                    {statusHeadline}
                  </dd>
                </div>
              </dl>

              {typeof daysRemaining === 'number' && daysRemaining >= 0 && isTrial && !isDeveloper ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{daysRemaining}</span> day
                  {daysRemaining === 1 ? '' : 's'} remaining on your trial.
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-2 lg:items-end">
              {primaryCtaLabel ? (
                <Button className={cn(billingPrimaryBtn, 'h-11')} onClick={() => setCheckoutOpen(true)}>
                  {primaryCtaLabel}
                </Button>
              ) : null}
              {showPaySection && !primaryCtaLabel ? (
                <Button variant="outline" className={cn(billingOutlineBtn, 'h-11 px-6')} onClick={() => setCheckoutOpen(true)}>
                  Pay with M-Pesa
                </Button>
              ) : null}
            </div>
          </div>
        </section>

      {!isDeveloper ? (
        <>
          {/* Choose plan + checkout (single floating block; activate CTA is flat inside) */}
          <section className={billingSectionSurface}>
            <div className={billingSectionHead}>
              <h2 className={billingSectionTitle}>Choose plan</h2>
              <p className={billingSectionDesc}>
                Selection updates your checkout amount. Your current workspace plan is marked below.
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
              <PlanSelector
                value={selectedPlan}
                onChange={setSelectedPlan}
                workspacePlan={workspacePlan}
                disabled={subLoading}
              />
              <BillingCycleSelector
                value={selectedCycle}
                onChange={setSelectedCycle}
                workspaceCycle={workspaceCycle}
                disabled={subLoading}
              />
            </div>
            <div className={billingPriceInset}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Price preview</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                KES {checkoutAmount.toLocaleString()}
                <span className="text-base font-medium text-muted-foreground">{periodSuffix}</span>
              </p>
              {checkoutSavings > 0 ? (
                <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Save KES {checkoutSavings.toLocaleString()} vs paying monthly for{' '}
                  {billingCycleDurationMonths(selectedCycle)} months.
                </p>
              ) : null}
            </div>

            {showPaySection ? (
              <div className="mt-6 border-t border-border/35 pt-6">
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-3">
                    <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Activate subscription</h3>
                    <p className="text-sm text-muted-foreground/90">
                      Pay via M-Pesa to the till below, then complete checkout with your transaction code.
                    </p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex justify-between gap-8 border-b border-border/30 pb-2">
                        <span className="text-muted-foreground">Till number</span>
                        <span className="font-mono font-medium text-foreground">{TILL}</span>
                      </li>
                      <li className="flex justify-between gap-8 border-b border-border/30 pb-2">
                        <span className="text-muted-foreground">Business</span>
                        <span className="font-medium text-foreground">{BUSINESS}</span>
                      </li>
                      <li className="flex justify-between gap-8 pt-0.5">
                        <span className="text-muted-foreground">Amount due</span>
                        <span className="text-lg font-semibold text-foreground">
                          KES {checkoutAmount.toLocaleString()}
                        </span>
                      </li>
                    </ul>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 md:w-52">
                    <Button size="lg" className={cn(billingPrimaryBtn, 'h-12 px-8 text-base')} onClick={() => setCheckoutOpen(true)}>
                      Pay now
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">Opens secure payment form</p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {/* Payment history */}
          <section className={billingSectionSurface}>
            <div className={billingSectionHead}>
              <h2 className={billingSectionTitle}>Payment history</h2>
              <p className={billingSectionDesc}>
                STK and manual PayBill. <span className="font-medium text-foreground">Get receipt</span> until the PDF is
                ready, then <span className="font-medium text-foreground">View receipt</span>. STK rows use the code in
                Reference.
              </p>
            </div>

            <div className="mt-2 overflow-x-auto scrollbar-thin">
              {paymentsLoading ? (
                <p className="py-6 text-sm text-muted-foreground">Loading payments…</p>
              ) : payments.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <table className="fv-table-scroll min-w-[960px] text-left text-sm">
                  <thead className="border-b border-border/45 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-left dark:bg-[hsl(145_9%_15%)]">
                        Paid At
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-left dark:bg-[hsl(145_9%_15%)]">
                        Type
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-left dark:bg-[hsl(145_9%_15%)]">
                        Plan
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-left dark:bg-[hsl(145_9%_15%)]">
                        Cycle
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-right dark:bg-[hsl(145_9%_15%)]">
                        Amount
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-left dark:bg-[hsl(145_9%_15%)]">
                        Status
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-left font-mono text-[10px] normal-case dark:bg-[hsl(145_9%_15%)]">
                        Reference
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-[hsl(82_14%_96%)] px-3 py-2.5 text-right dark:bg-[hsl(145_9%_15%)]">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p: PaymentSubmissionRow) => {
                      const meta = tenantPaymentStatusMeta(p);
                      const kind = paymentRowKind(p);
                      const c = parseBillingCycle(p.billing_cycle ?? p.billing_mode);
                      const receiptRow =
                        receiptByPaymentId.get(billingPaymentLookupKey(p.id)) ?? null;
                      const approved = String(p.status).toLowerCase() === 'approved';
                      const issuingThis = receiptIssuingPaymentId === p.id;
                      const displayIso = paymentHistoryDisplayIso(p);
                      const refCode = p.transaction_code?.trim() || '—';
                      const isStkOnlyMirror = p.ledger_source === 'mpesa_stk';
                      return (
                        <tr
                          key={`${p.ledger_source ?? 'sub'}-${p.id}`}
                          className="border-b border-border/25 transition-colors last:border-0 hover:bg-[hsl(88_18%_94%_/0.65)] dark:hover:bg-[hsl(145_10%_18%_/0.6)]"
                        >
                          <td className="whitespace-nowrap px-3 py-2 align-middle text-muted-foreground">
                            {displayIso ? format(parseISO(displayIso), 'PPp') : '—'}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            {kind === 'stk' ? (
                              <span className="inline-flex items-center rounded-md border border-violet-200/80 bg-violet-50/90 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:border-violet-800 dark:bg-violet-900/25 dark:text-violet-300">
                                STK
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-slate-200/80 bg-slate-50/90 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                                Manual
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-middle capitalize">{p.plan_id}</td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle">
                            {c ? billingCycleLabel(c) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle text-right font-medium tabular-nums">
                            {p.currency ?? 'KES'} {Number(p.amount).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <span
                              className={cn(
                                'inline-flex rounded-md px-2.5 py-0.5 text-xs font-medium capitalize',
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td
                            className="max-w-[140px] truncate px-3 py-2 align-middle font-mono text-[11px] text-muted-foreground"
                            title={refCode !== '—' ? refCode : undefined}
                          >
                            {refCode}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle text-right">
                            <div className="inline-flex justify-end">
                              {receiptRow ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 shrink-0 rounded-[8px] text-xs font-medium"
                                  onClick={() => void openReceiptForRow(receiptRow)}
                                >
                                  View receipt
                                </Button>
                              ) : approved && !isStkOnlyMirror ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={issuingThis}
                                  className="h-8 shrink-0 rounded-[8px] text-xs font-medium"
                                  onClick={() => void requestReceiptForPayment(p.id, { openAfter: true })}
                                >
                                  {issuingThis ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                                  ) : null}
                                  Get receipt
                                </Button>
                              ) : approved && isStkOnlyMirror ? (
                                <span
                                  className="inline-block py-1 text-xs text-muted-foreground"
                                  title="Receipt code in Reference"
                                >
                                  —
                                </span>
                              ) : (
                                <span
                                  className="inline-block py-1 text-xs text-muted-foreground"
                                  title="Receipts are available after payment is approved"
                                >
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Compare plans — flat columns inside one neumorphic block */}
          <section className={billingSectionSurface}>
            <div className={billingSectionHead}>
              <h2 className={billingSectionTitle}>Compare plans</h2>
              <p className={billingSectionDesc}>Feature overview for Basic vs Pro.</p>
            </div>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              {SUBSCRIPTION_PLANS.filter((p) => p.value === 'basic' || p.value === 'pro').map((planOpt) => {
                const isPro = planOpt.value === 'pro';
                const planKey = planOpt.value as BillingSubmissionPlan;
                const live = getLivePrice(planKey, selectedCycle);
                const catalogMode = selectedCycle === 'seasonal' ? 'season' : selectedCycle;
                const price = live ?? planOpt.pricing[catalogMode];
                return (
                  <div
                    key={planOpt.value}
                    className={cn(
                      'relative flex flex-col rounded-[10px] border border-border/35 p-4 sm:p-5',
                      isPro
                        ? 'border-primary/28 bg-[hsl(88_22%_96%_/0.85)] dark:bg-[hsl(145_12%_17%)]'
                        : 'bg-[hsl(88_12%_97%_/0.5)] dark:bg-[hsl(145_8%_15%_/0.65)]',
                    )}
                  >
                    {isPro ? (
                      <div className="mb-3">
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-950 dark:text-amber-100">
                          <Zap className="h-3 w-3" />
                          Most popular
                        </span>
                      </div>
                    ) : null}
                    <h3 className="text-[17px] font-semibold">{planOpt.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground/90">{planOpt.description}</p>
                    <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                      {price != null ? (
                        <>
                          KES {price.toLocaleString()}
                          <span className="text-sm font-medium text-muted-foreground">
                            {selectedCycle === 'monthly' ? '/mo' : selectedCycle === 'seasonal' ? '/season' : '/yr'}
                          </span>
                        </>
                      ) : (
                        <span className="text-base font-medium text-muted-foreground">Custom</span>
                      )}
                    </p>
                    <ul className="mt-4 flex-1 space-y-2.5 border-t border-border/30 pt-4">
                      {planOpt.features.slice(0, 7).map((f) => (
                        <li key={f} className="flex gap-2 text-sm text-foreground/90">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700/90 dark:text-emerald-400/90" strokeWidth={2.5} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={isPro ? 'default' : 'outline'}
                      className={cn('mt-5 h-10 w-full px-4', isPro ? billingPrimaryBtn : billingOutlineBtn)}
                      disabled={!showPaySection}
                      onClick={() => {
                        setSelectedPlan(planOpt.value as BillingSubmissionPlan);
                        setCheckoutOpen(true);
                      }}
                    >
                      {planOpt.value === 'basic' ? 'Choose Basic' : 'Choose Pro'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      <p className={cn(BILLING_CONTENT, 'text-center text-xs text-muted-foreground')}>
        Workspace: <span className="font-medium text-foreground">{company?.name ?? companyId}</span>
      </p>
      </div>

      {!isDeveloper ? (
        <UpgradeModal
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          isTrial={isTrial}
          isExpired={isExpired}
          daysRemaining={daysRemaining}
          checkoutPlan={selectedPlan}
          checkoutCycle={selectedCycle}
          workspaceCompanyId={companyId}
        />
      ) : null}

      <Dialog
        open={!!receiptDialogRow}
        onOpenChange={(o) => {
          if (!o) {
            setReceiptDialogRow(null);
            setReceiptPdfUrl(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
            <DialogTitle className="font-mono text-base">
              {receiptDialogRow?.receipt_number ?? 'Receipt'}
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!receiptPdfUrl}
              onClick={() => {
                if (receiptPdfUrl) window.open(receiptPdfUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <Download className="h-4 w-4" />
              Open / download PDF
            </Button>
          </DialogHeader>
          <div className="h-[min(72vh,720px)] w-full bg-muted/30">
            {receiptPdfLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading PDF…
              </div>
            ) : receiptPdfUrl ? (
              <iframe title="Receipt PDF" src={receiptPdfUrl} className="h-full w-full border-0" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
