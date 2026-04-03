import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { ProFeatureDataOverlay } from '@/components/dashboard/ProFeatureDataOverlay';

interface ExpensesPieChartProps {
  data: Array<{
    category: string;
    amount: number;
  }>;
  proLocked?: boolean;
  onProUpgrade?: () => void;
}

const COLORS = [
  'hsl(150 35% 25%)',   // Dark green
  'hsl(45 70% 50%)',    // Gold
  'hsl(80 30% 45%)',    // Olive
  'hsl(150 25% 40%)',   // Medium green
  'hsl(38 70% 55%)',    // Amber
  'hsl(150 20% 55%)',   // Light green
];

export function ExpensesPieChart({ data, proLocked = false, onProUpgrade }: ExpensesPieChartProps) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  const dataBody = (
    <>
      <div className="h-48 sm:h-56 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="amount"
              nameKey="category"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0 0% 100%)',
                border: '1px solid hsl(40 15% 85%)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-card)',
              }}
              formatter={(value: number) => [`KES ${value.toLocaleString()}`, '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
        {data.map((item, index) => (
          <div key={item.category} className="flex items-center gap-2">
            <div
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="truncate text-xs text-muted-foreground">{item.category}</span>
            <span className="ml-auto text-xs font-medium">
              {total > 0 ? Math.round((item.amount / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className={cn('fv-card', 'p-4 sm:p-5')}>
      <h3 className="mb-2 text-base font-semibold text-foreground sm:mb-3 sm:text-lg">Expenses by Category</h3>
      {proLocked ? (
        <div className="relative min-h-[12rem] overflow-hidden rounded-lg sm:min-h-[14rem] md:min-h-[16rem]">
          <div className="pointer-events-none select-none blur-md opacity-40">{dataBody}</div>
          <ProFeatureDataOverlay onUpgrade={onProUpgrade} />
        </div>
      ) : (
        dataBody
      )}
    </div>
  );
}
