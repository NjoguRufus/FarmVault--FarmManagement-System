import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { DeveloperStatGrid } from '@/components/developer/DeveloperStatGrid';
import { fetchPayments, fetchDeveloperKpis } from '@/services/developerService';

export default function DeveloperFinancesPage() {
  const [status, setStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');

  const {
    data: kpis,
  } = useQuery({
    queryKey: ['developer', 'kpis'],
    queryFn: fetchDeveloperKpis,
  });

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'payments', status, search],
    queryFn: () =>
      fetchPayments({
        status,
        search: search || null,
      }),
  });

  const payments = data?.rows ?? [];

  const totalVolume = useMemo(
    () =>
      payments.reduce((sum, p) => {
        const n = Number(p.amount ?? 0);
        return Number.isFinite(n) ? sum + n : sum;
      }, 0),
    [payments],
  );

  return (
    <DeveloperPageShell
      title="Platform Finances"
      description="Subscription revenue and payment history across all companies."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => void refetch()}
      searchPlaceholder="Search by company name or ID…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      <DeveloperStatGrid cols="3" className="mb-4">
        <div className="fv-card min-w-0 p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-muted-foreground mb-1 leading-snug">Monthly revenue (Supabase)</p>
          <p className="text-base font-semibold tabular-nums sm:text-lg break-words">
            KES {Number(kpis?.monthly_revenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="fv-card min-w-0 p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Payments in view</p>
          <p className="text-base font-semibold tabular-nums sm:text-lg">{payments.length.toLocaleString()}</p>
        </div>
        <div className="fv-card col-span-2 min-w-0 p-3 sm:p-4 md:col-span-1">
          <p className="text-[11px] sm:text-xs text-muted-foreground mb-1 leading-snug">Total volume in view</p>
          <p className="text-base font-semibold tabular-nums sm:text-lg break-words">
            KES {totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </DeveloperStatGrid>

      <div className="fv-card mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground mr-2">Status:</span>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`px-2 py-1 rounded-full border ${
              status === value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load payments.'}
        </div>
      )}

      {!isLoading && !error && payments.length === 0 && (
        <div className="fv-card text-sm text-muted-foreground">
          No payments match the current filters.
        </div>
      )}

      {payments.length > 0 && (
        <div className="fv-card overflow-x-visible md:overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[640px]">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Plan</th>
                <th className="py-2 text-left font-medium">Amount</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Billing mode</th>
                <th className="py-2 text-left font-medium">Created</th>
                <th className="py-2 text-left font-medium">Approved at</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0">
                  <td className="max-md:items-start max-md:gap-2 py-2 pr-4" data-label="Company">
                    <div className="font-medium text-foreground">{p.company_name ?? 'Unknown company'}</div>
                    <div className="text-[11px] text-muted-foreground">{p.company_id}</div>
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Plan">
                    {p.plan_id ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Amount">
                    {p.amount != null ? `KES ${Number(p.amount).toLocaleString()}` : '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs capitalize" data-label="Status">
                    {p.status}
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Billing mode">
                    {p.billing_mode ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Created">
                    {p.created_at ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Approved at">
                    {p.approved_at ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DeveloperPageShell>
  );
}

