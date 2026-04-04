import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchDeveloperCompanies,
  fetchMpesaStkPaymentsForDeveloper,
  fetchPayments,
  fetchSubscriptionAnalytics,
} from '@/services/developerService';
import {
  buildLatestSdkMpesaByCompany,
  formatPaymentRelativeDay,
  isManualApprovedSubscriptionRow,
  mpesaRowIsSdkSuccess,
  resolveLatestCompanyPayment,
} from '@/features/developer/subscriptionPaymentSource';
import {
  computeCompanyStatus,
  companyStatusAccessLabel,
  companyStatusBadgeClass,
  type CompanyStatus,
} from '@/lib/subscription/companyStatus';
import { useNow } from '@/hooks/useNow';

function computeResolvedStatus(row: any, now: Date): CompanyStatus {
  const suspended =
    String(row?.subscription_status ?? '').trim().toLowerCase() === 'suspended' ||
    String(row?.company_status ?? '').trim().toLowerCase() === 'suspended';
  const plan =
    (row?.plan as string | null | undefined) ??
    (row?.plan_code as string | null | undefined) ??
    (row?.subscription?.plan as string | null | undefined) ??
    null;
  const trialEndsAt =
    (row?.trial_ends_at as string | null | undefined) ??
    (row?.subscription?.trial_end as string | null | undefined) ??
    null;
  const activeUntil =
    (row?.active_until as string | null | undefined) ??
    (row?.subscription?.period_end as string | null | undefined) ??
    null;
  return computeCompanyStatus({
    suspended,
    pending_confirmation: (row?.pending_confirmation as boolean | null | undefined) ?? null,
    plan,
    payment_confirmed: (row?.payment_confirmed as boolean | null | undefined) ?? null,
    trial_ends_at: trialEndsAt,
    active_until: activeUntil,
  }, now);
}

type StatusFilter = 'all' | 'active' | 'trialing' | 'expired' | 'rejected';
type PaymentTypeFilter = 'all' | 'manual' | 'sdk';
type RevenueWindowDays = 7 | 30 | 90;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pct(n: number): string {
  return `${Math.round(clamp01(n) * 100)}%`;
}

function fmtKes(n: number): string {
  return Number(n || 0).toLocaleString();
}

function trendLabel(deltaRatio: number): { label: string; className: string } {
  if (!Number.isFinite(deltaRatio)) return { label: '—', className: 'text-muted-foreground' };
  if (deltaRatio === 0) return { label: '0%', className: 'text-muted-foreground' };
  const sign = deltaRatio > 0 ? '+' : '';
  const pctVal = Math.round(deltaRatio * 100);
  const cls =
    deltaRatio > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-red-700 dark:text-red-400';
  return { label: `${sign}${pctVal}%`, className: cls };
}

function toUtcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function buildDailyBuckets(rows: Array<{ amount?: number | null; approved_at?: string | null; created_at?: string | null }>, days: number, now: Date) {
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  // Normalize to UTC day keys.
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    keys.push(toUtcDayKey(d));
  }

  const map = new Map<string, number>();
  for (const k of keys) map.set(k, 0);

  for (const r of rows) {
    const iso = r.approved_at ?? r.created_at ?? null;
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const k = toUtcDayKey(d);
    if (!map.has(k)) continue;
    map.set(k, (map.get(k) ?? 0) + Number(r.amount ?? 0));
  }

  const series = keys.map((k) => map.get(k) ?? 0);
  const total = series.reduce((s, n) => s + n, 0);
  return { keys, series, total };
}

