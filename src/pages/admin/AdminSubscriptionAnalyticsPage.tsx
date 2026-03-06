import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  Clock4,
  CreditCard,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useSubscriptionAnalytics } from '@/hooks/useSubscriptionAnalytics';
import type { AnalyticsRangePreset } from '@/services/subscriptionAnalyticsService';
import { useToast } from '@/components/ui/use-toast';

function formatKES(amount: number): string {
  return `KES ${Number(amount || 0).toLocaleString()}`;
}

export default function AdminSubscriptionAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRangePreset>('30d');
  const { data, isLoading, isError, error } = useSubscriptionAnalytics(range);
  const { toast } = useToast();

  // Surface RPC errors as toasts in dev/admin view.
  if (isError && error) {
    toast({
      title: 'Subscription analytics failed',
      description: (error as Error)?.message ?? 'Check Supabase RPC "subscription_analytics".',
      variant: 'destructive',
    });
  }

  const revenue = data?.revenue;
  const active = data?.active;
  const conversion = data?.conversion;
  const funnel = data?.funnel;
  const trend = data?.revenueTrend ?? [];
  const planMix = data?.planMix ?? [];
  const modeMix = data?.modeMix ?? [];
  const topCompanies = data?.topCompanies ?? [];
  const expiringSoon = data?.expiringSoon ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      {isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Could not load analytics.</strong>{' '}
          {(error as Error)?.message ?? 'Check that you are signed in as a developer and that Supabase RPC "subscription_analytics" is deployed.'}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <LineChartIcon className="h-5 w-5 text-primary" />
            Subscription Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            High-level view of FarmVault subscription revenue, trials, and churn.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Clock4 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Date range:</span>
          <div className="inline-flex rounded-full bg-muted/40 border border-border/70 p-0.5">
            <button
              type="button"
              className={`px-3 py-1 rounded-full ${
                range === '7d'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setRange('7d')}
            >
              7 days
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-full ${
                range === '30d'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setRange('30d')}
            >
              30 days
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-full ${
                range === '90d'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setRange('90d')}
            >
              90 days
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Revenue (this month)
            </p>
            <p className="text-xl font-bold text-foreground">
              {formatKES(revenue?.totalThisMonth ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">Approved payments only</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <TrendingUp className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Revenue (last 30 days)
            </p>
            <p className="text-xl font-bold text-foreground">
              {formatKES(revenue?.totalLast30Days ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">Rolling window</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-gold-soft">
            <BarChart3 className="h-6 w-6 text-fv-olive" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Active subscriptions
            </p>
            <p className="text-xl font-bold text-foreground">
              {active?.activeSubscriptions ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">Paid + overrides</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <Users className="h-6 w-6 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Active trials
            </p>
            <p className="text-xl font-bold text-foreground">{active?.activeTrials ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">Trial not yet expired</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
            <TrendingDown className="h-6 w-6 text-red-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Conversion / churn
            </p>
            <p className="text-xl font-bold text-foreground">
              {conversion?.conversionRate ?? 0}%
            </p>
            <p className="text-[11px] text-muted-foreground">
              {conversion?.firstPayments ?? 0} new paid · {conversion?.churned ?? 0} churned
            </p>
          </div>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="fv-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Revenue trend
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Daily totals ({range})
            </span>
          </div>
          <div className="h-64">
            {isLoading ? (
              <p className="text-xs text-muted-foreground flex items-center justify-center h-full">
                Loading trend…
              </p>
            ) : trend.length === 0 ? (
              <p className="text-xs text-muted-foreground flex items-center justify-center h-full">
                No revenue data in this range yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" vertical={false} />
                  <XAxis
                    dataKey="dateKey"
                    tick={{ fontSize: 10, fill: 'hsl(150 10% 45%)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(150 10% 45%)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(0 0% 100%)',
                      border: '1px solid hsl(40 15% 85%)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-card)',
                      fontSize: 11,
                    }}
                    formatter={(value: number) => [formatKES(value), 'Revenue']}
                  />
                  <Bar dataKey="total" name="Revenue" fill="hsl(150 35% 35%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="fv-card grid grid-cols-1 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Plan mix (by revenue)
            </h3>
            <div className="h-44">
              {isLoading ? (
                <p className="text-xs text-muted-foreground flex items-center justify-center h-full">
                  Loading…
                </p>
              ) : planMix.length === 0 ? (
                <p className="text-xs text-muted-foreground flex items-center justify-center h-full">
                  No revenue yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatKES(value),
                        String(name),
                      ]}
                    />
                    <Legend />
                    <Pie
                      data={planMix}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
              <PieChartIcon className="h-4 w-4 text-fv-olive" />
              Billing mode mix
            </h3>
            <div className="h-44">
              {isLoading ? (
                <p className="text-xs text-muted-foreground flex items-center justify-center h-full">
                  Loading…
                </p>
              ) : modeMix.length === 0 ? (
                <p className="text-xs text-muted-foreground flex items-center justify-center h-full">
                  No revenue yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatKES(value),
                        String(name),
                      ]}
                    />
                    <Legend />
                    <Pie
                      data={modeMix}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Funnel row */}
      <div className="fv-card">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          Trial → paid funnel (last 30 days)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Trials started</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {funnel?.trialsStarted ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Companies that entered trial
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Active paid
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {funnel?.activePaid ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Currently on a paid plan
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Renewed</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {funnel?.renewed ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Placeholder metric (future)
            </p>
          </div>
        </div>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="fv-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Top paying companies (last 90 days)
            </h3>
          </div>
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
          ) : topCompanies.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              No payments yet. Approvals will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="fv-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topCompanies.map((row) => (
                    <tr key={row.companyId}>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm text-foreground">
                            {row.companyName}
                          </span>
                          <span className="text-[11px] text-muted-foreground break-all">
                            {row.companyId}
                          </span>
                        </div>
                      </td>
                      <td className="text-sm font-medium text-right">
                        {formatKES(row.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="fv-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock4 className="h-4 w-4 text-primary" />
              Expiring soon (next 7 days)
            </h3>
          </div>
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
          ) : expiringSoon.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              No subscriptions expiring in the next 7 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="fv-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Plan</th>
                    <th>Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringSoon.map((row) => (
                    <tr key={row.companyId}>
                      <td>
                        <span className="text-sm font-medium text-foreground">
                          {row.companyId}
                        </span>
                      </td>
                      <td className="text-sm">
                        {row.planName ?? '—'}
                      </td>
                      <td className="text-sm">
                        {row.currentPeriodEnd.toLocaleDateString()}&nbsp;
                        <span className="text-[11px] text-muted-foreground">
                          {row.currentPeriodEnd.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

