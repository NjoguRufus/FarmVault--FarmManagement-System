import React from 'react';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ProFeatureDataOverlay } from '@/components/dashboard/ProFeatureDataOverlay';

interface ActivityChartProps {
  data: Array<{
    month: string;
    expenses: number;
    sales: number;
  }>;
  proLocked?: boolean;
  onProUpgrade?: () => void;
}

export function ActivityChart({ data, proLocked = false, onProUpgrade }: ActivityChartProps) {
  const hasData = data.length > 0 && data.some((d) => d.expenses > 0 || d.sales > 0);

  const chartBody = !hasData ? (
    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground sm:h-64 md:h-72">
      No activity in the last 6 months
    </div>
  ) : (
    <div className="h-52 sm:h-64 md:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: 'hsl(150 10% 45%)' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: 'hsl(150 10% 45%)' }}
            tickFormatter={(value) => `${value / 1000}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(0 0% 100%)',
              border: '1px solid hsl(40 15% 85%)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-card)',
            }}
            formatter={(value: number) => [`KES ${value.toLocaleString()}`, '']}
          />
          <Bar dataKey="expenses" fill="hsl(150 30% 22%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="sales" fill="hsl(45 70% 50%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className={cn('fv-card', 'p-4 sm:p-5')}>
      <div className="mb-2 flex flex-col gap-2 sm:mb-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-foreground sm:text-lg">Recent Activity</h3>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-primary" />
            <span className="text-xs text-muted-foreground">Expenses</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-fv-gold" />
            <span className="text-xs text-muted-foreground">Sales</span>
          </div>
        </div>
      </div>
      {proLocked ? (
        <div className="relative min-h-[13rem] overflow-hidden rounded-lg sm:min-h-[16rem] md:min-h-[18rem]">
          <div className="pointer-events-none select-none blur-md opacity-40">{chartBody}</div>
          <ProFeatureDataOverlay onUpgrade={onProUpgrade} />
        </div>
      ) : (
        chartBody
      )}
    </div>
  );
}
