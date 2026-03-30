import React, { useMemo, useState } from 'react';
import { Calendar, Eye, HandCoins, Leaf, Package, Scale, UserRound } from 'lucide-react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDateShort, formatMoney, formatNumber } from './utils';
import { Button } from '@/components/ui/button';
import { DeveloperRecordDetailsSheet } from './DeveloperRecordDetailsSheet';

type Row = Record<string, unknown>;

type Props = {
  harvests: Row[];
  collections: Row[];
  metrics: Record<string, unknown> | undefined;
};

export function CompanyHarvestTab({ harvests, collections, metrics }: Props) {
  const [selected, setSelected] = useState<{ kind: 'collection' | 'harvest'; row: Row } | null>(null);

  const cropMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of harvests) {
      const c = String(h.project_crop ?? h.crop ?? 'Unknown');
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [harvests]);

  const hasHarvest = harvests.length > 0 || collections.length > 0;
  if (!hasHarvest) {
    return (
      <EmptyStateBlock
        title="No harvest data yet"
        description="Harvest sessions and sales records will show here once the farm logs harvests in FarmVault."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Harvest records" value={formatNumber(metrics?.harvest_records_total)} />
        <Stat label="Total quantity" value={formatNumber(metrics?.harvest_quantity_total, 2)} />
        <Stat label="Est. revenue" value={formatMoney(metrics?.harvest_revenue_total)} />
        <Stat label="Collections" value={formatNumber(metrics?.collections_total)} />
      </div>

      {cropMix.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/30 p-4">
          <h3 className="text-sm font-semibold">Crop types (from harvest rows)</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {cropMix.map(([crop, cnt]) => (
              <span
                key={crop}
                className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs text-foreground"
              >
                {crop}{' '}
                <span className="text-muted-foreground">({cnt})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">French beans collections</h3>
        <div className="fv-card overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-[800px] text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Collection</th>
                <th className="py-2 text-left font-medium">Project</th>
                <th className="py-2 text-right font-medium">Total kg</th>
                <th className="py-2 text-right font-medium">Pickers</th>
                <th className="py-2 text-right font-medium">Paid out</th>
                <th className="py-2 text-right font-medium">Buyer / unit</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Crop</th>
                <th className="py-2 text-right font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={String(c.id)} className="border-b border-border/40">
                  <td className="py-2 font-medium">{String(c.collection_label ?? '—')}</td>
                  <td className="py-2 text-muted-foreground max-w-[140px] truncate">{String(c.project_name ?? '—')}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(c.total_kg, 2)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(c.picker_count)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(c.total_paid)}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">
                    {formatMoney(c.buyer_price_per_unit)}
                    <span className="block text-[10px]">/{String(c.unit ?? 'kg')}</span>
                  </td>
                  <td className="py-2 text-xs">{String(c.status ?? '—')}</td>
                  <td className="py-2 text-xs text-muted-foreground">{String(c.crop_type ?? '—')}</td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2 text-xs"
                      onClick={() => setSelected({ kind: 'collection', row: c })}
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
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Harvest records</h3>
        <div className="fv-card overflow-x-auto">
          <table className="fv-table-mobile w-full min-w-[900px] text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 text-left font-medium">Project</th>
                <th className="py-2 text-left font-medium">Crop</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-left font-medium">Unit</th>
                <th className="py-2 text-right font-medium">Price / unit</th>
                <th className="py-2 text-right font-medium">Value</th>
                <th className="py-2 text-left font-medium">Buyer</th>
                <th className="py-2 text-left font-medium">Paid</th>
                <th className="py-2 text-left font-medium">Recorded by</th>
                <th className="py-2 text-right font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {harvests.map((h) => (
                <tr key={String(h.id)} className="border-b border-border/40">
                  <td className="py-2 text-xs">{formatDevDateShort(h.harvest_date as string)}</td>
                  <td className="py-2 max-w-[120px] truncate">{String(h.project_name ?? '—')}</td>
                  <td className="py-2 text-xs text-muted-foreground">{String(h.project_crop ?? '—')}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(h.quantity, 2)}</td>
                  <td className="py-2 text-xs">{String(h.unit ?? '—')}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(h.price_per_unit)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(h.total_value)}</td>
                  <td className="py-2 text-xs max-w-[100px] truncate">{String(h.buyer_name ?? '—')}</td>
                  <td className="py-2 text-xs">{h.buyer_paid === true ? 'Yes' : 'No'}</td>
                  <td className="py-2 font-mono text-[11px] text-muted-foreground">{String(h.created_by ?? '—')}</td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2 text-xs"
                      onClick={() => setSelected({ kind: 'harvest', row: h })}
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
      </div>

      <DeveloperRecordDetailsSheet
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        title={
          selected?.kind === 'collection'
            ? String(selected?.row.collection_label ?? 'Harvest collection')
            : String(selected?.row.project_name ?? 'Harvest record')
        }
        description={selected?.kind === 'collection' ? 'Harvest collection inspection (read-only).' : 'Harvest record inspection (read-only).'}
        recordId={selected ? String(selected.row.id ?? '') : null}
        sections={
          selected?.kind === 'collection'
            ? [
                {
                  title: 'Collection',
                  items: [
                    { label: 'Collection', value: <Inline icon={<Package className="h-4 w-4" />} value={String(selected.row.collection_label ?? '—')} /> },
                    { label: 'Project', value: String(selected.row.project_name ?? '—') },
                    { label: 'Status', value: String(selected.row.status ?? '—') },
                    { label: 'Crop', value: <Inline icon={<Leaf className="h-4 w-4" />} value={String(selected.row.crop_type ?? '—')} /> },
                  ],
                },
                {
                  title: 'Totals',
                  items: [
                    { label: 'Total kg', value: <Inline icon={<Scale className="h-4 w-4" />} value={formatNumber(selected.row.total_kg, 2)} /> },
                    { label: 'Pickers', value: <Inline icon={<UserRound className="h-4 w-4" />} value={formatNumber(selected.row.picker_count)} /> },
                    { label: 'Paid out', value: <Inline icon={<HandCoins className="h-4 w-4" />} value={formatMoney(selected.row.total_paid)} /> },
                    { label: 'Buyer price', value: formatMoney(selected.row.buyer_price_per_unit) },
                    { label: 'Unit', value: String(selected.row.unit ?? '—') },
                  ],
                },
              ]
            : [
                {
                  title: 'Harvest record',
                  items: [
                    { label: 'Project', value: String(selected?.row.project_name ?? '—') },
                    { label: 'Crop', value: <Inline icon={<Leaf className="h-4 w-4" />} value={String(selected?.row.project_crop ?? '—')} /> },
                    { label: 'Date', value: <Inline icon={<Calendar className="h-4 w-4" />} value={formatDevDateShort(selected?.row.harvest_date as string)} /> },
                    { label: 'Recorded by', value: String(selected?.row.created_by ?? '—'), mono: true },
                  ],
                },
                {
                  title: 'Quantity & pricing',
                  items: [
                    { label: 'Quantity', value: <Inline icon={<Scale className="h-4 w-4" />} value={formatNumber(selected?.row.quantity, 2)} /> },
                    { label: 'Unit', value: String(selected?.row.unit ?? '—') },
                    { label: 'Price / unit', value: formatMoney(selected?.row.price_per_unit) },
                    { label: 'Total value', value: formatMoney(selected?.row.total_value) },
                  ],
                },
                {
                  title: 'Buyer & settlement',
                  items: [
                    { label: 'Buyer', value: String(selected?.row.buyer_name ?? '—') },
                    { label: 'Buyer paid', value: selected?.row.buyer_paid === true ? 'Yes' : 'No' },
                  ],
                },
              ]
        }
        raw={selected?.row ?? undefined}
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
