import React, { useMemo } from 'react';
import {
  Activity,
  Bean,
  Briefcase,
  ClipboardList,
  Coins,
  Package,
  Tractor,
  Users,
  UserSquare2,
  Warehouse,
} from 'lucide-react';
import { MetricCard } from './MetricCard';
import { formatDevDateShort, formatMoney, formatNumber } from './utils';

type Props = {
  metrics: Record<string, unknown> | undefined;
  className?: string;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function CompanyOverviewCards({ metrics, className }: Props) {
  const items = useMemo(() => {
    const m = metrics ?? {};
    const last = m.last_activity_at as string | undefined;
    const timelineSignals =
      num(m.activity_logs_total) +
      num(m.employee_activity_logs_total) +
      num(m.work_logs_total);

    return [
      {
        label: 'Projects',
        value: formatNumber(m.projects_total),
        icon: Tractor,
        hint: 'Scoped farm projects',
      },
      {
        label: 'Users',
        value: formatNumber(m.users_total),
        icon: Users,
        hint: 'Workspace members',
      },
      {
        label: 'Employees',
        value: formatNumber(m.employees_total),
        icon: UserSquare2,
        hint: 'Workforce records',
      },
      {
        label: 'Harvest records',
        value: formatNumber(m.harvest_records_total),
        icon: Bean,
        hint: `${formatNumber(m.harvest_quantity_total, 2)} total qty`,
      },
      {
        label: 'Expenses',
        value: formatMoney(m.expenses_total),
        icon: Coins,
        hint: `${formatNumber(m.expense_count)} line items`,
      },
      {
        label: 'Inventory items',
        value: formatNumber(m.inventory_items_total),
        icon: Package,
        hint: `${formatNumber(m.inventory_low_stock)} low · ${formatNumber(m.inventory_out_of_stock)} out`,
      },
      {
        label: 'Suppliers',
        value: formatNumber(m.suppliers_total),
        icon: Warehouse,
      },
      {
        label: 'Activity signals',
        value: formatNumber(timelineSignals),
        icon: Activity,
        hint: 'Logs + work logs (approx.)',
      },
      {
        label: 'Last activity',
        value: last ? formatDevDateShort(last) : '—',
        icon: ClipboardList,
        hint: 'Latest module timestamp',
      },
      {
        label: 'Harvest revenue (est.)',
        value: formatMoney(m.harvest_revenue_total),
        icon: Briefcase,
        hint: 'Qty × price where priced',
      },
    ];
  }, [metrics]);

  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 ${className ?? ''}`}>
      {items.map((c) => (
        <MetricCard key={c.label} label={c.label} value={c.value} hint={c.hint} icon={c.icon} />
      ))}
    </div>
  );
}
