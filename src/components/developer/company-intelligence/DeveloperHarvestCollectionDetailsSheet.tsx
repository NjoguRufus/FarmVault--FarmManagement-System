import React, { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Package, Scale, Users, Wallet, Calendar, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeveloperRawPayloadAccordion } from './DeveloperRawPayloadAccordion';
import {
  computeCollectionFinancials,
  getHarvestCollection,
  listHarvestCollectionProjectTransfers,
  listPickerIntakeByCollectionIds,
  listPickerPaymentsByCollectionIds,
  listPickersByCollectionIds,
} from '@/services/harvestCollectionsService';
import { formatDate } from '@/lib/dateUtils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  collectionId: string;
  /** Summary row from the developer collections table (optional). */
  summary?: Record<string, unknown> | null;
};

const formatMoney = (value: unknown) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'KES 0';
  return `KES ${Math.round(n).toLocaleString()}`;
};

const formatNumber = (value: unknown, decimals = 2) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
};

export function DeveloperHarvestCollectionDetailsSheet({ open, onOpenChange, companyId, collectionId, summary }: Props) {
  const { data: collection, isLoading, error } = useQuery({
    queryKey: ['developer-harvest-collection', collectionId],
    queryFn: () => getHarvestCollection(collectionId),
    enabled: open && Boolean(collectionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: pickers = [] } = useQuery({
    queryKey: ['developer-harvest-collection-pickers', collectionId],
    queryFn: () => listPickersByCollectionIds([collectionId]),
    enabled: open && Boolean(collectionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: intake = [] } = useQuery({
    queryKey: ['developer-harvest-collection-intake', collectionId],
    queryFn: () => listPickerIntakeByCollectionIds([collectionId]),
    enabled: open && Boolean(collectionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['developer-harvest-collection-payments', collectionId],
    queryFn: () => listPickerPaymentsByCollectionIds([collectionId]),
    enabled: open && Boolean(collectionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['developer-harvest-collection-transfers', companyId, collectionId],
    queryFn: () => listHarvestCollectionProjectTransfers({ companyId, collectionId }),
    enabled: open && Boolean(collectionId && companyId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const financials = useMemo(() => {
    if (!collection) return null;
    const computed = computeCollectionFinancials({
      collection,
      pickers: pickers as any,
      intakeEntries: intake as any,
      payments: payments as any,
    });
    return computed;
  }, [collection, pickers, intake, payments]);

  const title =
    String(summary?.collection_label ?? '').trim() ||
    (collection?.sequenceNumber != null ? `Collection #${collection.sequenceNumber}` : 'Harvest collection');

  const rawPayload = {
    collection: collection ?? summary ?? null,
    pickers,
    intake,
    payments,
    transfers,
  };

  const summaryTotalKg = summary?.total_kg != null ? Number(summary.total_kg) : null;
  const summaryPickerCount = summary?.picker_count != null ? Number(summary.picker_count) : null;
  const summaryPaidOut = summary?.total_paid != null ? Number(summary.total_paid) : null;
  const summaryBuyerPrice = summary?.buyer_price_per_unit != null ? Number(summary.buyer_price_per_unit) : null;
  const summaryUnit = summary?.unit != null ? String(summary.unit) : 'kg';
  const summaryStatus = summary?.status != null ? String(summary.status) : '—';
  const summaryProject = summary?.project_name != null ? String(summary.project_name) : '—';
  const summaryCrop = summary?.crop_type != null ? String(summary.crop_type) : '—';

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
                <p className="text-xs text-muted-foreground truncate">
                  French beans collection details (read-only).
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </SheetHeader>
        </div>

        <div className="px-5 py-5 space-y-6">
          {isLoading && (
            <div className="fv-card p-4">
              <p className="text-sm text-muted-foreground">Loading collection…</p>
            </div>
          )}

          {error && (
            <div className="fv-card flex items-center gap-3 border-destructive/40 bg-destructive/5 p-4 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Failed to load collection details</p>
                <p className="text-xs opacity-90">{(error as Error).message}</p>
              </div>
            </div>
          )}

          {!collection && summary ? (
            <div className="fv-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="text-base font-semibold truncate">{summaryProject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">Crop: {summaryCrop}</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-base font-semibold capitalize">{summaryStatus}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat icon={<Scale className="h-4 w-4" />} label="Total kg" value={summaryTotalKg != null && Number.isFinite(summaryTotalKg) ? formatNumber(summaryTotalKg, 2) : '—'} />
                <Stat icon={<Users className="h-4 w-4" />} label="Pickers" value={summaryPickerCount != null && Number.isFinite(summaryPickerCount) ? formatNumber(summaryPickerCount, 0) : '—'} />
                <Stat icon={<Wallet className="h-4 w-4" />} label="Paid out" value={summaryPaidOut != null && Number.isFinite(summaryPaidOut) ? formatMoney(summaryPaidOut) : '—'} />
                <Stat icon={<Package className="h-4 w-4" />} label="Unit" value={summaryUnit} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MiniRow label="Buyer price / unit" value={summaryBuyerPrice != null && Number.isFinite(summaryBuyerPrice) ? formatMoney(summaryBuyerPrice) : 'Not set'} icon={<Wallet className="h-4 w-4" />} />
                <MiniRow label="Collection label" value={String(summary.collection_label ?? '—')} icon={<Package className="h-4 w-4" />} />
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-xs text-muted-foreground">
                Full picker intake/payment breakdown requires collection table access. Raw Payload below contains the intelligence row plus any fetched child data.
              </div>
            </div>
          ) : null}

          {collection && (
            <>
              <div className="fv-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Harvest date</p>
                    <p className="text-base font-semibold">{formatDate(collection.harvestDate as any)}</p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-base font-semibold capitalize">{collection.status}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat icon={<Scale className="h-4 w-4" />} label="Total kg" value={formatNumber(financials?.totalKg ?? 0, 2)} />
                  <Stat icon={<Users className="h-4 w-4" />} label="Pickers" value={formatNumber(financials?.pickerCount ?? pickers.length, 0)} />
                  <Stat icon={<Wallet className="h-4 w-4" />} label="Total picker pay" value={formatMoney(financials?.totalPickerCost ?? 0)} />
                  <Stat icon={<Package className="h-4 w-4" />} label="Unit" value={String(collection.unit ?? 'kg')} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniRow label="Picker price / unit" value={formatMoney(collection.pricePerKgPicker)} icon={<Wallet className="h-4 w-4" />} />
                  <MiniRow label="Buyer price / unit" value={collection.pricePerKgBuyer != null ? formatMoney(collection.pricePerKgBuyer) : 'Not set'} icon={<Wallet className="h-4 w-4" />} />
                </div>
              </div>

              {transfers.length > 0 && (
                <div className="fv-card p-4">
                  <h3 className="text-sm font-semibold">Project transfers</h3>
                  <div className="mt-3 space-y-2">
                    {transfers.map((t) => (
                      <div key={t.id} className="rounded-lg border border-border/60 bg-card/30 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">Project change</span>
                          </div>
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {t.transferredAt ? new Date(t.transferredAt).toLocaleString() : '—'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground break-words">
                          From: {t.fromProjectId ?? '—'} → To: {t.toProjectId ?? '—'}
                        </p>
                        {t.reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {t.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="fv-card">
                <h3 className="text-lg font-semibold p-4 border-b">Pickers</h3>
                {pickers.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No pickers recorded for this collection.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="fv-table w-full">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Picker ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pickers.map((p: any) => (
                          <tr key={String(p.id)}>
                            <td className="text-muted-foreground">{String(p.picker_number ?? '—')}</td>
                            <td className="font-medium">{String(p.picker_name ?? '—')}</td>
                            <td className="font-mono text-xs text-muted-foreground">{String(p.id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="fv-card">
                <h3 className="text-lg font-semibold p-4 border-b">Intake entries</h3>
                {intake.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No intake entries recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="fv-table w-full">
                      <thead>
                        <tr>
                          <th>Recorded at</th>
                          <th>Picker</th>
                          <th className="text-right">Kg</th>
                          <th>Entry ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {intake.map((e: any) => (
                          <tr key={String(e.id)}>
                            <td className="text-muted-foreground">{e.recordedAt ? new Date(e.recordedAt).toLocaleString() : '—'}</td>
                            <td className="font-mono text-xs">{String(e.pickerId ?? '—')}</td>
                            <td className="text-right tabular-nums">{formatNumber(e.weightKg ?? 0, 2)}</td>
                            <td className="font-mono text-xs text-muted-foreground">{String(e.id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="fv-card">
                <h3 className="text-lg font-semibold p-4 border-b">Payments</h3>
                {payments.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="fv-table w-full">
                      <thead>
                        <tr>
                          <th>Paid at</th>
                          <th>Picker</th>
                          <th className="text-right">Amount</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p: any) => (
                          <tr key={String(p.id)}>
                            <td className="text-muted-foreground">{p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}</td>
                            <td className="font-mono text-xs">{String(p.picker_id ?? '—')}</td>
                            <td className="text-right font-semibold tabular-nums">{formatMoney(p.amount_paid)}</td>
                            <td className="text-muted-foreground">{String(p.note ?? '—')}</td>
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function MiniRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}

