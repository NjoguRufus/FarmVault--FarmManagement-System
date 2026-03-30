import React, { useMemo, useState } from 'react';
import { Eye, FileText, Package, Tag, Truck } from 'lucide-react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDateShort, formatNumber } from './utils';
import { Button } from '@/components/ui/button';
import { DeveloperRecordDetailsSheet } from './DeveloperRecordDetailsSheet';
import { DeveloperInventoryItemDetailsSheet } from './DeveloperInventoryItemDetailsSheet';

type Row = Record<string, unknown>;

type Props = {
  companyId: string;
  items: Row[];
  audit: Row[];
  metrics: Record<string, unknown> | undefined;
};

export function CompanyInventoryTab({ companyId, items, audit, metrics }: Props) {
  const [selectedItem, setSelectedItem] = useState<Row | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<Row | null>(null);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) {
      const c = String(i.category ?? '').trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort();
  }, [items]);

  if (!items.length) {
    return (
      <EmptyStateBlock
        title="No inventory items"
        description="Stock records will appear after the farm adds inventory in FarmVault."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Items" value={formatNumber(metrics?.inventory_items_total)} />
        <Stat label="Low stock" value={formatNumber(metrics?.inventory_low_stock)} />
        <Stat label="Out of stock" value={formatNumber(metrics?.inventory_out_of_stock)} />
        <Stat label="Categories in use" value={formatNumber(categories.length)} />
      </div>

      {categories.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/30 p-4">
          <h3 className="text-sm font-semibold">Categories</h3>
          <p className="mt-2 text-xs text-muted-foreground">{categories.join(' · ')}</p>
        </div>
      )}

      {audit.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Recent stock audit events</h3>
          <div className="fv-card max-h-48 overflow-y-auto p-3 text-xs space-y-2">
            {audit.map((a) => (
              <div
                key={String(a.id)}
                className="flex items-center justify-between gap-2 border-b border-border/30 pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{String(a.action ?? '—')}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{String(a.item_name ?? a.inventory_item_name ?? '—')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">{formatDevDateShort(a.created_at as string)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => setSelectedAudit(a)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fv-card overflow-x-auto">
        <table className="fv-table-mobile w-full min-w-[760px] text-sm">
          <thead className="border-b border-border/60 text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-left font-medium">Item</th>
              <th className="py-2 text-left font-medium">Category</th>
              <th className="py-2 text-left font-medium">Unit</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-left font-medium">Status</th>
              <th className="py-2 text-left font-medium">Supplier</th>
              <th className="py-2 text-left font-medium">Updated</th>
              <th className="py-2 text-right font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={String(i.id)} className="border-b border-border/40">
                <td className="py-2 font-medium max-w-[180px] truncate">{String(i.name ?? '—')}</td>
                <td className="py-2 text-xs text-muted-foreground">{String(i.category ?? '—')}</td>
                <td className="py-2 text-xs">{String(i.unit ?? '—')}</td>
                <td className="py-2 text-right tabular-nums">{formatNumber(i.current_quantity, 2)}</td>
                <td className="py-2 text-xs">{String(i.stock_status ?? '—')}</td>
                <td className="py-2 text-xs max-w-[120px] truncate">{String(i.supplier_name ?? '—')}</td>
                <td className="py-2 text-xs text-muted-foreground">{formatDevDateShort(i.last_updated as string)}</td>
                <td className="py-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={() => setSelectedItem(i)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeveloperInventoryItemDetailsSheet
        open={Boolean(selectedItem)}
        onOpenChange={(o) => !o && setSelectedItem(null)}
        companyId={companyId}
        itemId={selectedItem ? String(selectedItem.id ?? '') : ''}
        summary={selectedItem}
      />

      <DeveloperRecordDetailsSheet
        open={Boolean(selectedAudit)}
        onOpenChange={(o) => !o && setSelectedAudit(null)}
        title={String(selectedAudit?.action ?? 'Inventory audit')}
        description="Inventory audit event inspection (read-only)."
        recordId={selectedAudit ? String(selectedAudit.id ?? '') : null}
        sections={[
          {
            title: 'Event',
            items: [
              { label: 'Action', value: <Inline icon={<FileText className="h-4 w-4" />} value={String(selectedAudit?.action ?? '—')} /> },
              { label: 'Item', value: String(selectedAudit?.item_name ?? selectedAudit?.inventory_item_name ?? '—') },
              { label: 'Quantity', value: String(selectedAudit?.quantity ?? selectedAudit?.delta ?? '—') },
              { label: 'At', value: formatDevDateShort(selectedAudit?.created_at as string) },
              { label: 'Actor', value: String(selectedAudit?.created_by ?? selectedAudit?.actor ?? '—'), mono: true },
              { label: 'Notes', value: String(selectedAudit?.notes ?? '—') },
            ],
          },
        ]}
        raw={selectedAudit ?? undefined}
      />
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

function Inline({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">{value}</span>
    </span>
  );
}
