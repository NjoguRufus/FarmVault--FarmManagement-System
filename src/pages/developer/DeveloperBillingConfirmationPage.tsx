import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import {
  approveSubscriptionPayment,
  fetchPendingPayments,
  rejectSubscriptionPayment,
  type PendingPayment,
} from '@/services/developerService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

export default function DeveloperBillingConfirmationPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

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

  const invalidateBillingQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['developer', 'pending-payments'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
    void queryClient.invalidateQueries({ queryKey: ['developer', 'subscription-analytics'] });
  };

  const approveMutation = useMutation({
    mutationFn: (paymentId: string) => {
      const list = queryClient.getQueryData<PendingPayment[]>(['developer', 'pending-payments']);
      const row = list?.find((x) => x.id === paymentId);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[DevBilling] approve payment payload', { paymentId, row: row ?? null });
      }
      return approveSubscriptionPayment(paymentId);
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

  return (
    <DeveloperPageShell
      title="Billing Confirmation"
      description="Review and approve or reject pending subscription payments."
      isLoading={isLoading}
      isRefetching={isFetching || approveMutation.isPending || rejectMutation.isPending}
      onRefresh={() => void refetch()}
      searchPlaceholder="Search company, plan, cycle, M-Pesa details, transaction code, status…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load pending payments.'}
        </div>
      )}

      {!isLoading && !error && (!filtered || filtered.length === 0) && (
        <div className="fv-card text-sm text-muted-foreground">
          No pending manual M-Pesa submissions. New rows in{' '}
          <code className="text-foreground/90">subscription_payments</code> (pending / pending_verification) appear here.
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="fv-card overflow-x-visible md:overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[720px]">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Plan / cycle</th>
                <th className="py-2 text-left font-medium">Amount</th>
                <th className="py-2 text-left font-medium">M-Pesa</th>
                <th className="py-2 text-left font-medium">Transaction</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Submitted</th>
                <th className="py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const approving = approveMutation.isPending && approveMutation.variables === p.id;
                const rejecting = rejectMutation.isPending && rejectMutation.variables === p.id;
                return (
                  <tr key={p.id} className="border-b border-border/40 last:border-0">
                    <td className="max-md:items-start max-md:gap-2 py-2 pr-4" data-label="Company">
                      <div className="font-medium text-foreground">{p.company_name ?? 'Unknown company'}</div>
                      <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                    </td>
                    <td className="max-md:items-start py-2 pr-4 text-xs" data-label="Plan / cycle">
                      <div>{p.plan_id ?? '—'}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.billing_cycle ?? '—'} · {p.billing_mode ?? '—'}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs" data-label="Amount">
                      {p.amount != null
                        ? `${p.currency ?? 'KES'} ${Number(p.amount).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="max-md:items-start py-2 pr-4 text-xs" data-label="M-Pesa">
                      <div className="max-w-[140px] truncate md:max-w-none" title={p.mpesa_name ?? ''}>
                        {p.mpesa_name ?? '—'}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">{p.mpesa_phone ?? '—'}</div>
                    </td>
                    <td className="max-md:items-start py-2 pr-4 font-mono text-xs" data-label="Transaction">
                      {p.transaction_code ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs" data-label="Status">
                      <Badge
                        variant="outline"
                        className={cn('font-normal capitalize', paymentStatusBadgeClass(p.status))}
                      >
                        {paymentStatusLabel(p.status)}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs md:whitespace-nowrap" data-label="Submitted">
                      {p.submitted_at ?? p.created_at ?? '—'}
                    </td>
                    <td className="max-md:justify-end py-2 pr-4 text-xs" data-label="Actions">
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
      )}
    </DeveloperPageShell>
  );
}

