import React, { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCollection } from '@/hooks/useCollection';
import { formatDate, toDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import type { Expense, Harvest, Sale } from '@/types';
import { getExpenseCategoryLabel } from '@/lib/utils';
import { DeveloperRawPayloadAccordion } from './DeveloperRawPayloadAccordion';

const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  harvestId: string;
  /** Summary row from the developer harvest table (optional). */
  summary?: Record<string, unknown> | null;
};

export function DeveloperHarvestRecordDetailsSheet({ open, onOpenChange, companyId, harvestId, summary }: Props) {
  const scope = useMemo(() => ({ companyScoped: true, companyId, isDeveloper: true }), [companyId]);

  const { data: allHarvests = [] } = useCollection<Harvest>('developer-harvests', 'harvests', scope);
  const { data: allSales = [] } = useCollection<Sale>('developer-sales', 'sales', scope);
  const { data: allExpenses = [] } = useCollection<Expense>('developer-expenses', 'expenses', scope);

  const harvest = useMemo(() => allHarvests.find((h) => h.id === harvestId) ?? null, [allHarvests, harvestId]);

  const harvestSales = useMemo(
    () => (harvestId ? allSales.filter((s) => s.harvestId === harvestId) : []),
    [allSales, harvestId],
  );

  const harvestExpenses = useMemo(() => {
    if (!harvestId) return [];
    const base = allExpenses.filter((e) => e.harvestId === harvestId);
    const isFrenchBeans =
      String(harvest?.cropType ?? '')
        .toLowerCase()
        .replace('_', '-') === 'french-beans';

    if (!isFrenchBeans || !harvest) return base;

    const pickerExpenses = allExpenses.filter(
      (e) =>
        e.projectId === harvest.projectId &&
        e.companyId === harvest.companyId &&
        (e.meta as { source?: unknown } | null)?.source === 'harvest_wallet_picker_payment',
    );

    const extra = pickerExpenses.filter((e) => !base.some((b) => b.id === e.id));
    return [...base, ...extra];
  }, [allExpenses, harvestId, harvest]);

  const totalRevenue = harvestSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalExpensesAmount = harvestExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalAfterExpenses = totalRevenue - totalExpensesAmount;

  const sortedSales = useMemo(
    () => [...harvestSales].sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0)),
    [harvestSales],
  );
  const sortedExpenses = useMemo(
    () => [...harvestExpenses].sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0)),
    [harvestExpenses],
  );

  const title = harvest
    ? `Harvest • ${harvest.quantity.toLocaleString()} ${harvest.unit} • ${harvest.cropType}`
    : String(summary?.project_name ?? 'Harvest record');

  const headerSubtitle = harvest ? formatDate(harvest.date) : String(summary?.harvest_date ?? '');

  const rawPayload = harvest ?? summary ?? { harvestId, companyId };

  const summaryQuantity = summary?.quantity != null ? Number(summary.quantity) : null;
  const summaryUnit = summary?.unit != null ? String(summary.unit) : '—';
  const summaryValue = summary?.total_value != null ? Number(summary.total_value) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        draggable
        className="p-0 w-full sm:max-w-[680px] md:max-w-[820px] lg:max-w-[980px] xl:max-w-[1120px]"
      >
        <div className="border-b border-border/60 px-5 py-4">
          <SheetHeader className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="truncate">{title}</SheetTitle>
                <p className="text-xs text-muted-foreground truncate">{headerSubtitle}</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/30"
                onClick={() => onOpenChange(false)}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          </SheetHeader>
        </div>

        <div className="px-5 py-5 space-y-6">
          {!harvest && summary ? (
            <div className="fv-card p-4 space-y-3">
              <h3 className="text-lg font-semibold">Summary</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {String(summary.project_name ?? '—')} · {String(summary.project_crop ?? '—')}
              </p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">
                    {summaryQuantity != null && Number.isFinite(summaryQuantity) ? summaryQuantity.toLocaleString() : '—'} {summaryUnit}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                  <p className="text-xs text-muted-foreground">Buyer</p>
                  <p className="text-xl font-bold text-foreground mt-1 truncate">
                    {String(summary.buyer_name ?? '—')}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                  <p className="text-xs text-muted-foreground">Total value</p>
                  <p className="text-xl font-bold text-foreground mt-1 tabular-nums">
                    {summaryValue != null && Number.isFinite(summaryValue) ? formatCurrency(summaryValue) : '—'}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-xs text-muted-foreground">
                Full sales/expense breakdown is not available from the intelligence list row. Raw Payload below contains the source row.
              </div>
            </div>
          ) : !harvest ? (
            <div className="fv-card p-4">
              <p className="text-sm font-medium text-foreground">Loading harvest details…</p>
              <p className="text-xs text-muted-foreground mt-1">
                If this stays stuck, the harvest record may not be visible under current developer read scope.
              </p>
            </div>
          ) : (
            <>
              <div className="fv-card p-4">
                <h3 className="text-lg font-semibold">Summary</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(harvest.date)}
                  {harvest.destination === 'market' && harvest.marketName && ` • ${harvest.marketName}`}
                  {harvest.brokerName && ` • Broker: ${harvest.brokerName}`}
                </p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                    <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                    <p className="text-xs text-muted-foreground">Total Expenses</p>
                    <p className="text-xl font-bold text-destructive mt-1">{formatCurrency(totalExpensesAmount)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                    <p className="text-xs text-muted-foreground">After Expenses</p>
                    <p className={cn('text-xl font-bold mt-1', totalAfterExpenses >= 0 ? 'text-foreground' : 'text-destructive')}>
                      {formatCurrency(totalAfterExpenses)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="fv-card">
                <h3 className="text-lg font-semibold p-4 border-b">Sales</h3>
                {sortedSales.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No sales for this harvest.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="fv-table w-full">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Buyer</th>
                          <th>Quantity</th>
                          <th>Unit Price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSales.map((s) => (
                          <tr key={s.id}>
                            <td className="text-muted-foreground">{formatDate(s.date)}</td>
                            <td className="font-medium">{s.buyerName}</td>
                            <td>
                              {s.quantity.toLocaleString()} {s.unit ?? 'units'}
                            </td>
                            <td>{formatCurrency(s.unitPrice)}</td>
                            <td className="font-semibold">{formatCurrency(s.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="fv-card">
                <h3 className="text-lg font-semibold p-4 border-b">Expenses</h3>
                {sortedExpenses.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No expenses for this harvest.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="fv-table w-full">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Category</th>
                          <th>Description</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedExpenses.map((e) => (
                          <tr key={e.id}>
                            <td className="text-muted-foreground">{formatDate(e.date)}</td>
                            <td>{getExpenseCategoryLabel(e.category)}</td>
                            <td>{e.description || '—'}</td>
                            <td className="font-semibold">{formatCurrency(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          <DeveloperRawPayloadAccordion payload={rawPayload} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

