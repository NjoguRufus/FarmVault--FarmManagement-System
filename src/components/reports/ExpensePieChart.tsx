import React, { useMemo } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsExpenseBreakdownRow } from '@/services/analyticsReportsService';
import { formatKes } from './analyticsFormat';
import { ProFeatureDataOverlay } from '@/components/dashboard/ProFeatureDataOverlay';

const glass =
  'rounded-2xl border border-white/20 bg-card/55 shadow-[var(--shadow-card)] backdrop-blur-xl dark:border-white/10 dark:bg-card/40 p-4 sm:p-5';

const COLORS = [
  'hsl(150 35% 32%)',
  'hsl(45 70% 50%)',
  'hsl(80 30% 45%)',
  'hsl(150 25% 48%)',
  'hsl(38 70% 55%)',
  'hsl(150 20% 55%)',
];

export function ExpensePieChart({
  data,
  loading,
  className,
  proLocked = false,
  onProUpgrade,
}: {
  data: AnalyticsExpenseBreakdownRow[];
  loading: boolean;
  className?: string;
  proLocked?: boolean;
  onProUpgrade?: () => void;
}) {
  const pieData = useMemo(
    () =>
      data
        .filter((r) => (r.total ?? 0) > 0)
        .map((r) => ({
          category: r.category?.trim() || 'Uncategorized',
          amount: r.total,
        })),
    [data],
  );

  const total = useMemo(() => pieData.reduce((s, d) => s + d.amount, 0), [pieData]);
  const empty = !loading && (pieData.length === 0 || total <= 0);

  const body = loading ? (
    <Skeleton className="h-64 w-full rounded-xl" />
  ) : empty ? (
    <div className="flex h-64 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
      No expenses recorded for this company yet.
    </div>
  ) : (
    <>
      <div className="h-56 w-full min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={84}
              paddingAngle={2}
              dataKey="amount"
              nameKey="category"
            >
              {pieData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '10px',
                boxShadow: 'var(--shadow-card)',
              }}
              formatter={(value: number) => [formatKes(value), '']}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {pieData.map((item, index) => (
          <div key={item.category} className="flex min-w-0 items-center gap-2">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="truncate text-xs text-muted-foreground">{item.category}</span>
            <span className="ml-auto shrink-0 text-xs font-medium tabular-nums">
              {total > 0 ? Math.round((item.amount / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className={cn(glass, className)}>
      <h3 className="mb-1 text-base font-semibold text-foreground">Expense breakdown</h3>
      <p className="mb-4 text-xs text-muted-foreground">Share of spend by category</p>
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
