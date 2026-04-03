import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsCropProfitRow } from '@/services/analyticsReportsService';
import { formatKes } from './analyticsFormat';
import { ProFeatureDataOverlay } from '@/components/dashboard/ProFeatureDataOverlay';

const glass =
  'rounded-2xl border border-white/20 bg-card/55 shadow-[var(--shadow-card)] backdrop-blur-xl dark:border-white/10 dark:bg-card/40 p-4 sm:p-5';

export function ProfitChart({
  data,
  loading,
  className,
  proLocked = false,
  onProUpgrade,
}: {
  data: AnalyticsCropProfitRow[];
  loading: boolean;
  className?: string;
  proLocked?: boolean;
  onProUpgrade?: () => void;
}) {
  const chartData = useMemo(
    () =>
      data.map((r) => ({
        name: r.crop?.trim() || 'Unknown',
        profit: r.profit,
        revenue: r.total_revenue,
      })),
    [data],
  );

  const empty = !loading && chartData.length === 0;

  const body = loading ? (
    <Skeleton className="h-64 w-full rounded-xl" />
  ) : empty ? (
    <div className="flex h-64 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
      No crop profit data yet. Record harvest collections and link them to projects with a crop type.
    </div>
  ) : (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            interval={0}
            angle={-28}
            textAnchor="end"
            height={56}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '10px',
              boxShadow: 'var(--shadow-card)',
            }}
            formatter={(value: number, name: string) =>
              name === 'profit' ? [formatKes(value), 'Profit'] : [formatKes(value), 'Revenue']
            }
          />
          <Bar dataKey="profit" fill="hsl(142 50% 42%)" radius={[6, 6, 0, 0]} name="profit" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className={cn(glass, className)}>
      <h3 className="mb-1 text-base font-semibold text-foreground">Profit per crop</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Gross from harvest totals minus expenses (per crop group)
      </p>
      {proLocked ? (
        <div className="relative min-h-[16rem] overflow-hidden rounded-lg">
          <div className="pointer-events-none select-none blur-md opacity-40">{body}</div>
          <ProFeatureDataOverlay onUpgrade={onProUpgrade} />
        </div>
      ) : (
        body
      )}
    </div>
  );
}
