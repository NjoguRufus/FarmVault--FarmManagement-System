import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import {
  approveSubscriptionPayment,
  fetchDeveloperCompanies,
  fetchMpesaStkPaymentsForDeveloper,
  fetchPendingPayments,
  fetchPayments,
  rejectSubscriptionPayment,
  type MpesaStkPaymentRow,
  type PaymentRow,
  type PendingPayment,
} from '@/services/developerService';
import {
  isManualApprovedSubscriptionRow,
  mpesaRowIsSdkSuccess,
  sumAmounts,
} from '@/features/developer/subscriptionPaymentSource';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchSubscriptionAnalytics } from '@/services/developerService';
import { computeCompanySubscriptionState } from '@/features/billing/lib/computeCompanySubscriptionState';
import { useAuth as useClerkAuth } from '@clerk/react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CLERK_JWT_TEMPLATE_SUPABASE } from '@/lib/supabase';
import { sendDeveloperStkTest } from '@/services/mpesaStkService';
import { StkPushConfirmation } from '@/components/subscription/billing/StkPushConfirmation';
import { DeveloperBillingPricingControl } from '@/features/developer/billing/DeveloperBillingPricingControl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BillingReceiptsManager } from '@/components/subscription/billing/BillingReceiptsManager';

function paymentStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending_verification' || s === 'pending') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  }
  if (s === 'approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  if (s === 'rejected') return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  return 'border-border bg-muted text-muted-foreground';
}

function paymentStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending_verification') return 'Pending verification';
  if (s === 'pending') return 'Pending';
  return status.replace(/_/g, ' ');
}

function stkPushStatusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'PENDING') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  }
  if (s === 'SUCCESS') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  }
  if (s === 'FAILED') {
    return 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200';
  }
  return 'border-border bg-muted text-muted-foreground';
}

function formatCheckoutIdDisplay(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 20 ? `${id.slice(0, 14)}…${id.slice(-6)}` : id;
}

