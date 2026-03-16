import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
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
      <div className="fv-card mb-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Status:</span>
          <div className="inline-flex rounded-full bg-muted/40 border border-border/70 p-0.5">
            {(['all', 'active', 'trialing', 'expired', 'rejected'] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`px-3 py-1 rounded-full ${
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
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Plan code:</span>
          <input
            type="text"
            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
            placeholder="pro, basic…"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          />
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div className="fv-card">
            <p className="text-xs text-muted-foreground mb-1">Total subscriptions</p>
            <p className="text-lg font-semibold">
              {Number(summary.total_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card">
            <p className="text-xs text-muted-foreground mb-1">Active</p>
            <p className="text-lg font-semibold">
              {Number(summary.active_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card">
            <p className="text-xs text-muted-foreground mb-1">Trialing</p>
            <p className="text-lg font-semibold">
              {Number(summary.trialing_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card">
            <p className="text-xs text-muted-foreground mb-1">Expired</p>
            <p className="text-lg font-semibold">
              {Number(summary.expired_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="fv-card">
            <p className="text-xs text-muted-foreground mb-1">Rejected</p>
            <p className="text-lg font-semibold">
              {Number(summary.rejected_subscriptions ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
        <div className="fv-card overflow-x-auto">
          <table className="w-full text-sm">
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
                  <td className="py-2 pr-4">
                    <div className="font-medium text-foreground">{row.company_name ?? 'Unknown company'}</div>
                    <div className="text-[11px] text-muted-foreground">{row.company_id}</div>
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {row.plan_code ?? row.plan ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {row.billing_mode ?? '—'} {row.billing_cycle ? `· ${row.billing_cycle}` : ''}
                  </td>
                  <td className="py-2 pr-4 text-xs capitalize">
                    {row.status ?? (row.is_trial ? 'trialing' : 'unknown')}
                  </td>
                  <td className="py-2 pr-4 text-xs">{row.active_until ?? row.trial_ends_at ?? '—'}</td>
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

