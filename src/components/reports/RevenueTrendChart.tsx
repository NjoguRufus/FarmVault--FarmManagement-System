import React, { useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsMonthlyRevenueRow } from '@/services/analyticsReportsService';
import { formatKes } from './analyticsFormat';

const glass =
  'rounded-2xl border border-white/20 bg-card/55 shadow-[var(--shadow-card)] backdrop-blur-xl dark:border-white/10 dark:bg-card/40 p-4 sm:p-5';

function formatMonthLabel(raw: string): string {
  try {
    const d = parseISO(raw);
    if (isValid(d)) return format(d, 'MMM yyyy');
  } catch {
    /* ignore */
  }
  return raw;
}

export function RevenueTrendChart({
  data,
  loading,
  className,
}: {
  data: AnalyticsMonthlyRevenueRow[];
  loading: boolean;
  className?: string;
}) {
  const chartData = useMemo(
    () =>
      [...data]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((r) => ({
          monthRaw: r.month,
          label: formatMonthLabel(r.month),
          revenue: r.revenue,
        })),
    [data],
  );

  const empty = !loading && chartData.length === 0;

  return (
    <div className={cn(glass, className)}>
      <h3 className="text-base font-semibold text-foreground mb-1">Monthly revenue</h3>
      <p className="text-xs text-muted-foreground mb-4">Harvest gross totals by calendar month</p>
      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : empty ? (
        <div className="h-64 flex flex-col items-center justify-center text-center text-sm text-muted-foreground px-4">
          No monthly revenue yet. Sales recorded on harvest collections will appear here.
        </div>
      ) : (
        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                interval="preserveStartEnd"
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
                formatter={(value: number) => [formatKes(value), 'Revenue']}
                labelFormatter={(label) => String(label ?? '')}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(150 30% 35%)"
                strokeWidth={2.5}
                dot={{ fill: 'hsl(45 70% 50%)', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