function PaymentTypeBadge({ source }: { source: 'manual' | 'sdk' }) {
  if (source === 'sdk') {
    return (
      <Badge variant="success" className="font-normal">
        SDK
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      Manual
    </Badge>
  );
}

type PaymentTypeFilter = 'all' | 'manual' | 'sdk';

export default function DeveloperBillingConfirmationPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<
    'pending' | 'manual_confirmed' | 'rejected' | 'stk_confirmation' | 'receipts'
  >('pending');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<PaymentTypeFilter>('all');
  const [confirmedPaymentsModalOpen, setConfirmedPaymentsModalOpen] = useState(false);
  const [confirmedRevenueModalOpen, setConfirmedRevenueModalOpen] = useState(false);
  const [confirmedModalFilter, setConfirmedModalFilter] = useState<PaymentTypeFilter>('all');
  const [revenueModalFilter, setRevenueModalFilter] = useState<PaymentTypeFilter>('all');
  const [stkTestPhone, setStkTestPhone] = useState('');
  const [stkTestAmount, setStkTestAmount] = useState(1);
  const [stkTestLoading, setStkTestLoading] = useState(false);
  const [stkTestCheckoutId, setStkTestCheckoutId] = useState<string | null>(null);
  const [pricingControlDialogOpen, setPricingControlDialogOpen] = useState(false);
  const [stkTestDialogOpen, setStkTestDialogOpen] = useState(false);
  const handleDevStkPaymentSuccess = useCallback(() => {
    window.setTimeout(() => setStkTestCheckoutId(null), 800);
  }, []);
  const queryClient = useQueryClient();
  const { isDeveloper } = useAuth();
  const { getToken } = useClerkAuth();
  const { toast } = useToast();
  const clerkSupabaseToken = useCallback(
    () => getToken({ template: CLERK_JWT_TEMPLATE_SUPABASE }),
    [getToken],
  );

  useEffect(() => {
    if (!isDeveloper && (tab === 'stk_confirmation' || tab === 'receipts')) {
      setTab('pending');
    }
  }, [isDeveloper, tab]);

  const {
    data: payments,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'pending-payments'],
    queryFn: fetchPendingPayments,
  });

  const {
    data: approvedPaymentsResp,
    isLoading: loadingApproved,
    isFetching: fetchingApproved,
    error: approvedError,
    refetch: refetchApproved,
  } = useQuery({
    queryKey: ['developer', 'approved-payments'],
    queryFn: () => fetchPayments({ status: 'approved', limit: 200, offset: 0 }),
  });

  const {
    data: rejectedPaymentsResp,
    isLoading: loadingRejected,
    isFetching: fetchingRejected,
    error: rejectedError,
    refetch: refetchRejected,
  } = useQuery({
    queryKey: ['developer', 'rejected-payments'],
    queryFn: () => fetchPayments({ status: 'rejected', limit: 200, offset: 0 }),
  });

  const {
    data: stkPayments,
    isLoading: loadingStkPayments,
    isFetching: fetchingStkPayments,
    error: stkPaymentsError,
    refetch: refetchStkPayments,
  } = useQuery({
    queryKey: ['developer', 'mpesa-stk-payments'],
    queryFn: fetchMpesaStkPaymentsForDeveloper,
    enabled: isDeveloper === true,
    staleTime: 15_000,
  });

  const { data: developerCompaniesResp } = useQuery({
    queryKey: ['developer', 'companies', 'billing-stk-names'],
    queryFn: () => fetchDeveloperCompanies({ limit: 500, offset: 0 }),
    enabled: isDeveloper === true,
    staleTime: 60_000,
  });

  const companyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of developerCompaniesResp?.items ?? []) {
      const id = String(c.company_id ?? c.id ?? '');
      if (!id) continue;
      const name = String(c.company_name ?? c.name ?? '').trim();
      if (name) m.set(id, name);
    }
    return m;
  }, [developerCompaniesResp]);

  const { data: analyticsResp } = useQuery({
    queryKey: ['developer', 'subscription-analytics'],
    queryFn: () => fetchSubscriptionAnalytics(),
  });

  const monthStartIso = useMemo(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    return start.toISOString();
  }, []);

  const { data: thisMonthApprovedResp } = useQuery({
    queryKey: ['developer', 'approved-payments-this-month', monthStartIso],
    queryFn: () =>
      fetchPayments({
        status: 'approved',
        dateFrom: monthStartIso,
        limit: 5000,
        offset: 0,
      }),
  });

  const invalidateBillingQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['developer', 'pending-payments'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'approved-payments'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'rejected-payments'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'subscription-analytics'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'approved-payments-this-month'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'mpesa-stk-payments'] });
    void queryClient.invalidateQueries({ queryKey: ['billing-receipts'] });
    void queryClient.invalidateQueries({ queryKey: ['subscription-gate'] });
    void queryClient.invalidateQueries({ queryKey: ['subscription-payments-supabase'] });
    void queryClient.invalidateQueries({ queryKey: ['company-subscription-row'] });
    void queryClient.invalidateQueries({ queryKey: ['company-billing'] });
  };

  const approveMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const list = queryClient.getQueryData<PendingPayment[]>(['developer', 'pending-payments']);
      const row = list?.find((x) => x.id === paymentId);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[DevBilling] approve payment payload', { paymentId, row: row ?? null });
      }
      await approveSubscriptionPayment(paymentId, row ?? undefined, clerkSupabaseToken);
      // Paid window + trial end are applied in approve_subscription_payment (DB). Avoid
      // set_company_paid_access here — it forced billing_cycle = monthly and overwrote the approve RPC.
    },
    onMutate: async (paymentId: string) => {
      await queryClient.cancelQueries({ queryKey: ['developer', 'pending-payments'] });
      await queryClient.cancelQueries({ queryKey: ['developer', 'approved-payments'] });

      const prevPending = queryClient.getQueryData<PendingPayment[]>(['developer', 'pending-payments']) ?? [];
      const prevApproved = queryClient.getQueryData<{ rows: any[]; total: number }>(['developer', 'approved-payments']);

      const row = prevPending.find((x) => x.id === paymentId) ?? null;
      queryClient.setQueryData<PendingPayment[]>(
        ['developer', 'pending-payments'],
        prevPending.filter((x) => x.id !== paymentId),
      );

      if (row) {
        const nowIso = new Date().toISOString();
        const approvedRow = {
          id: row.id,
          company_id: row.company_id,
          company_name: row.company_name,
          plan_id: row.plan_id,
          amount: row.amount,
          currency: row.currency,
          status: 'approved',
          billing_mode: row.billing_mode,
          payment_method: 'mpesa_manual',
          reference: row.transaction_code,
          created_at: row.created_at,
          approved_at: nowIso,
          approved_by: '—',
          reviewed_by: '—',
        };

        const existingRows = (prevApproved?.rows ?? []) as any[];
        queryClient.setQueryData(['developer', 'approved-payments'], {
          rows: [approvedRow, ...existingRows],
          total: Number(prevApproved?.total ?? existingRows.length) + 1,
        });
      }

      return { prevPending, prevApproved };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevPending) queryClient.setQueryData(['developer', 'pending-payments'], ctx.prevPending);
      if (ctx?.prevApproved) queryClient.setQueryData(['developer', 'approved-payments'], ctx.prevApproved);
    },
    onSuccess: invalidateBillingQueries,
  });

  const rejectMutation = useMutation({
    mutationFn: (paymentId: string) => {
      const list = queryClient.getQueryData<PendingPayment[]>(['developer', 'pending-payments']);
      const row = list?.find((x) => x.id === paymentId);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[DevBilling] reject payment payload', { paymentId, row: row ?? null });
      }
      return rejectSubscriptionPayment(paymentId);
    },
    onMutate: async (paymentId: string) => {
      await queryClient.cancelQueries({ queryKey: ['developer', 'pending-payments'] });
      await queryClient.cancelQueries({ queryKey: ['developer', 'rejected-payments'] });

      const prevPending = queryClient.getQueryData<PendingPayment[]>(['developer', 'pending-payments']) ?? [];
      const prevRejected = queryClient.getQueryData<{ rows: any[]; total: number }>(['developer', 'rejected-payments']);

      const row = prevPending.find((x) => x.id === paymentId) ?? null;
      queryClient.setQueryData<PendingPayment[]>(
        ['developer', 'pending-payments'],
        prevPending.filter((x) => x.id !== paymentId),
      );

      if (row) {
        const nowIso = new Date().toISOString();
        const rejectedRow = {
          id: row.id,
          company_id: row.company_id,
          company_name: row.company_name,
          plan_id: row.plan_id,
          amount: row.amount,
          currency: row.currency,
          status: 'rejected',
          billing_mode: row.billing_mode,
          payment_method: 'mpesa_manual',
          reference: row.transaction_code,
          created_at: row.created_at,
          approved_at: null,
          approved_by: null,
          reviewed_by: '—',
        };

        const existingRows = (prevRejected?.rows ?? []) as any[];
        queryClient.setQueryData(['developer', 'rejected-payments'], {
          rows: [rejectedRow, ...existingRows],
          total: Number(prevRejected?.total ?? existingRows.length) + 1,
        });
      }

      return { prevPending, prevRejected };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevPending) queryClient.setQueryData(['developer', 'pending-payments'], ctx.prevPending);
      if (ctx?.prevRejected) queryClient.setQueryData(['developer', 'rejected-payments'], ctx.prevRejected);
    },
    onSuccess: invalidateBillingQueries,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!payments || !term) return payments ?? [];
    return payments.filter((p) => {
      const company = (p.company_name ?? '').toLowerCase();
      const plan = (p.plan_id ?? '').toLowerCase();
      const mode = (p.billing_mode ?? '').toLowerCase();
      const cycle = (p.billing_cycle ?? '').toLowerCase();
      const mpesaName = (p.mpesa_name ?? '').toLowerCase();
      const mpesaPhone = (p.mpesa_phone ?? '').toLowerCase();
      const tx = (p.transaction_code ?? '').toLowerCase();
      const st = (p.status ?? '').toLowerCase();
      return (
        company.includes(term) ||
        plan.includes(term) ||
        mode.includes(term) ||
        cycle.includes(term) ||
        mpesaName.includes(term) ||
        mpesaPhone.includes(term) ||
        tx.includes(term) ||
        st.includes(term) ||
        String(p.company_id ?? '').toLowerCase().includes(term)
      );
    });
  }, [payments, search]);

  const approvedRows = (approvedPaymentsResp?.rows ?? []) as PaymentRow[];
  const manualApprovedRows = useMemo(
    () => approvedRows.filter((p) => isManualApprovedSubscriptionRow(p)),
    [approvedRows],
  );
  const manualApprovedFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return manualApprovedRows;
    return manualApprovedRows.filter((p) => {
      const company = (p.company_name ?? '').toLowerCase();
      const plan = (p.plan_id ?? '').toLowerCase();
      const mode = (p.billing_mode ?? '').toLowerCase();
      const st = (p.status ?? '').toLowerCase();
      const id = String(p.company_id ?? '').toLowerCase();
      const reviewer = (p.reviewed_by ?? '').toLowerCase();
      return (
        company.includes(term) ||
        plan.includes(term) ||
        mode.includes(term) ||
        st.includes(term) ||
        id.includes(term) ||
        reviewer.includes(term)
      );
    });
  }, [manualApprovedRows, search]);

  const rejectedRows = rejectedPaymentsResp?.rows ?? [];
  const rejectedFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rejectedRows;
    return rejectedRows.filter((p: any) => {
      const company = (p.company_name ?? '').toLowerCase();
      const plan = (p.plan_id ?? '').toLowerCase();
      const mode = (p.billing_mode ?? '').toLowerCase();
      const st = (p.status ?? '').toLowerCase();
      const id = String(p.company_id ?? '').toLowerCase();
      const reviewer = (p.reviewed_by ?? '').toLowerCase();
      const ref = (p.reference ?? '').toLowerCase();
      return (
        company.includes(term) ||
        plan.includes(term) ||
        mode.includes(term) ||
        st.includes(term) ||
        id.includes(term) ||
        reviewer.includes(term) ||
        ref.includes(term)
      );
    });
  }, [rejectedRows, search]);

  const stkRows = stkPayments ?? [];
  const stkFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return stkRows;
    return stkRows.filter((r: MpesaStkPaymentRow) => {
      const checkout = (r.checkout_request_id ?? '').toLowerCase();
      const receipt = (r.mpesa_receipt ?? '').toLowerCase();
      const phone = (r.phone ?? '').toLowerCase();
      const st = (r.status ?? '').toLowerCase();
      const cid = String(r.company_id ?? '').toLowerCase();
      const cname = r.company_id
        ? (companyNameById.get(r.company_id) ?? '').toLowerCase()
        : '';
      const desc = (r.result_desc ?? '').toLowerCase();
      return (
        checkout.includes(term) ||
        receipt.includes(term) ||
        phone.includes(term) ||
        st.includes(term) ||
        cid.includes(term) ||
        cname.includes(term) ||
        desc.includes(term)
      );
    });
  }, [stkRows, search, companyNameById]);

  const sdkSuccessRows = useMemo(() => stkRows.filter((r) => mpesaRowIsSdkSuccess(r)), [stkRows]);
  const confirmedPaymentsTotal = manualApprovedRows.length + sdkSuccessRows.length;
  const confirmedRevenueTotal = sumAmounts(manualApprovedRows) + sumAmounts(sdkSuccessRows);
  const manualRevenueTotal = sumAmounts(manualApprovedRows);
  const sdkRevenueTotal = sumAmounts(sdkSuccessRows);

  const pendingTabRows = useMemo(() => {
    if (paymentTypeFilter === 'sdk') return [];
    return filtered;
  }, [filtered, paymentTypeFilter]);

  const manualTabRows = useMemo(() => {
    if (paymentTypeFilter === 'sdk') return [];
    return manualApprovedFiltered;
  }, [manualApprovedFiltered, paymentTypeFilter]);

  const rejectedTabRows = useMemo(() => {
    if (paymentTypeFilter === 'sdk') return [];
    return rejectedFiltered;
  }, [rejectedFiltered, paymentTypeFilter]);

  const sdkTabRows = useMemo(() => {
    if (paymentTypeFilter === 'manual') return [];
    return stkFiltered;
  }, [stkFiltered, paymentTypeFilter]);

  const paymentStats = analyticsResp?.payment_stats;
  const pendingCount = Number(paymentStats?.pending_total_count ?? pendingTabRows.length ?? 0);
  const confirmedPaymentsStat = confirmedPaymentsTotal;
  const rejectedCount = Number(paymentStats?.rejected_count ?? rejectedTabRows.length ?? 0);
  const pendingRevenue = Number(paymentStats?.pending_revenue ?? 0);
  const confirmedRevenueStat = confirmedRevenueTotal;
  const thisMonthRevenue = useMemo(() => {
    const start = new Date(monthStartIso).getTime();
    const manualRows = ((thisMonthApprovedResp?.rows ?? []) as PaymentRow[]).filter((r) =>
      isManualApprovedSubscriptionRow(r),
    );
    const manualSum = sumAmounts(manualRows);
    const sdkSum = sdkSuccessRows.reduce((s, r) => {
      const t = r.paid_at ?? r.created_at;
      if (!t) return s;
      const ts = new Date(t).getTime();
      if (Number.isNaN(ts) || ts < start) return s;
      return s + Number(r.amount ?? 0);
    }, 0);
    return manualSum + sdkSum;
  }, [thisMonthApprovedResp, sdkSuccessRows, monthStartIso]);

  const confirmedPaymentsModalRows = useMemo(() => {
    if (confirmedModalFilter === 'manual') {
      return manualApprovedRows.map((r) => ({ source: 'manual' as const, sub: r, mpesa: null as MpesaStkPaymentRow | null }));
    }
    if (confirmedModalFilter === 'sdk') {
      return sdkSuccessRows.map((r) => ({ source: 'sdk' as const, sub: null as PaymentRow | null, mpesa: r }));
    }
    return [
      ...manualApprovedRows.map((r) => ({ source: 'manual' as const, sub: r, mpesa: null as MpesaStkPaymentRow | null })),
      ...sdkSuccessRows.map((r) => ({ source: 'sdk' as const, sub: null as PaymentRow | null, mpesa: r })),
    ];
  }, [confirmedModalFilter, manualApprovedRows, sdkSuccessRows]);

  const confirmedRevenueModalRows = useMemo(() => {
    if (revenueModalFilter === 'manual') {
      return manualApprovedRows.map((r) => ({ source: 'manual' as const, sub: r, mpesa: null as MpesaStkPaymentRow | null }));
    }
    if (revenueModalFilter === 'sdk') {
      return sdkSuccessRows.map((r) => ({ source: 'sdk' as const, sub: null as PaymentRow | null, mpesa: r }));
    }
    return [
      ...manualApprovedRows.map((r) => ({ source: 'manual' as const, sub: r, mpesa: null as MpesaStkPaymentRow | null })),
      ...sdkSuccessRows.map((r) => ({ source: 'sdk' as const, sub: null as PaymentRow | null, mpesa: r })),
    ];
  }, [revenueModalFilter, manualApprovedRows, sdkSuccessRows]);

  return (
    <DeveloperPageShell
      title="Billing Confirmation"
      description="Review and approve or reject submitted payments. Only approved payments create true paid subscriptions."
      isLoading={isLoading}
      isRefetching={
        isFetching ||
        fetchingApproved ||
        fetchingRejected ||
        fetchingStkPayments ||
        approveMutation.isPending ||
        rejectMutation.isPending ||
        stkTestLoading
      }
      onRefresh={() => {
        void refetch();
        void refetchApproved();
        void refetchRejected();
        void refetchStkPayments();
      }}
      searchPlaceholder="Search company, plan, cycle, M-Pesa details, transaction code, status…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load pending payments.'}
        </div>
      )}

      {approvedError && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(approvedError as Error).message || 'Failed to load approved payments.'}
        </div>
      )}

      {rejectedError && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(rejectedError as Error).message || 'Failed to load rejected payments.'}
        </div>
      )}

      {stkPaymentsError && isDeveloper && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(stkPaymentsError as Error).message || 'Failed to load STK push payments.'}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Payment type</span>
        {(['all', 'manual', 'sdk'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={paymentTypeFilter === k ? 'secondary' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setPaymentTypeFilter(k)}
          >
            {k === 'all' ? 'All' : k === 'manual' ? 'Manual' : 'SDK'}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Pending confirmations</div>
            <div className="mt-1 text-lg font-semibold">{pendingCount}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">Manual pipeline only</p>
          </div>
          <button
            type="button"
            className="fv-card py-3 text-left transition-colors hover:bg-muted/40"
            onClick={() => {
              setConfirmedModalFilter('all');
              setConfirmedPaymentsModalOpen(true);
            }}
          >
            <div className="text-xs text-muted-foreground">Confirmed payments</div>
            <div className="mt-1 text-lg font-semibold">{confirmedPaymentsStat}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">Manual + SDK · Click to drill down</p>
          </button>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Rejected payments</div>
            <div className="mt-1 text-lg font-semibold">{rejectedCount}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">Manual only</p>
          </div>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Pending revenue</div>
            <div className="mt-1 text-lg font-semibold">KES {pendingRevenue.toLocaleString()}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">Manual pending only</p>
          </div>
          <button
            type="button"
            className="fv-card py-3 text-left transition-colors hover:bg-muted/40"
            onClick={() => {
              setRevenueModalFilter('all');
              setConfirmedRevenueModalOpen(true);
            }}
          >
            <div className="text-xs text-muted-foreground">Confirmed revenue</div>
            <div className="mt-1 text-lg font-semibold">KES {confirmedRevenueStat.toLocaleString()}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">Manual + SDK · Click to drill down</p>
          </button>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">This month revenue</div>
            <div className="mt-1 text-lg font-semibold">KES {thisMonthRevenue.toLocaleString()}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">Manual + SDK</p>
          </div>
        </section>

        {isDeveloper ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setPricingControlDialogOpen(true)}>
              Pricing control
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setStkTestDialogOpen(true)}>
              M-Pesa STK test
            </Button>
          </div>
        ) : null}

        <Dialog open={pricingControlDialogOpen} onOpenChange={setPricingControlDialogOpen}>
          <DialogContent className="max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Pricing control</DialogTitle>
              <DialogDescription>
                Basic and Pro checkout amounts (KES). Changes save as you edit (debounced). Company billing modals update
                live via Realtime — no page reload.
              </DialogDescription>
            </DialogHeader>
            <DeveloperBillingPricingControl
              getAccessToken={clerkSupabaseToken}
              enabled={isDeveloper === true && pricingControlDialogOpen}
              embeddedInDialog
            />
          </DialogContent>
        </Dialog>

        <Dialog open={stkTestDialogOpen} onOpenChange={setStkTestDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>M-Pesa STK test</DialogTitle>
              <DialogDescription>
                Sends a real Daraja STK prompt for the amount you set (KES) using the active{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">MPESA_ENV</code> credentials. Use a sandbox test
                number in Daraja sandbox. Inserts a row in{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">mpesa_payments</code> (not a subscription
                submission).
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="dev-stk-test-phone" className="text-xs font-medium text-foreground">
                  Phone (receives prompt)
                </Label>
                <Input
                  id="dev-stk-test-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07… or +254…"
                  value={stkTestPhone}
                  disabled={stkTestLoading}
                  onChange={(e) => setStkTestPhone(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="w-full min-w-[8rem] max-w-[10rem] space-y-1.5 sm:w-auto">
                <Label htmlFor="dev-stk-test-amount" className="text-xs font-medium text-foreground">
                  Test amount (KES)
                </Label>
                <Input
                  id="dev-stk-test-amount"
                  type="number"
                  min={1}
                  step={1}
                  value={stkTestAmount}
                  disabled={stkTestLoading}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setStkTestAmount(Number.isFinite(n) && n >= 1 ? Math.round(n) : 1);
                  }}
                  className="h-9"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-9 shrink-0"
                disabled={stkTestLoading || stkTestPhone.trim().length < 9 || stkTestAmount < 1}
                onClick={() => {
                  void (async () => {
                    setStkTestLoading(true);
                    try {
                      const res = await sendDeveloperStkTest(
                        { phone: stkTestPhone, amount: stkTestAmount },
                        { getAccessToken: clerkSupabaseToken },
                      );
                      setStkTestCheckoutId(res.checkoutRequestId);
                      void queryClient.invalidateQueries({ queryKey: ['developer', 'mpesa-stk-payments'] });
                      toast({
                        title: `STK test sent (KES ${stkTestAmount.toLocaleString()})`,
                        description: res.customerMessage ?? 'Check the handset for the M-Pesa prompt.',
                      });
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'STK test failed.';
                      toast({ variant: 'destructive', title: 'STK test failed', description: msg });
                    } finally {
                      setStkTestLoading(false);
                    }
                  })();
                }}
              >
                {stkTestLoading ? 'Sending…' : `Send KES ${stkTestAmount.toLocaleString()} STK`}
              </Button>
            </div>
            {stkTestCheckoutId ? (
              <div className="border-t border-border/50 pt-4">
                <StkPushConfirmation
                  checkoutRequestId={stkTestCheckoutId}
                  confirmationContext="developer"
                  onPaymentSuccess={handleDevStkPaymentSuccess}
                />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-3">
          <TabsList className="flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="pending">Pending ({pendingTabRows.length})</TabsTrigger>
            <TabsTrigger value="manual_confirmed">Manual Confirmed ({manualTabRows.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedTabRows.length})</TabsTrigger>
            {isDeveloper ? (
              <TabsTrigger value="stk_confirmation">STK Confirmed ({sdkTabRows.length})</TabsTrigger>
            ) : null}
            {isDeveloper ? <TabsTrigger value="receipts">Receipts</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="pending" className="space-y-2">
            {!isLoading && !error && (!pendingTabRows || pendingTabRows.length === 0) ? (
              <div className="fv-card text-sm text-muted-foreground">
                No pending manual M-Pesa submissions. New rows in{' '}
                <code className="text-foreground/90">subscription_payments</code> (pending / pending_verification) appear here.
              </div>
            ) : (
              pendingTabRows &&
              pendingTabRows.length > 0 && (
                <div className="fv-card overflow-x-visible md:overflow-x-auto">
                  <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[920px]">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 text-left font-medium">Type</th>
                        <th className="py-2 text-left font-medium">Company</th>
                        <th className="py-2 text-left font-medium">Plan / cycle</th>
                        <th className="py-2 text-left font-medium">Amount</th>
                        <th className="py-2 text-left font-medium">Payment method</th>
                        <th className="py-2 text-left font-medium">Reference</th>
                        <th className="py-2 text-left font-medium">After approval</th>
                        <th className="py-2 text-left font-medium">Status</th>
                        <th className="py-2 text-left font-medium">Submitted</th>
                        <th className="py-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTabRows.map((p) => {
                        const approving = approveMutation.isPending && approveMutation.variables === p.id;
                        const rejecting = rejectMutation.isPending && rejectMutation.variables === p.id;
                        const predicted = computeCompanySubscriptionState({
                          companyStatus: 'active',
                          planCode: p.plan_id ?? null,
                          subscriptionStatus: 'active',
                          isTrial: false,
                          trialStartsAt: null,
                          trialEndsAt: null,
                          activeUntil: null,
                          latestPaymentStatus: 'approved',
                        });
                        return (
                          <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                            <td className="py-3 pr-4" data-label="Type">
                              <PaymentTypeBadge source="manual" />
                            </td>
                            <td className="max-md:items-start max-md:gap-2 py-3 pr-4" data-label="Company">
                              <div className="font-medium text-foreground">{p.company_name ?? 'Unknown company'}</div>
                              <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                            </td>
                            <td className="max-md:items-start py-3 pr-4 text-xs" data-label="Plan / cycle">
                              <div>{p.plan_id ?? '—'}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {p.billing_cycle ?? '—'} · {p.billing_mode ?? '—'}
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-xs" data-label="Amount">
                              {p.amount != null
                                ? `${p.currency ?? 'KES'} ${Number(p.amount).toLocaleString()}`
                                : '—'}
                            </td>
                            <td className="py-3 pr-4 text-xs" data-label="Payment method">
                              <div className="text-foreground">M-Pesa (manual)</div>
                              <div className="text-[11px] text-muted-foreground">
                                {p.mpesa_name ? `${p.mpesa_name}` : '—'}{p.mpesa_phone ? ` · ${p.mpesa_phone}` : ''}
                              </div>
                            </td>
                            <td className="max-md:items-start py-3 pr-4 font-mono text-xs" data-label="Reference">
                              {p.transaction_code ?? '—'}
                            </td>
                            <td className="py-3 pr-4 text-xs" data-label="After approval">
                              <div className="text-foreground">{predicted.displayLabel}</div>
                              <div className="text-[11px] text-muted-foreground">Paid subscription activates on approve</div>
                            </td>
                            <td className="py-3 pr-4 text-xs" data-label="Status">
                              <Badge
                                variant="outline"
                                className={cn('font-normal capitalize', paymentStatusBadgeClass(p.status))}
                              >
                                {paymentStatusLabel(p.status)}
                              </Badge>
                            </td>
                            <td className="py-3 pr-4 text-xs md:whitespace-nowrap" data-label="Submitted">
                              {p.submitted_at ?? p.created_at ?? '—'}
                            </td>
                            <td className="max-md:justify-end py-3 pr-4 text-xs" data-label="Actions">
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="outline"
                                  disabled={approving || rejecting}
                                  onClick={() => approveMutation.mutate(p.id)}
                                >
                                  {approving ? 'Approving…' : 'Approve'}
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={approving || rejecting}
                                  onClick={() => rejectMutation.mutate(p.id)}
                                >
                                  {rejecting ? 'Rejecting…' : 'Reject'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </TabsContent>

          <TabsContent value="manual_confirmed" className="space-y-2">
            {!loadingApproved && !approvedError && manualTabRows.length === 0 ? (
              <div className="fv-card text-sm text-muted-foreground">No manual confirmed payments found.</div>
            ) : (
              manualTabRows.length > 0 && (
                <div className="fv-card overflow-x-visible md:overflow-x-auto">
                  <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[980px]">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 text-left font-medium">Type</th>
                        <th className="py-2 text-left font-medium">Company</th>
                        <th className="py-2 text-left font-medium">Plan</th>
                        <th className="py-2 text-left font-medium">Amount</th>
                        <th className="py-2 text-left font-medium">Payment method</th>
                        <th className="py-2 text-left font-medium">Reference</th>
                        <th className="py-2 text-left font-medium">Approved by</th>
                        <th className="py-2 text-left font-medium">Approved at</th>
                        <th className="py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualTabRows.map((p: PaymentRow) => (
                        <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                          <td className="py-3 pr-4" data-label="Type">
                            <PaymentTypeBadge source="manual" />
                          </td>
                          <td className="max-md:items-start max-md:gap-2 py-3 pr-4" data-label="Company">
                            <div className="font-medium text-foreground">{p.company_name ?? 'Unknown company'}</div>
                            <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Plan">
                            {p.plan_id ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Amount">
                            {p.amount != null ? `${p.currency ?? 'KES'} ${Number(p.amount).toLocaleString()}` : '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Payment method">
                            {p.payment_method ?? '—'}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs" data-label="Reference">
                            {p.reference ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Approved by">
                            {p.approved_by ?? p.reviewed_by ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Approved at">
                            {p.approved_at ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Status">
                            <Badge
                              variant="outline"
                              className={cn('font-normal capitalize', paymentStatusBadgeClass(p.status))}
                            >
                              {paymentStatusLabel(p.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-2">
            {!loadingRejected && !rejectedError && rejectedTabRows.length === 0 ? (
              <div className="fv-card text-sm text-muted-foreground">No rejected payments found.</div>
            ) : (
              rejectedTabRows.length > 0 && (
                <div className="fv-card overflow-x-visible md:overflow-x-auto">
                  <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[980px]">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 text-left font-medium">Type</th>
                        <th className="py-2 text-left font-medium">Company</th>
                        <th className="py-2 text-left font-medium">Plan</th>
                        <th className="py-2 text-left font-medium">Amount</th>
                        <th className="py-2 text-left font-medium">Payment method</th>
                        <th className="py-2 text-left font-medium">Reference</th>
                        <th className="py-2 text-left font-medium">Reviewed by</th>
                        <th className="py-2 text-left font-medium">Reviewed at</th>
                        <th className="py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedTabRows.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                          <td className="py-3 pr-4" data-label="Type">
                            <PaymentTypeBadge source="manual" />
                          </td>
                          <td className="max-md:items-start max-md:gap-2 py-3 pr-4" data-label="Company">
                            <div className="font-medium text-foreground">{p.company_name ?? 'Unknown company'}</div>
                            <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Plan">
                            {p.plan_id ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Amount">
                            {p.amount != null ? `${p.currency ?? 'KES'} ${Number(p.amount).toLocaleString()}` : '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Payment method">
                            {p.payment_method ?? '—'}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs" data-label="Reference">
                            {p.reference ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Reviewed by">
                            {p.reviewed_by ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Reviewed at">
                            {p.reviewed_at ?? p.approved_at ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs" data-label="Status">
                            <Badge
                              variant="outline"
                              className={cn('font-normal capitalize', paymentStatusBadgeClass(p.status))}
                            >
                              {paymentStatusLabel(p.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </TabsContent>

          {isDeveloper ? (
            <TabsContent value="stk_confirmation" className="space-y-2">
              <p className="text-xs text-muted-foreground">
                M-Pesa STK (Daraja) push attempts and callbacks from{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground/90">mpesa_payments</code>.
                Separate from manual till submissions above.
              </p>
              {loadingStkPayments ? (
                <div className="fv-card text-sm text-muted-foreground">Loading STK push payments…</div>
              ) : !stkPaymentsError && sdkTabRows.length === 0 ? (
                <div className="fv-card text-sm text-muted-foreground">
                  No STK push records yet. Billing checkout or the STK test above will create rows here after Daraja
                  accepts the push.
                </div>
              ) : sdkTabRows.length > 0 ? (
                  <div className="fv-card overflow-x-visible md:overflow-x-auto">
                    <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[960px]">
                      <thead className="border-b border-border/60 text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 text-left font-medium">Type</th>
                          <th className="py-2 text-left font-medium">Status</th>
                          <th className="py-2 text-left font-medium">Checkout request</th>
                          <th className="py-2 text-left font-medium">Company</th>
                          <th className="py-2 text-left font-medium">Amount</th>
                          <th className="py-2 text-left font-medium">Phone</th>
                          <th className="py-2 text-left font-medium">Receipt</th>
                          <th className="py-2 text-left font-medium">Result</th>
                          <th className="py-2 text-left font-medium">Paid at</th>
                          <th className="py-2 text-left font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sdkTabRows.map((r) => (
                          <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                            <td className="py-3 pr-4" data-label="Type">
                              <PaymentTypeBadge source="sdk" />
                            </td>
                            <td className="py-3 pr-4 text-xs" data-label="Status">
                              <Badge
                                variant="outline"
                                className={cn('font-normal uppercase', stkPushStatusBadgeClass(r.status))}
                              >
                                {r.status}
                              </Badge>
                            </td>
                            <td
                              className="max-md:items-start py-3 pr-4 font-mono text-[11px] text-muted-foreground"
                              data-label="Checkout"
                              title={r.checkout_request_id ?? undefined}
                            >
                              {formatCheckoutIdDisplay(r.checkout_request_id)}
                            </td>
                            <td className="max-md:items-start py-3 pr-4 text-xs" data-label="Company">
                              {r.company_id ? (
                                <>
                                  <div className="font-medium text-foreground">
                                    {companyNameById.get(r.company_id) ?? 'Unknown company'}
                                  </div>
                                  <div className="font-mono text-[11px] text-muted-foreground">{r.company_id}</div>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-xs" data-label="Amount">
                              {r.amount != null && r.amount !== ''
                                ? `KES ${Number(r.amount).toLocaleString()}`
                                : '—'}
                            </td>
                            <td className="py-3 pr-4 font-mono text-xs" data-label="Phone">
                              {r.phone ?? '—'}
                            </td>
                            <td className="py-3 pr-4 font-mono text-xs" data-label="Receipt">
                              {r.mpesa_receipt ?? '—'}
                            </td>
                            <td className="max-md:items-start py-3 pr-4 text-xs text-muted-foreground" data-label="Result">
                              {r.result_desc ? (
                                <span className="line-clamp-2" title={r.result_desc}>
                                  {r.result_desc}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-3 pr-4 text-xs md:whitespace-nowrap" data-label="Paid at">
                              {r.paid_at ?? '—'}
                            </td>
                            <td className="py-3 pr-4 text-xs md:whitespace-nowrap" data-label="Created">
                              {r.created_at ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              ) : null}
            </TabsContent>
          ) : null}

          {isDeveloper ? (
            <TabsContent value="receipts" className="space-y-2">
              <BillingReceiptsManager mode="developer" getAccessToken={clerkSupabaseToken} />
            </TabsContent>
          ) : null}
        </Tabs>

        <Dialog open={confirmedPaymentsModalOpen} onOpenChange={setConfirmedPaymentsModalOpen}>
          <DialogContent className="max-h-[min(90vh,720px)] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Confirmed payments</DialogTitle>
              <DialogDescription>
                Manual confirmed (subscription approvals) and successful SDK pushes ({sdkSuccessRows.length} SDK).
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              {(['all', 'manual', 'sdk'] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={confirmedModalFilter === k ? 'secondary' : 'outline'}
                  className="h-8 text-xs"
                  onClick={() => setConfirmedModalFilter(k)}
                >
                  {k === 'all' ? 'All' : k === 'manual' ? 'Manual Confirmed' : 'SDK Confirmed'}
                </Button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Plan</th>
                    <th className="px-3 py-2 text-left font-medium">Cycle</th>
                    <th className="px-3 py-2 text-left font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmedPaymentsModalRows.map((item, idx) => {
                    if (item.source === 'manual' && item.sub) {
                      const p = item.sub;
                      return (
                        <tr key={`m-${p.id}`} className="border-b border-border/40">
                          <td className="px-3 py-2">
                            <PaymentTypeBadge source="manual" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.company_name ?? '—'}</div>
                            <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                          </td>
                          <td className="px-3 py-2">{p.plan_id ?? '—'}</td>
                          <td className="px-3 py-2">{p.billing_cycle ?? p.billing_mode ?? '—'}</td>
                          <td className="px-3 py-2 tabular-nums">KES {Number(p.amount ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs">{p.approved_at ?? p.created_at ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{p.reference ?? '—'}</td>
                        </tr>
                      );
                    }
                    if (item.source === 'sdk' && item.mpesa) {
                      const r = item.mpesa;
                      const cid = r.company_id;
                      return (
                        <tr key={`s-${r.id}-${idx}`} className="border-b border-border/40">
                          <td className="px-3 py-2">
                            <PaymentTypeBadge source="sdk" />
                          </td>
                          <td className="px-3 py-2">
                            {cid ? (
                              <>
                                <div className="font-medium">
                                  {companyNameById.get(cid) ?? 'Unknown company'}
                                </div>
                                <div className="font-mono text-[11px] text-muted-foreground">{cid}</div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2">{r.plan ?? '—'}</td>
                          <td className="px-3 py-2">{r.billing_cycle ?? '—'}</td>
                          <td className="px-3 py-2 tabular-nums">KES {Number(r.amount ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs">{r.paid_at ?? r.created_at ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.mpesa_receipt ?? '—'}</td>
                        </tr>
                      );
                    }
                    return null;
                  })}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmedRevenueModalOpen} onOpenChange={setConfirmedRevenueModalOpen}>
          <DialogContent className="max-h-[min(90vh,720px)] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Confirmed revenue</DialogTitle>
              <DialogDescription>
                KES {manualRevenueTotal.toLocaleString()} manual + KES {sdkRevenueTotal.toLocaleString()} SDK = KES{' '}
                {confirmedRevenueTotal.toLocaleString()} total.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              {(['all', 'manual', 'sdk'] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={revenueModalFilter === k ? 'secondary' : 'outline'}
                  className="h-8 text-xs"
                  onClick={() => setRevenueModalFilter(k)}
                >
                  {k === 'all' ? 'All' : k === 'manual' ? 'Manual Revenue' : 'SDK Revenue'}
                </Button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Plan</th>
                    <th className="px-3 py-2 text-left font-medium">Cycle</th>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmedRevenueModalRows.map((item, idx) => {
                    if (item.source === 'manual' && item.sub) {
                      const p = item.sub;
                      return (
                        <tr key={`mr-${p.id}`} className="border-b border-border/40">
                          <td className="px-3 py-2">
                            <PaymentTypeBadge source="manual" />
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums">KES {Number(p.amount ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.company_name ?? '—'}</div>
                            <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                          </td>
                          <td className="px-3 py-2">{p.plan_id ?? '—'}</td>
                          <td className="px-3 py-2">{p.billing_cycle ?? p.billing_mode ?? '—'}</td>
                          <td className="px-3 py-2 text-xs">{p.approved_at ?? p.created_at ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{p.reference ?? '—'}</td>
                        </tr>
                      );
                    }
                    if (item.source === 'sdk' && item.mpesa) {
                      const r = item.mpesa;
                      const cid = r.company_id;
                      return (
                        <tr key={`sr-${r.id}-${idx}`} className="border-b border-border/40">
                          <td className="px-3 py-2">
                            <PaymentTypeBadge source="sdk" />
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums">KES {Number(r.amount ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            {cid ? (
                              <>
                                <div className="font-medium">
                                  {companyNameById.get(cid) ?? 'Unknown company'}
                                </div>
                                <div className="font-mono text-[11px] text-muted-foreground">{cid}</div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2">{r.plan ?? '—'}</td>
                          <td className="px-3 py-2">{r.billing_cycle ?? '—'}</td>
                          <td className="px-3 py-2 text-xs">{r.paid_at ?? r.created_at ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.mpesa_receipt ?? '—'}</td>
                        </tr>
                      );
                    }
                    return null;
                  })}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>

        {/* Approval duration is derived from the submitted billing_cycle (monthly/seasonal/annual). */}
      </div>
    </DeveloperPageShell>
  );
}

