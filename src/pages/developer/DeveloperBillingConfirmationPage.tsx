import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import {
  approveSubscriptionPayment,
  fetchMpesaStkPaymentsForDeveloper,
  fetchPendingPayments,
  fetchPayments,
  rejectSubscriptionPayment,
  type MpesaStkPaymentRow,
  type PendingPayment,
} from '@/services/developerService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchSubscriptionAnalytics } from '@/services/developerService';
import { computeCompanySubscriptionState } from '@/features/billing/lib/computeCompanySubscriptionState';
import { setCompanyPaidAccess } from '@/services/developerService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { initiateMpesaStkDeveloperTest } from '@/services/mpesaStkService';
import { StkPushConfirmation } from '@/components/subscription/billing/StkPushConfirmation';
import { Input } from '@/components/ui/input';

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

export default function DeveloperBillingConfirmationPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'stk_confirmation'>('pending');
  const [stkTestPhone, setStkTestPhone] = useState('');
  const [stkTestLoading, setStkTestLoading] = useState(false);
  const [stkTestCheckoutId, setStkTestCheckoutId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isDeveloper } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!isDeveloper && tab === 'stk_confirmation') {
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
  };

  const approveMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const list = queryClient.getQueryData<PendingPayment[]>(['developer', 'pending-payments']);
      const row = list?.find((x) => x.id === paymentId);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[DevBilling] approve payment payload', { paymentId, row: row ?? null });
      }
      await approveSubscriptionPayment(paymentId);

      // Enforce canonical company access window per submitted billing cycle.
      const companyId = String(row?.company_id ?? '');
      const rawPlan = String(row?.plan_id ?? 'basic').toLowerCase();
      const plan = rawPlan.includes('pro') ? 'pro' : 'basic';
      const cycle = String(row?.billing_cycle ?? 'monthly').toLowerCase();
      const months =
        cycle === 'seasonal'
          ? 3
          : cycle === 'annual'
            ? 12
            : 1;
      if (companyId) {
        await setCompanyPaidAccess({ companyId, plan, months });
      }
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

  const approvedRows = approvedPaymentsResp?.rows ?? [];
  const approvedFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return approvedRows;
    return approvedRows.filter((p) => {
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
  }, [approvedRows, search]);

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
      const desc = (r.result_desc ?? '').toLowerCase();
      return (
        checkout.includes(term) ||
        receipt.includes(term) ||
        phone.includes(term) ||
        st.includes(term) ||
        cid.includes(term) ||
        desc.includes(term)
      );
    });
  }, [stkRows, search]);

  const paymentStats = analyticsResp?.payment_stats;
  const pendingCount = Number(paymentStats?.pending_total_count ?? filtered.length ?? 0);
  const approvedCount = Number(paymentStats?.approved_count ?? approvedFiltered.length ?? 0);
  const rejectedCount = Number(paymentStats?.rejected_count ?? rejectedFiltered.length ?? 0);
  const pendingRevenue = Number(paymentStats?.pending_revenue ?? 0);
  const approvedRevenue = Number(paymentStats?.approved_revenue ?? 0);
  const thisMonthRevenue = useMemo(() => {
    const rows = thisMonthApprovedResp?.rows ?? [];
    return rows.reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
  }, [thisMonthApprovedResp]);

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

      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Pending confirmations</div>
            <div className="mt-1 text-lg font-semibold">{pendingCount}</div>
          </div>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Confirmed payments</div>
            <div className="mt-1 text-lg font-semibold">{approvedCount}</div>
          </div>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Rejected payments</div>
            <div className="mt-1 text-lg font-semibold">{rejectedCount}</div>
          </div>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Pending revenue</div>
            <div className="mt-1 text-lg font-semibold">KES {pendingRevenue.toLocaleString()}</div>
          </div>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">Confirmed revenue</div>
            <div className="mt-1 text-lg font-semibold">KES {approvedRevenue.toLocaleString()}</div>
          </div>
          <div className="fv-card py-3">
            <div className="text-xs text-muted-foreground">This month revenue</div>
            <div className="mt-1 text-lg font-semibold">KES {thisMonthRevenue.toLocaleString()}</div>
          </div>
        </section>

        {isDeveloper ? (
          <section className="fv-card space-y-3 border-dashed border-primary/25 bg-primary/[0.03]">
            <div>
              <h2 className="text-sm font-semibold text-foreground">M-Pesa STK test (KES 1)</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Sends a real Daraja STK prompt for <span className="font-medium text-foreground">1 bob</span> using the
                active <code className="rounded bg-muted px-1 py-0.5 text-[11px]">MPESA_ENV</code> credentials. Use a
                sandbox test number in Daraja sandbox. Inserts a tracking row in{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">mpesa_payments</code> (not a subscription
                submission).
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <label htmlFor="dev-stk-test-phone" className="text-xs font-medium text-foreground">
                  Phone (receives prompt)
                </label>
                <Input
                  id="dev-stk-test-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07… or +254…"
                  value={stkTestPhone}
                  disabled={stkTestLoading}
                  onChange={(e) => setStkTestPhone(e.target.value)}
                  className="h-9 max-w-md"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-9 shrink-0"
                disabled={stkTestLoading || stkTestPhone.trim().length < 9}
                onClick={() => {
                  void (async () => {
                    setStkTestLoading(true);
                    try {
                      const res = await initiateMpesaStkDeveloperTest(stkTestPhone);
                      setStkTestCheckoutId(res.checkoutRequestId);
                      void queryClient.invalidateQueries({ queryKey: ['developer', 'mpesa-stk-payments'] });
                      toast({
                        title: 'STK test sent (KES 1)',
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
                {stkTestLoading ? 'Sending…' : 'Send KES 1 STK'}
              </Button>
            </div>
            {stkTestCheckoutId ? (
              <div className="pt-1">
                <StkPushConfirmation checkoutRequestId={stkTestCheckoutId} />
              </div>
            ) : null}
          </section>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-3">
          <TabsList className="flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="pending">Pending ({filtered.length})</TabsTrigger>
            <TabsTrigger value="approved">Confirmed ({approvedFiltered.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedFiltered.length})</TabsTrigger>
            {isDeveloper ? (
              <TabsTrigger value="stk_confirmation">
                STK confirmation ({stkFiltered.length})
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="pending" className="space-y-2">
            {!isLoading && !error && (!filtered || filtered.length === 0) ? (
              <div className="fv-card text-sm text-muted-foreground">
                No pending manual M-Pesa submissions. New rows in{' '}
                <code className="text-foreground/90">subscription_payments</code> (pending / pending_verification) appear here.
              </div>
            ) : (
              filtered &&
              filtered.length > 0 && (
                <div className="fv-card overflow-x-visible md:overflow-x-auto">
                  <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[920px]">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
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
                      {filtered.map((p) => {
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

          <TabsContent value="approved" className="space-y-2">
            {!loadingApproved && !approvedError && approvedFiltered.length === 0 ? (
              <div className="fv-card text-sm text-muted-foreground">No approved payments found.</div>
            ) : (
              approvedFiltered.length > 0 && (
                <div className="fv-card overflow-x-visible md:overflow-x-auto">
                  <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[980px]">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
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
                      {approvedFiltered.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
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
            {!loadingRejected && !rejectedError && rejectedFiltered.length === 0 ? (
              <div className="fv-card text-sm text-muted-foreground">No rejected payments found.</div>
            ) : (
              rejectedFiltered.length > 0 && (
                <div className="fv-card overflow-x-visible md:overflow-x-auto">
                  <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[980px]">
                    <thead className="border-b border-border/60 text-xs text-muted-foreground">
                      <tr>
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
                      {rejectedFiltered.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
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
              ) : !stkPaymentsError && stkFiltered.length === 0 ? (
                <div className="fv-card text-sm text-muted-foreground">
                  No STK push records yet. Billing checkout or the KES 1 test above will create rows here after Daraja
                  accepts the push.
                </div>
              ) : stkFiltered.length > 0 ? (
                  <div className="fv-card overflow-x-visible md:overflow-x-auto">
                    <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[960px]">
                      <thead className="border-b border-border/60 text-xs text-muted-foreground">
                        <tr>
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
                        {stkFiltered.map((r) => (
                          <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
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
                                  <div className="font-mono text-[11px] text-foreground">{r.company_id}</div>
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
        </Tabs>

        {/* Approval duration is derived from the submitted billing_cycle (monthly/seasonal/annual). */}
      </div>
    </DeveloperPageShell>
  );
}

