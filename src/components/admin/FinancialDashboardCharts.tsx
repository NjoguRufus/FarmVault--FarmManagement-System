import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";

type ChartDatum = { month: string; revenue: number; expenses: number; profit: number };
type SliceDatum = { category: string; amount: number };

type FinancialDashboardChartsProps = {
  monthlyData: ChartDatum[];
  expenseByCategory: SliceDatum[];
  revenueByPlan: SliceDatum[];
  revenueBySource: SliceDatum[];
  pieColors: string[];
  formatKES: (value: number) => string;
};

export default function FinancialDashboardCharts({
  monthlyData,
  expenseByCategory,
  revenueByPlan,
  revenueBySource,
  pieColors,
  formatKES,
}: FinancialDashboardChartsProps) {
  return (
    <>
      <div className="fv-card p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-primary" />Revenue vs Expenses</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <CartesianGrid stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number) => formatKES(v)} />
              <Legend />
              <Line dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line dataKey="expenses" stroke="hsl(27 40% 45%)" strokeWidth={2} dot={false} />
              <Area dataKey="profit" fill="hsl(var(--primary) / 0.2)" stroke="none" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="fv-card p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><PieChartIcon className="h-4 w-4 text-primary" />Expense Breakdown</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseByCategory} dataKey="amount" nameKey="category" outerRadius={90} label>
                  {expenseByCategory.map((entry, index) => (
                    <Cell key={`${entry.category}-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatKES(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="fv-card p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><PieChartIcon className="h-4 w-4 text-primary" />Revenue by Plan</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={revenueByPlan} dataKey="amount" nameKey="category" outerRadius={90} label>
                  {revenueByPlan.map((entry, index) => (
                    <Cell key={`${entry.category}-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatKES(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="fv-card p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><PieChartIcon className="h-4 w-4 text-primary" />Revenue by Source</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueBySource}>
                <CartesianGrid stroke="hsl(var(--border))" />
                <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => formatKES(v)} />
                <Area dataKey="amount" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
