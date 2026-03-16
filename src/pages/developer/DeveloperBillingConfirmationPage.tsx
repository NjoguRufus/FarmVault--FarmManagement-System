import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import {
  approveSubscriptionPayment,
  fetchPendingPayments,
  rejectSubscriptionPayment,
} from '@/services/developerService';
import { Button } from '@/components/ui/button';

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

  const approveMutation = useMutation({
    mutationFn: approveSubscriptionPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['developer', 'pending-payments'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectSubscriptionPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['developer', 'pending-payments'] });
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!payments || !term) return payments ?? [];
    return payments.filter((p) => {
      const company = (p.company_name ?? '').toLowerCase();
      const plan = (p.plan_id ?? '').toLowerCase();
      const mode = (p.billing_mode ?? '').toLowerCase();
      return (
        company.includes(term) ||
        plan.includes(term) ||
        mode.includes(term) ||
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
      searchPlaceholder="Search by company, plan, billing mode, or company ID…"
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
          No pending payments right now. New subscription payments will appear here for manual review.
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="fv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Plan</th>
                <th className="py-2 text-left font-medium">Amount</th>
                <th className="py-2 text-left font-medium">Billing mode</th>
                <th className="py-2 text-left font-medium">Created</th>
                <th className="py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const approving = approveMutation.isPending && approveMutation.variables === p.id;
                const rejecting = rejectMutation.isPending && rejectMutation.variables === p.id;
                return (
                  <tr key={p.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-foreground">{p.company_name ?? 'Unknown company'}</div>
                      <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                    </td>
                    <td className="py-2 pr-4 text-xs">{p.plan_id ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs">
                      {p.amount != null ? `KES ${Number(p.amount).toLocaleString()}` : '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs">{p.billing_mode ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs">{p.created_at ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs">
                      <div className="flex gap-2">
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

