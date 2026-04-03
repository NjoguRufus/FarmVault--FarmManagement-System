import React from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ProFeatureDataOverlay } from '@/components/dashboard/ProFeatureDataOverlay';

interface ExpensesBarChartProps {
  data: Array<{
    category: string;
    amount: number;
  }>;
  proLocked?: boolean;
  onProUpgrade?: () => void;
}

const COLORS = [
  'hsl(150 35% 25%)',
  'hsl(45 70% 50%)',
  'hsl(80 30% 45%)',
  'hsl(150 25% 40%)',
  'hsl(38 70% 55%)',
  'hsl(150 20% 55%)',
];

export function ExpensesBarChart({ data, proLocked = false, onProUpgrade }: ExpensesBarChartProps) {
  const chartBody =
    data.length === 0 ? (
      <div className="flex h-64 min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        No expense data to display
      </div>
    ) : (
      <div className="h-64 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" vertical={false} />
            <XAxis
              dataKey="category"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(150 10% 45%)' }}
              tickFormatter={(value) => (value.length > 12 ? `${value.slice(0, 10)}…` : value)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(150 10% 45%)' }}
              tickFormatter={(value) => `KES ${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0 0% 100%)',
                border: '1px solid hsl(40 15% 85%)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-card)',
              }}
              formatter={(value: number) => [`KES ${Number(value).toLocaleString()}`, 'Amount']}
              labelFormatter={(label) => label}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={48} label={false}>
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );

  return (
    <div className="fv-card h-full">
      <h3 className="mb-4 text-lg font-semibold text-foreground">Expenses by Category (Bar)</h3>
      {proLocked ? (
        <div className="relative min-h-[200px] overflow-hidden rounded-lg">
          <div className="pointer-events-none select-none blur-md opacity-40">{chartBody}</div>
          <ProFeatureDataOverlay onUpgrade={onProUpgrade} />
        </div>
      ) : (
        chartBody
      )}
    </div>
  );
}