function StackedRevenueMini({
  keys,
  manual,
  sdk,
}: {
  keys: string[];
  manual: number[];
  sdk: number[];
}) {
  const n = keys.length;
  if (n === 0) {
    return <div className="h-11 w-40 text-[10px] text-muted-foreground">—</div>;
  }
  const max = Math.max(
    1,
    ...keys.map((_, i) => Number(manual[i] ?? 0) + Number(sdk[i] ?? 0)),
  );
  const barH = 40;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-11 w-44 items-end gap-px">
        {keys.map((_, i) => {
          const mm = Number(manual[i] ?? 0);
          const sm = Number(sdk[i] ?? 0);
          const hSdk = (sm / max) * barH;
          const hMan = (mm / max) * barH;
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col justify-end gap-px">
              <div
                className="w-full min-h-[1px] rounded-[1px] bg-emerald-500/80"
                style={{ height: `${Math.max(hSdk, sm > 0 ? 2 : 0)}px` }}
                title={`SDK KES ${sm.toLocaleString()}`}
              />
              <div
                className="w-full min-h-[1px] rounded-[1px] bg-muted-foreground/40"
                style={{ height: `${Math.max(hMan, mm > 0 ? 2 : 0)}px` }}
                title={`Manual KES ${mm.toLocaleString()}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/40 align-middle mr-1" />
          Manual
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/80 align-middle mr-1" />
          SDK
        </span>
      </div>
    </div>
  );
}

function Sparkline({
  series,
  className,
}: {
  series: number[];
  className?: string;
}) {
  const w = 160;
  const h = 44;
  const padX = 2;
  const padY = 4;
  const max = Math.max(...series, 0);
  const min = Math.min(...series, 0);
  const span = max - min || 1;

  const points = series
    .map((v, idx) => {
      const x = padX + (idx * (w - padX * 2)) / Math.max(1, series.length - 1);
      const y = padY + ((max - v) * (h - padY * 2)) / span;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-11 w-40', className)}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-primary/70"
      />
      <polyline
        points={`0,${h - 1} ${points} ${w},${h - 1}`}
        fill="currentColor"
        className="text-primary/10"
      />
    </svg>
  );
}

function metricCardTone(tone: 'neutral' | 'success' | 'warning' | 'danger'): string {
  if (tone === 'success') return 'border-emerald-500/25 bg-emerald-500/[0.06]';
  if (tone === 'warning') return 'border-amber-500/25 bg-amber-500/[0.06]';
  if (tone === 'danger') return 'border-red-500/25 bg-red-500/[0.06]';
  return 'border-border/60 bg-card/40';
}

function miniBar(widthPct: number, tone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral'): string {
  const w = `${Math.round(clamp01(widthPct) * 100)}%`;
  const color =
    tone === 'success'
      ? 'bg-emerald-500/60'
      : tone === 'warning'
        ? 'bg-amber-500/60'
        : tone === 'danger'
          ? 'bg-red-500/60'
          : 'bg-primary/50';
  return cn('h-2 rounded-full', color, 'w-[var(--w)]', '[--w:' + w + ']');
}

function statusBadgeFromResolved(status: CompanyStatus) {
  return (
    <Badge variant="outline" className={cn('font-normal', companyStatusBadgeClass(status))}>
      {companyStatusAccessLabel(status)}
    </Badge>
  );
}

export default function DeveloperSubscriptionAnalyticsPage() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [paymentType, setPaymentType] = useState<PaymentTypeFilter>('all');
  const [plan, setPlan] = useState<string>('');
  const [revenueWindowDays, setRevenueWindowDays] = useState<RevenueWindowDays>(30);
  const now = useNow(60_000);

  const companiesQuery = useQuery({
    queryKey: ['developer', 'companies', 'subscription-counters'],
    queryFn: () => fetchDeveloperCompanies({ limit: 200, offset: 0 }),
  });

  const { data: mpesaStkRows = [] } = useQuery({
    queryKey: ['developer', 'mpesa-stk'],
    queryFn: fetchMpesaStkPaymentsForDeveloper,
    staleTime: 60_000,
  });

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

  const approvedRevenueSeriesQuery = useQuery({
    queryKey: ['developer', 'payments', 'approved', 'series', 'manual-sdk', revenueWindowDays],
    queryFn: async () => {
      const days = revenueWindowDays;
      const from = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString();
      const [resp, stkList] = await Promise.all([
        fetchPayments({ status: 'approved', dateFrom: from, limit: 2000, offset: 0 }),
        fetchMpesaStkPaymentsForDeveloper(),
      ]);
      const manualRows = (resp.rows ?? []).filter((r) => isManualApprovedSubscriptionRow(r));
      const sdkRows = (stkList ?? [])
        .filter((r) => mpesaRowIsSdkSuccess(r))
        .map((r) => ({
          amount: r.amount,
          approved_at: r.paid_at,
          created_at: r.created_at,
        }));

      const currentManual = buildDailyBuckets(manualRows, days, now);
      const currentSdk = buildDailyBuckets(sdkRows, days, now);
      const prevNow = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const previousManual = buildDailyBuckets(manualRows, days, prevNow);
      const previousSdk = buildDailyBuckets(sdkRows, days, prevNow);

      const currentTotal = currentManual.total + currentSdk.total;
      const previousTotal = previousManual.total + previousSdk.total;
      const deltaRatio =
        previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal : currentTotal > 0 ? 1 : 0;

      return {
        days,
        keys: currentManual.keys,
        seriesManual: currentManual.series,
        seriesSdk: currentSdk.series,
        currentTotal,
        previousTotal,
        deltaRatio,
      };
    },
  });

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const planDistribution = data?.plan_distribution ?? [];
  const statusDistribution = data?.status_distribution ?? [];

  const pay = data?.payment_stats;

  const counters = useMemo(() => {
    const items = companiesQuery.data?.items ?? [];
    const computedRows = (items as any[]).map((row) => {
      const computed = computeResolvedStatus(row, now);
      return {
        companyId: String(row.company_id ?? row.id ?? ''),
        companyName: String(row.company_name ?? row.name ?? '—'),
        computed,
      };
    });

    const out = {
      totalCompanies: computedRows.length,
      trialActive: computedRows.filter((r) => r.computed === 'trial_active').length,
      trialExpired: computedRows.filter((r) => r.computed === 'trial_expired').length,
      paymentPending: computedRows.filter((r) => r.computed === 'payment_pending').length,
      paidActive: computedRows.filter((r) => r.computed === 'pro_active').length,
      paidExpired: computedRows.filter((r) => r.computed === 'subscription_expired').length,
      suspended: computedRows.filter((r) => r.computed === 'suspended').length,
      // Legacy page fields still rendered in cards/sections.
      paymentDue: computedRows.filter((r) => r.computed === 'trial_expired').length,
      activeProTrials: 0,
      activeProSubscriptions: 0,
      expiredTrials: 0,
      expiredSubscriptions: 0,
      pendingConfirmation: Number(pay?.pending_total_count ?? 0),
      expiringSoon: [] as typeof computedRows,
      computedRows,
    };

    return out;
  }, [companiesQuery.data, now, pay?.pending_total_count]);

  const conversionRate = useMemo(() => {
    const denom = counters.paidActive + counters.trialActive + counters.trialExpired;
    if (denom <= 0) return 0;
    return counters.paidActive / denom;
  }, [counters.paidActive, counters.trialActive, counters.trialExpired]);

  const windowRevenueKes = Number(approvedRevenueSeriesQuery.data?.currentTotal ?? 0);
  const windowTrend = trendLabel(Number(approvedRevenueSeriesQuery.data?.deltaRatio ?? 0));
  const totalRevenueKes = Number(pay?.approved_revenue ?? 0);

  const chartTotals = useMemo(() => {
    const active = counters.paidActive + counters.trialActive;
    const expired = counters.trialExpired + counters.paidExpired;
    const paid = counters.paidActive;
    const trial = counters.trialActive;
    const basic = planDistribution.find((p) => String(p.plan ?? '').toLowerCase() === 'basic')?.count ?? 0;
    const pro = planDistribution.find((p) => String(p.plan ?? '').toLowerCase() === 'pro')?.count ?? 0;
    const planTotal = Number(basic) + Number(pro);
    return {
      active,
      expired,
      paid,
      trial,
      basic: Number(basic),
      pro: Number(pro),
      planTotal,
    };
  }, [counters, planDistribution]);

  const avgPerCompanyKes =
    chartTotals.active > 0 ? totalRevenueKes / chartTotals.active : 0;

  const sdkByCompany = useMemo(() => buildLatestSdkMpesaByCompany(mpesaStkRows), [mpesaStkRows]);

  const companyById = useMemo(() => {
    const items = (companiesQuery.data?.items ?? []) as any[];
    const m = new Map<string, any>();
    for (const r of items) {
      const id = String(r.company_id ?? r.id ?? '');
      if (id) m.set(id, r);
    }
    return m;
  }, [companiesQuery.data?.items]);

  const filteredAnalyticsRows = useMemo(() => {
    if (paymentType === 'all') return rows;
    return rows.filter((row) => {
      const cid = String(row.company_id ?? '');
      const c = companyById.get(cid);
      const resolved = resolveLatestCompanyPayment(
        c?.latest_subscription_payment ?? null,
        sdkByCompany.get(cid),
      );
      if (paymentType === 'manual') return resolved?.kind === 'manual';
      if (paymentType === 'sdk') return resolved?.kind === 'sdk';
      return true;
    });
  }, [rows, paymentType, companyById, sdkByCompany]);

  return (
    <DeveloperPageShell
      title="Subscription Analytics"
      description="Premium billing insights: trial vs paid health, revenue, risk, and upcoming expirations."
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

      {/* SECTION 1 — HERO METRICS */}
      <section className="mb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className={cn('fv-card p-4', metricCardTone('neutral'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total companies</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{counters.totalCompanies.toLocaleString()}</p>
            <div className="mt-3 h-2 rounded-full bg-muted/40">
              <div className={miniBar(1, 'neutral')} />
            </div>
          </div>

          <div className={cn('fv-card p-4', metricCardTone('success'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active paid</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400">
              {counters.paidActive.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Conversion snapshot: <span className="font-semibold text-foreground">{pct(conversionRate)}</span>
            </p>
            <div className="mt-3 h-2 rounded-full bg-muted/40">
              <div className={miniBar(counters.totalCompanies ? counters.paidActive / counters.totalCompanies : 0, 'success')} />
            </div>
          </div>

          <div className={cn('fv-card p-4', metricCardTone('warning'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active trial</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-amber-700 dark:text-amber-400">
              {counters.trialActive.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Expiring ≤14d: <span className="font-semibold text-foreground">{counters.expiringSoon.length}</span>
            </p>
            <div className="mt-3 h-2 rounded-full bg-muted/40">
              <div className={miniBar(counters.totalCompanies ? counters.trialActive / counters.totalCompanies : 0, 'warning')} />
            </div>
          </div>

          <div className={cn('fv-card p-4', metricCardTone(counters.pendingConfirmation > 0 ? 'warning' : 'neutral'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pending confirmation</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-blue-700 dark:text-blue-400">
              {counters.pendingConfirmation.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Manual pipeline only (M-Pesa manual pending); STK / SDK pending is excluded
            </p>
          </div>

          <div className={cn('fv-card p-4', metricCardTone('warning'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active Pro trials</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-amber-700 dark:text-amber-400">
              {Number(counters.activeProTrials ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Explicit: Pro + Trial + Active</p>
          </div>

          <div className={cn('fv-card p-4', metricCardTone('success'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active Pro subscriptions</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400">
              {Number(counters.activeProSubscriptions ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Explicit: Pro + Subscription + Active</p>
          </div>

          <div className={cn('fv-card p-4', metricCardTone(counters.paymentDue > 0 ? 'danger' : 'neutral'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment due</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-red-700 dark:text-red-400">
              {counters.paymentDue.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link className="underline underline-offset-2" to="/developer/companies?subscription=payment_required">
                View companies needing payment
              </Link>
            </p>
            <div className="mt-3 h-2 rounded-full bg-muted/40">
              <div className={miniBar(counters.totalCompanies ? counters.paymentDue / counters.totalCompanies : 0, 'danger')} />
            </div>
          </div>

          <div className={cn('fv-card p-4', metricCardTone('neutral'))}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Revenue (KES) · last {revenueWindowDays}d
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                  {fmtKes(windowRevenueKes)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  vs previous {revenueWindowDays}d:{' '}
                  <span className={cn('font-semibold', windowTrend.className)}>{windowTrend.label}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-muted/30 p-1">
                  {([7, 30, 90] as RevenueWindowDays[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRevenueWindowDays(d)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] rounded-lg transition-colors',
                        revenueWindowDays === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                <StackedRevenueMini
                  keys={approvedRevenueSeriesQuery.data?.keys ?? []}
                  manual={approvedRevenueSeriesQuery.data?.seriesManual ?? []}
                  sdk={approvedRevenueSeriesQuery.data?.seriesSdk ?? []}
                />
              </div>
            </div>
          </div>

          <div className={cn('fv-card p-4', metricCardTone('neutral'))}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trial → paid conversion</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{pct(conversionRate)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Approx: paid / (paid + trial active + trial expired)
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2 — SUBSCRIPTION HEALTH */}
      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="fv-card p-4 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Trial vs Paid</p>
            <p className="text-xs text-muted-foreground">{chartTotals.paid + chartTotals.trial} active</p>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Paid</span>
              <span className="font-medium tabular-nums">{chartTotals.paid}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40">
              <div className={miniBar(chartTotals.active ? chartTotals.paid / chartTotals.active : 0, 'success')} />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-muted-foreground">Trial</span>
              <span className="font-medium tabular-nums">{chartTotals.trial}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40">
              <div className={miniBar(chartTotals.active ? chartTotals.trial / chartTotals.active : 0, 'warning')} />
            </div>
          </div>
        </div>

        <div className="fv-card p-4 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Active vs Expired</p>
            <p className="text-xs text-muted-foreground">{counters.totalCompanies} total</p>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Active</span>
              <span className="font-medium tabular-nums">{chartTotals.active}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40">
              <div className={miniBar(counters.totalCompanies ? chartTotals.active / counters.totalCompanies : 0, 'success')} />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-muted-foreground">Expired</span>
              <span className="font-medium tabular-nums">{chartTotals.expired}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40">
              <div className={miniBar(counters.totalCompanies ? chartTotals.expired / counters.totalCompanies : 0, 'danger')} />
            </div>
          </div>
        </div>

        <div className="fv-card p-4 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Plan distribution</p>
            <p className="text-xs text-muted-foreground">{chartTotals.planTotal || 0} tracked</p>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Basic</span>
              <span className="font-medium tabular-nums">{chartTotals.basic}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40">
              <div className={miniBar(chartTotals.planTotal ? chartTotals.basic / chartTotals.planTotal : 0, 'neutral')} />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-muted-foreground">Pro</span>
              <span className="font-medium tabular-nums">{chartTotals.pro}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/40">
              <div className={miniBar(chartTotals.planTotal ? chartTotals.pro / chartTotals.planTotal : 0, 'success')} />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3 — PAYMENT ATTENTION */}
      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="fv-card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Needs attention</p>
              <p className="text-xs text-muted-foreground">Expired access and upcoming expirations</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/developer/companies?subscription=payment_required">Review payment due</Link>
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={cn('rounded-xl border p-3', metricCardTone(counters.trialExpired > 0 ? 'danger' : 'neutral'))}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trial expired</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-red-700 dark:text-red-400">{counters.trialExpired}</p>
            </div>
            <div className={cn('rounded-xl border p-3', metricCardTone(counters.paidExpired > 0 ? 'danger' : 'neutral'))}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Subscription expired</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-red-700 dark:text-red-400">{counters.paidExpired}</p>
            </div>
            <div className={cn('rounded-xl border p-3', metricCardTone(counters.expiringSoon.length > 0 ? 'warning' : 'neutral'))}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expiring soon</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">{counters.expiringSoon.length}</p>
              <p className="text-[11px] text-muted-foreground">≤ 14 days</p>
            </div>
          </div>
        </div>

        <div className="fv-card p-4 lg:col-span-1">
          <p className="text-sm font-semibold">Payment risk</p>
          <p className="text-xs text-muted-foreground">Manual pending only — SDK / STK pending is excluded</p>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pending verification</span>
              <span className="font-medium tabular-nums">{Number(pay?.pending_verification_count ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Revenue exposure (KES)</span>
              <span className="font-medium tabular-nums">{Number(pay?.pending_revenue ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-muted-foreground">Confirmed revenue (KES)</span>
              <span className="font-semibold tabular-nums">{Number(pay?.approved_revenue ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — UPCOMING EXPIRATIONS */}
      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="fv-card p-4">
          <p className="text-sm font-semibold">Trial expired</p>
          <p className="mt-1 text-xs text-muted-foreground">Needs attention (no payment confirmed)</p>
          <p className="mt-4 text-3xl font-bold tabular-nums text-red-700 dark:text-red-400">
            {counters.trialExpired.toLocaleString()}
          </p>
        </div>
        <div className="fv-card p-4">
          <p className="text-sm font-semibold">Active Pro</p>
          <p className="mt-1 text-xs text-muted-foreground">Payment confirmed + active</p>
          <p className="mt-4 text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {counters.paidActive.toLocaleString()}
          </p>
        </div>
        <div className="fv-card p-4">
          <p className="text-sm font-semibold">Payment pending</p>
          <p className="mt-1 text-xs text-muted-foreground">Pro with no confirmed payment</p>
          <p className="mt-4 text-3xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
            {counters.paymentPending.toLocaleString()}
          </p>
        </div>
      </section>

      {/* SECTION 5 — REVENUE ANALYTICS */}
      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="fv-card p-4">
          <p className="text-sm font-semibold">Revenue analytics</p>
          <p className="text-xs text-muted-foreground">Manual + SDK combined; window chart stacks both</p>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total revenue (KES)</span>
              <span className="font-semibold tabular-nums">{fmtKes(totalRevenueKes)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Manual confirmed (KES)</span>
              <span className="font-medium tabular-nums text-muted-foreground">{fmtKes(Number(pay?.manual_approved_revenue ?? 0))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">SDK confirmed (KES)</span>
              <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                {fmtKes(Number(pay?.sdk_confirmed_revenue ?? 0))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Revenue last {revenueWindowDays}d (KES)</span>
              <span className="font-semibold tabular-nums">{fmtKes(windowRevenueKes)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-muted-foreground">Avg per active company (KES)</span>
              <span className="font-medium tabular-nums">{Math.round(avgPerCompanyKes).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="fv-card p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Filters (legacy)</p>
            <p className="text-xs text-muted-foreground">Affects the companies table below</p>
          </div>
          <div className="mt-3 flex flex-col gap-3 text-xs sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <span className="shrink-0 text-muted-foreground">Payment:</span>
              <div className="flex flex-wrap gap-1 rounded-xl bg-muted/40 border border-border/70 p-0.5">
                {(['all', 'manual', 'sdk'] as PaymentTypeFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`px-2.5 py-1.5 rounded-lg sm:rounded-full sm:px-3 ${
                      paymentType === value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setPaymentType(value)}
                  >
                    {value === 'all' ? 'All' : value === 'manual' ? 'Manual' : 'SDK'}
                  </button>
                ))}
              </div>
            </div>
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
        </div>
      </section>

      {/* Companies table */}
      <section className="mb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Companies</p>
            <p className="text-xs text-muted-foreground">Improved table with plan, status and access badges</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/developer/companies">Open companies list</Link>
            </Button>
          </div>
        </div>

        {filteredAnalyticsRows.length > 0 ? (
          <div className="fv-card mt-3 overflow-x-visible md:overflow-x-auto">
            <table className="fv-table-mobile w-full min-w-0 text-sm md:min-w-[960px]">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">Company</th>
                  <th className="py-2 text-left font-medium">Plan type</th>
                  <th className="py-2 text-left font-medium">Badges</th>
                  <th className="py-2 text-left font-medium">Billing</th>
                  <th className="py-2 text-left font-medium">Payment</th>
                  <th className="py-2 text-left font-medium">Access end</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnalyticsRows.map((row) => {
                  const statusResolved = computeResolvedStatus(row, now);
                  const planLabel = String(row.plan_code ?? row.plan ?? row.selected_plan ?? '—');
                  const endIso = String(row.active_until ?? row.current_period_end ?? row.trial_ends_at ?? '');
                  const cid = String(row.company_id ?? '');
                  const c = companyById.get(cid);
                  const latestPay = resolveLatestCompanyPayment(
                    c?.latest_subscription_payment ?? null,
                    sdkByCompany.get(cid),
                  );

                  return (
                    <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                      <td className="max-md:items-start max-md:gap-2 py-3 pr-4" data-label="Company">
                        <div className="font-medium text-foreground">{row.company_name ?? 'Unknown company'}</div>
                        <div className="text-[11px] text-muted-foreground">{row.company_id}</div>
                      </td>
                      <td className="py-3 pr-4 text-xs font-medium text-foreground" data-label="Plan type">
                        {planLabel}
                      </td>
                      <td className="py-3 pr-4 text-xs" data-label="Badges">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="font-normal capitalize">
                            {planLabel}
                          </Badge>
                          {statusBadgeFromResolved(statusResolved)}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs" data-label="Billing">
                        <div className="text-foreground">{row.billing_mode ?? '—'}</div>
                        <div className="text-[11px] text-muted-foreground">{row.billing_cycle ?? '—'}</div>
                      </td>
                      <td className="py-3 pr-4 text-xs align-top" data-label="Payment">
                        {latestPay ? (
                          <div className="max-w-[200px] space-y-1">
                            <Badge
                              variant={latestPay.kind === 'sdk' ? 'success' : 'secondary'}
                              className="font-normal text-[10px] px-1.5 py-0"
                            >
                              {latestPay.kind === 'sdk' ? 'SDK' : 'Manual'}
                            </Badge>
                            <div className="text-foreground">
                              {latestPay.amount != null
                                ? `${latestPay.currency} ${latestPay.amount.toLocaleString()} — ${formatPaymentRelativeDay(latestPay.atMs, now)}`
                                : `— — ${formatPaymentRelativeDay(latestPay.atMs, now)}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs" data-label="Access end">
                        <div className="text-foreground">{endIso || '—'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading &&
          !error && (
            <div className="fv-card mt-3 text-sm text-muted-foreground">
              No companies match the current filters.
            </div>
          )
        )}
      </section>
    </DeveloperPageShell>
  );
}

