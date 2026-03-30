import React, { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useInventoryItemStock, useInventoryTransactions, useInventoryUsage } from '@/hooks/useInventoryReadModels';
import { InventoryTransactionTimeline } from '@/components/inventory/InventoryTransactionTimeline';
import { InventoryUsageTable } from '@/components/inventory/InventoryUsageTable';
import { LowStockBadge } from '@/components/inventory/LowStockBadge';
import { Package, Truck, Tag, AlertTriangle } from 'lucide-react';
import { DeveloperRawPayloadAccordion } from './DeveloperRawPayloadAccordion';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  itemId: string;
  /** Summary row from the Developer Console inventory list (optional). */
  summary?: Record<string, unknown> | null;
};

const formatCurrency = (amount: number | null | undefined) => (amount != null ? `KES ${amount.toLocaleString()}` : 'KES 0');

export function DeveloperInventoryItemDetailsSheet({ open, onOpenChange, companyId, itemId, summary }: Props) {
  const { item, isLoading: itemLoading } = useInventoryItemStock(companyId, open ? itemId : null);
  const { transactions, isLoading: txLoading } = useInventoryTransactions(companyId, open ? itemId : null, 50);
  const { usage, isLoading: usageLoading } = useInventoryUsage(companyId, open ? itemId : null, 50);

  const title = item?.name ?? (summary?.name ? String(summary.name) : 'Inventory item');

  const rawPayload = useMemo(
    () => ({
      item: item ?? null,
      summary: summary ?? null,
      transactions,
      usage,
    }),
    [item, summary, transactions, usage],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        draggable
        className="p-0 w-full sm:max-w-[680px] md:max-w-[820px] lg:max-w-[980px] xl:max-w-[1120px]"
      >
        <div className="border-b border-border/60 px-5 py-4">
          <SheetHeader className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="truncate">{title}</SheetTitle>
                <p className="text-xs text-muted-foreground truncate">Developer read-only · Inventory details</p>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="px-5 py-5 space-y-6">
          {itemLoading && (
            <div className="fv-card p-4">
              <p className="text-sm text-muted-foreground">Loading inventory item…</p>
            </div>
          )}

          {!itemLoading && !item && (
            <div className="fv-card flex items-center gap-3 border-destructive/40 bg-destructive/5 p-4 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Inventory item not found</p>
                <p className="text-xs opacity-90">The item may have been deleted or is not visible under current scope.</p>
              </div>
            </div>
          )}

          {item && (
            <>
              <div className="fv-card p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-muted/30 flex items-center justify-center shrink-0 border border-border/60">
                    <Package className="w-7 h-7 text-muted-foreground" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold text-foreground truncate">{item.name}</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.category_name ?? item.category ?? 'Uncategorized'}
                        </p>
                        {item.supplier_name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Supplier: <span className="font-medium">{item.supplier_name}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-start sm:items-end gap-2">
                        <LowStockBadge
                          currentStock={item.current_stock ?? 0}
                          minThreshold={item.min_threshold ?? null}
                        />
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Current stock</p>
                          <p className="text-2xl font-bold text-foreground tabular-nums">
                            {(item.current_stock ?? 0).toLocaleString()} {item.unit ?? 'units'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <Stat icon={<Tag className="h-4 w-4" />} label="Category" value={String(item.category_name ?? item.category ?? '—')} />
                      <Stat icon={<Truck className="h-4 w-4" />} label="Supplier" value={String(item.supplier_name ?? '—')} />
                      <Stat icon={<Package className="h-4 w-4" />} label="Unit" value={String(item.unit ?? '—')} />
                      <Stat label="Min threshold" value={item.min_threshold != null ? String(item.min_threshold) : '—'} />
                      <Stat label="Average cost" value={formatCurrency(item.average_cost ?? null)} />
                      <Stat label="Stock value" value={formatCurrency(item.total_value ?? (item.current_stock ?? 0) * (item.average_cost ?? 0))} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="fv-card">
                <h3 className="text-lg font-semibold p-4 border-b">Transactions</h3>
                <div className="p-4">
                  <InventoryTransactionTimeline transactions={transactions ?? []} isLoading={txLoading} />
                </div>
              </div>

              <div className="fv-card">
                <h3 className="text-lg font-semibold p-4 border-b">Usage</h3>
                <div className="p-4">
                  <InventoryUsageTable usage={usage ?? []} isLoading={usageLoading} />
                </div>
              </div>
            </>
          )}

          <DeveloperRawPayloadAccordion payload={rawPayload} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <span className="text-sm font-semibold tabular-nums break-words">{value}</span>
      </div>
    </div>
  );
}

