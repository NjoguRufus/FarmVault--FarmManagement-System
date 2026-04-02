import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsCropYieldRow } from '@/services/analyticsReportsService';
import { formatCrates, formatKg } from './analyticsFormat';

const glass =
  'rounded-2xl border border-white/20 bg-card/55 shadow-[var(--shadow-card)] backdrop-blur-xl dark:border-white/10 dark:bg-card/40 p-4 sm:p-5';

export function YieldChart({
  data,
  loading,
  className,
}: {
  data: AnalyticsCropYieldRow[];
  loading: boolean;
  className?: string;
}) {
  const chartData = useMemo(
    () =>
      data.map((r) => ({
        name: r.crop?.trim() || 'Unknown',
        crates: r.total_crates,
        weightKg: r.total_weight,
      })),
    [data],
  );

  const empty = !loading && chartData.length === 0;

  return (
    <div className={cn(glass, className)}>
      <h3 className="text-base font-semibold text-foreground mb-1">Yield per crop</h3>
      <p className="text-xs text-muted-foreground mb-4">Total crates and weight from harvest totals</p>
      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : empty ? (
        <div className="h-64 flex flex-col items-center justify-center text-center text-sm text-muted-foreground px-4">
          No yield data yet. Complete harvest collections with totals to populate this chart.
        </div>
      ) : (
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }} barGap={4}>
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
                yAxisId="left"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
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
                  name === 'Crates' ? [formatCrates(value), name] : [formatKg(value), name]
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="crates" fill="hsl(150 30% 38%)" radius={[4, 4, 0, 0]} name="Crates" />
              <Bar yAxisId="right" dataKey="weightKg" fill="hsl(45 70% 52%)" radius={[4, 4, 0, 0]} name="Weight (kg)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
