import React, { useMemo, useState } from 'react';
import { Calendar, Eye, HandCoins, Leaf, Package, Scale, UserRound } from 'lucide-react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDateShort, formatMoney, formatNumber } from './utils';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DeveloperHarvestCollectionDetailsSheet } from './DeveloperHarvestCollectionDetailsSheet';
import { DeveloperHarvestRecordDetailsSheet } from './DeveloperHarvestRecordDetailsSheet';

type Row = Record<string, unknown>;

type Props = {
  companyId: string;
  harvests: Row[];
  collections: Row[];
  metrics: Record<string, unknown> | undefined;
};

type HarvestView = 'harvest-records' | 'collections';

export function CompanyHarvestTab({ companyId, harvests, collections, metrics }: Props) {
  const initialView: HarvestView = harvests.length > 0 ? 'harvest-records' : collections.length > 0 ? 'collections' : 'harvest-records';
  const [view, setView] = useState<HarvestView>(initialView);
  const [selectedHarvestId, setSelectedHarvestId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  const derivedMetrics = useMemo(() => {
    const harvestCount = harvests.length;
    const collectionsCount = collections.length;

    const harvestQty = harvests.reduce((sum, h) => {
      const n = Number(h.quantity ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    const collectionKg = collections.reduce((sum, c) => {
      const n = Number(c.total_kg ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    // "All round" quantity: include harvest sessions + collection totals
    const totalQuantity = harvestQty + collectionKg;

    const harvestRevenue = harvests.reduce((sum, h) => {
      const n = Number(h.total_value ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    const collectionsRevenue = collections.reduce((sum, c) => {
      const kg = Number(c.total_kg ?? 0);
      const price = Number(c.buyer_price_per_unit ?? 0);
      if (!Number.isFinite(kg) || !Number.isFinite(price)) return sum;
      return sum + kg * price;
    }, 0);

    return {
      harvestCount,
      collectionsCount,
      totalQuantity,
      estRevenue: harvestRevenue + collectionsRevenue,
    };
  }, [collections, harvests]);

  const metricsHarvestRecordsTotal = Number(metrics?.harvest_records_total ?? 0);
  const metricsCollectionsTotal = Number(metrics?.collections_total ?? 0);
  const metricsQuantityTotal = Number(metrics?.harvest_quantity_total ?? 0);
  const metricsRevenueTotal = Number(metrics?.harvest_revenue_total ?? 0);

  const displayHarvestRecordsTotal =
    Number.isFinite(metricsHarvestRecordsTotal) && metricsHarvestRecordsTotal > 0
      ? metricsHarvestRecordsTotal
      : derivedMetrics.harvestCount;
  const displayCollectionsTotal =
    Number.isFinite(metricsCollectionsTotal) && metricsCollectionsTotal > 0
      ? metricsCollectionsTotal
      : derivedMetrics.collectionsCount;
  const displayTotalQuantity =
    Number.isFinite(metricsQuantityTotal) && metricsQuantityTotal > 0
      ? metricsQuantityTotal
      : derivedMetrics.totalQuantity;
  const displayEstRevenue =
    Number.isFinite(metricsRevenueTotal) && metricsRevenueTotal > 0
      ? metricsRevenueTotal
      : derivedMetrics.estRevenue;

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
        <Stat label="Harvest records" value={formatNumber(displayHarvestRecordsTotal)} />
        <Stat label="Total quantity" value={formatNumber(displayTotalQuantity, 2)} />
        <Stat label="Est. revenue" value={formatMoney(displayEstRevenue)} />
        <Stat label="Collections" value={formatNumber(displayCollectionsTotal)} />
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Harvest</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Toggle between harvest sessions and French beans collections.</p>
          </div>
          <div className="inline-flex rounded-xl border border-border/60 bg-muted/30 p-1">
            <button
              type="button"
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                view === 'harvest-records' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setView('harvest-records')}
            >
              Harvest Records
            </button>
            <button
              type="button"
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                view === 'collections' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setView('collections')}
            >
              French Beans Collections
            </button>
          </div>
        </div>
      </div>

      {view === 'collections' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">French beans harvest collections.</p>
          </div>
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
                  <tr
                    key={String(c.id)}
                    className="border-b border-border/40 hover:bg-muted/20 cursor-pointer"
                    onClick={() => setSelectedCollectionId(String(c.id ?? ''))}
                    role="button"
                    aria-label={`View collection ${String(c.collection_label ?? c.id ?? '')}`}
                  >
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
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedCollectionId(String(c.id ?? ''));
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Harvest records (sales-linked sessions).</p>
          </div>
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
                  <tr
                    key={String(h.id)}
                    className="border-b border-border/40 hover:bg-muted/20 cursor-pointer"
                    onClick={() => setSelectedHarvestId(String(h.id ?? ''))}
                    role="button"
                    aria-label={`View harvest record ${String(h.project_name ?? h.id ?? '')}`}
                  >
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
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedHarvestId(String(h.id ?? ''));
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DeveloperHarvestRecordDetailsSheet
        open={Boolean(selectedHarvestId)}
        onOpenChange={(o) => !o && setSelectedHarvestId(null)}
        companyId={companyId}
        harvestId={selectedHarvestId ?? ''}
        summary={
          selectedHarvestId
            ? harvests.find((h) => String(h.id ?? '') === selectedHarvestId) ?? null
            : null
        }
      />

      <DeveloperHarvestCollectionDetailsSheet
        open={Boolean(selectedCollectionId)}
        onOpenChange={(o) => !o && setSelectedCollectionId(null)}
        companyId={companyId}
        collectionId={selectedCollectionId ?? ''}
        summary={
          selectedCollectionId
            ? collections.find((c) => String(c.id ?? '') === selectedCollectionId) ?? null
            : null
        }
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
