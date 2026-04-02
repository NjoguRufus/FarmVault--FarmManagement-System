import React, { useMemo } from 'react';
import { Award, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsCropProfitRow } from '@/services/analyticsReportsService';
import type { AnalyticsMonthlyRevenueRow } from '@/services/analyticsReportsService';
import { formatKes, formatKg } from './analyticsFormat';

const glass =
  'rounded-2xl border border-white/20 bg-card/55 shadow-[var(--shadow-card)] backdrop-blur-xl dark:border-white/10 dark:bg-card/40';

function CardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(glass, 'p-4 sm:p-5', className)}>{children}</div>;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accentClass,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  accentClass: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <CardShell>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell className="hover:shadow-[var(--shadow-card-hover)] transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-foreground truncate">{value}</p>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            accentClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardShell>
  );
}

export function AnalyticsCards({
  mode,
  loading,
  bestCrop,
  totalRevenue,
  totalExpenses,
  totalProfit,
  totalYield,
  monthlyRevenue,
  cropProfitRows,
}: {
  mode: 'pro' | 'basic';
  loading: boolean;
  bestCrop: AnalyticsCropProfitRow | null;
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  totalYield: number;
  monthlyRevenue: AnalyticsMonthlyRevenueRow[];
  cropProfitRows: AnalyticsCropProfitRow[];
}) {
  const profitVariant = useMemo(() => {
    if (totalProfit > 0) return 'success' as const;
    if (totalProfit < 0) return 'warning' as const;
    return 'neutral' as const;
  }, [totalProfit]);

  const bestLabel = bestCrop?.crop?.trim() || '—';
  const bestSubtitle =
    !loading && cropProfitRows.length === 0
      ? 'Add harvests and expenses to see insights'
      : bestCrop
        ? `Revenue ${formatKes(bestCrop.total_revenue)}`
        : 'No crop breakdown yet';

  const monthlyTrend = useMemo(() => {
    if (!monthlyRevenue.length) return null;
    const sorted = [...monthlyRevenue].sort((a, b) => a.month.localeCompare(b.month));
    const last = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    const delta = prev ? last.revenue - prev.revenue : null;
    const pct = prev && prev.revenue !== 0 ? (delta! / prev.revenue) * 100 : null;
    return { last, prev, delta, pct };
  }, [monthlyRevenue]);

  const cards = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      {loading ? (
        <CardShell>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
          </div>
        </CardShell>
      ) : (
        <CardShell className="sm:col-span-2 xl:col-span-1 ring-1 ring-primary/15 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Best performing crop</p>
              <p className="mt-1 text-xl sm:text-2xl font-bold text-foreground truncate">{bestLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">{bestSubtitle}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fv-gold-soft/80 text-fv-olive">
              <Award className="h-5 w-5" />
            </div>
          </div>
        </CardShell>
      )}
      <MetricCard
        title="Total revenue"
        value={formatKes(totalRevenue)}
        subtitle="From harvest collections"
        icon={Wallet}
        accentClass="bg-primary/15 text-primary"
        loading={loading}
      />
      <MetricCard
        title="Total expenses"
        value={formatKes(totalExpenses)}
        subtitle="All recorded categories"
        icon={TrendingDown}
        accentClass="bg-fv-warning/15 text-fv-warning"
        loading={loading}
      />
      <MetricCard
        title="Total profit"
        value={formatKes(totalProfit)}
        subtitle={profitVariant === 'success' ? 'Ahead of costs' : profitVariant === 'warning' ? 'Below costs' : 'Break-even'}
        icon={TrendingUp}
        accentClass={
          profitVariant === 'success'
            ? 'bg-fv-success/15 text-fv-success'
            : profitVariant === 'warning'
              ? 'bg-destructive/15 text-destructive'
              : 'bg-muted/60 text-muted-foreground'
        }
        loading={loading}
      />
      <MetricCard
        title="Total yield"
        value={formatKg(totalYield)}
        subtitle="All harvests"
        icon={TrendingUp}
        accentClass="bg-fv-success/10 text-fv-success"
        loading={loading}
      />
      <MetricCard
        title="Monthly revenue trend"
        value={monthlyTrend ? formatKes(monthlyTrend.last.revenue) : '—'}
        subtitle={
          monthlyTrend?.prev
            ? `${monthlyTrend.delta != null && monthlyTrend.delta >= 0 ? 'Up' : 'Down'} ${formatKes(Math.abs(monthlyTrend.delta ?? 0))} vs last month`
            : 'Latest month total'
        }
        icon={TrendingUp}
        accentClass="bg-fv-gold-soft/70 text-fv-olive"
        loading={loading}
      />
    </div>
  );

  void mode; // mode retained for UI toggle; cards remain consistent
  return cards;
}
