import React, { useMemo } from 'react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDateShort, formatMoney, formatNumber } from './utils';

type Row = Record<string, unknown>;

type Props = {
  expenses: Row[];
  byCategory: Row[];
  metrics: Record<string, unknown> | undefined;
};

export function CompanyExpensesTab({ expenses, byCategory, metrics }: Props) {
  const pickerPayouts = useMemo(
    () => expenses.filter((e) => String(e.category ?? '').toLowerCase() === 'picker_payout'),
    [expenses],
  );

  if (!expenses.length) {
    return (
      <EmptyStateBlock
        title="No expenses recorded"
        description="Finance expenses from the ledger will appear here once the farm starts tracking costs."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total spend" value={formatMoney(metrics?.expenses_total)} />
        <Stat label="Line items" value={formatNumber(metrics?.expense_count)} />
        <Stat label="Picker payouts (rows)" value={formatNumber(pickerPayouts.length)} />
      </div>

      <div className="rounded-xl border border-border/60 bg-card/30 p-4">
        <h3 className="text-sm font-semibold">Category breakdown</h3>
        <div className="mt-3 space-y-2">
          {byCategory.map((c) => (
            <div key={String(c.category)} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{String(c.category ?? '—')}</span>
              <span className="font-medium tabular-nums">{formatMoney(c.total)}</span>
              <span className="text-xs text-muted-foreground">({formatNumber(c.cnt)})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fv-card overflow-x-auto">
        <table className="fv-table-mobile w-full min-w-[800px] text-sm">
          <thead className="border-b border-border/60 text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-left font-medium">Date</th>
              <th className="py-2 text-left font-medium">Title</th>
              <th className="py-2 text-left font-medium">Category</th>
              <th className="py-2 text-left font-medium">Project</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 text-left font-medium">Method</th>
              <th className="py-2 text-left font-medium">Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={String(e.id)} className="border-b border-border/40">
                <td className="py-2 text-xs">{formatDevDateShort(e.expense_date as string)}</td>
                <td className="py-2 max-w-[200px] truncate" title={String(e.title ?? '')}>
                  {String(e.title ?? '—')}
                </td>
                <td className="py-2 text-xs">{String(e.category ?? '—')}</td>
                <td className="py-2 text-xs text-muted-foreground max-w-[120px] truncate">
                  {String(e.project_name ?? '—')}
                </td>
                <td className="py-2 text-right tabular-nums font-medium">{formatMoney(e.amount)}</td>
                <td className="py-2 text-xs">{String(e.payment_method ?? '—')}</td>
                <td className="py-2 font-mono text-[11px] text-muted-foreground">{String(e.created_by ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
