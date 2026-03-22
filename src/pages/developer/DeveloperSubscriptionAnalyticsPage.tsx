import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { DeveloperStatGrid } from '@/components/developer/DeveloperStatGrid';
import { fetchSubscriptionAnalytics } from '@/services/developerService';

type StatusFilter = 'all' | 'active' | 'trialing' | 'expired' | 'rejected';

export default function DeveloperSubscriptionAnalyticsPage() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [plan, setPlan] = useState<string>('');

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'subscription-analytics', status, plan],
    queryFn: () =>
      fetchSubscriptionAnalytics({
        dateFrom: null,
        dateTo: null,
        plan: plan || null,
        status: status === 'all' ? null : status,
      }),
  });

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const planDistribution = data?.plan_distribution ?? [];
  const statusDistribution = data?.status_distribution ?? [];
  const pay = data?.payment_stats;

  return (
    <DeveloperPageShell
      title="Subscription Analytics"
      description="Platform-wide subscription status, plan mix, and tenant breakdown."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => void refetch()}
    >
      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load subscription analytics.'}
        </div>
      )}

      {!isLoading && !error && !data && (
        <div className="fv-card text-sm text-muted-foreground">
          No subscription analytics are available yet. Ensure the `get_subscription_analytics` RPC is
          deployed.
        </div>
      )}

      {/* Filters */}
      <div className="fv-card mb-4 flex flex-col gap-3 text-xs sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <span className="shrink-0 text-muted-foreground">Status:</span>
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted/40 border border-border/70 p-0.5">
            {(['all', 'active', 'trialing', 'expired', 'rejected'] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`px-2.5 py-1.5 rounded-lg sm:rounded-full sm:px-3 ${
                  status === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setStatus(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="shrink-0 text-muted-foreground">Plan code:</span>
          <input
            type="text"
            className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs sm:h-7 sm:max-w-[200px]"
            placeholder="pro, basic…"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          />
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <DeveloperStatGrid cols="5" className="mb-4">
          <div className="fv-card min-w-0 p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Total subscriptions</p>
            <p className="text-base font-semibold tabular-nums sm:text-lg">
              {Number(summary.total_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card min-w-0 p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Active</p>
            <p className="text-base font-semibold tabular-nums sm:text-lg">
              {Number(summary.active_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card min-w-0 p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Trialing</p>
            <p className="text-base font-semibold tabular-nums sm:text-lg">
              {Number(summary.trialing_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card min-w-0 p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Expired</p>
            <p className="text-base font-semibold tabular-nums sm:text-lg">
              {Number(summary.expired_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card col-span-2 min-w-0 p-3 sm:p-4 lg:col-span-1">
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Rejected</p>
            <p className="text-base font-semibold tabular-nums sm:text-lg">
              {Number(summary.rejected_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
        </DeveloperStatGrid>
      )}

      {/* Manual M-Pesa submissions (subscription_payments) */}
      {pay && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Manual M-Pesa payments (all workspaces)</p>
          <DeveloperStatGrid cols="4">
            <div className="fv-card min-w-0 p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Pending verification</p>
              <p className="text-base font-semibold tabular-nums sm:text-lg">
                {Number(pay.pending_verification_count ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="fv-card min-w-0 p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Pending (incl. legacy)</p>
              <p className="text-base font-semibold tabular-nums sm:text-lg">
                {Number(pay.pending_total_count ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                Legacy pending rows: {Number(pay.pending_legacy_count ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="fv-card min-w-0 p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Approved / Rejected</p>
              <p className="text-base font-semibold tabular-nums sm:text-lg">
                {Number(pay.approved_count ?? 0).toLocaleString()} /{' '}
                {Number(pay.rejected_count ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="fv-card col-span-2 min-w-0 p-3 sm:p-4 lg:col-span-1">
              <p className="text-[11px] sm:text-xs text-muted-foreground mb-1">Revenue (KES)</p>
              <p className="text-xs font-semibold leading-snug sm:text-sm">
                Pending: {Number(pay.pending_revenue ?? 0).toLocaleString()}
              </p>
              <p className="text-xs font-semibold leading-snug text-emerald-700 dark:text-emerald-400 sm:text-sm">
                Approved: {Number(pay.approved_revenue ?? 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 sm:text-xs">
                Rejected (recorded): {Number(pay.rejected_revenue ?? 0).toLocaleString()}
              </p>
            </div>
          </DeveloperStatGrid>
        </div>
      )}

      {/* Distributions */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 mb-4">
        <div className="fv-card">
          <p className="text-xs text-muted-foreground mb-2">Plan distribution</p>
          {planDistribution.length === 0 ? (
            <p className="text-xs text-muted-foreground">No subscriptions in this filter.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {planDistribution.map((p) => (
                <li key={p.plan ?? 'unknown'} className="flex items-center justify-between">
                  <span className="capitalize">{p.plan || 'unknown'}</span>
                  <span className="text-muted-foreground">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="fv-card">
          <p className="text-xs text-muted-foreground mb-2">Status distribution</p>
          {statusDistribution.length === 0 ? (
            <p className="text-xs text-muted-foreground">No subscriptions in this filter.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {statusDistribution.map((s) => (
                <li key={s.status ?? 'unknown'} className="flex items-center justify-between">
                  <span className="capitalize">{s.status || 'unknown'}</span>
                  <span className="text-muted-foreground">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Subscriptions table */}
      {rows.length > 0 ? (
        <div className="fv-card overflow-x-visible md:overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[560px]">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Plan</th>
                <th className="py-2 text-left font-medium">Billing</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Active until</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0">
                  <td className="max-md:items-start max-md:gap-2 py-2 pr-4" data-label="Company">
                    <div className="font-medium text-foreground">{row.company_name ?? 'Unknown company'}</div>
                    <div className="text-[11px] text-muted-foreground">{row.company_id}</div>
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Plan">
                    {row.plan_code ?? row.plan ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Billing">
                    {row.billing_mode ?? '—'} {row.billing_cycle ? `· ${row.billing_cycle}` : ''}
                  </td>
                  <td className="py-2 pr-4 text-xs capitalize" data-label="Status">
                    {row.status ?? (row.is_trial ? 'trialing' : 'unknown')}
                  </td>
                  <td className="py-2 pr-4 text-xs" data-label="Active until">
                    {row.active_until ?? row.trial_ends_at ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isLoading &&
        !error && (
          <div className="fv-card text-sm text-muted-foreground">
            No subscriptions match the current filters.
          </div>
        )
      )}
    </DeveloperPageShell>
  );
}

