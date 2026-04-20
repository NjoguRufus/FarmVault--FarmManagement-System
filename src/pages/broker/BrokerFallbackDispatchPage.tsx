import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Package, Plus, Receipt, Search, TrendingUp, Truck, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useBrokerTomatoRealtime } from '@/hooks/useBrokerTomatoRealtime';
import { fetchFallbackMarketDispatchByIdForBroker } from '@/services/brokerFallbackMarketService';
import {
  addFallbackMarketExpenseLines,
  addFallbackMarketSalesEntry,
  updateFallbackMarketSalesEntry,
  updateFallbackMarketSalesEntryBrokerRecord,
  fetchFallbackSession,
  listFallbackExpenseTemplates,
  listFallbackMarketExpenseLines,
  listFallbackMarketSalesEntries,
  recordFallbackExpenseTemplateUsage,
  updateFallbackMarketDispatchStatus,
  type FallbackMarketSalesEntryRow,
} from '@/services/fallbackHarvestService';
import { cn } from '@/lib/utils';
import { MarketNotebookBuyerRow } from '@/components/harvest/MarketNotebookBuyerRow';
import { EditMarketSalesBuyerDialog } from '@/components/harvest/EditMarketSalesBuyerDialog';
import { BrokerBuyerLedgerDialog } from '@/components/broker/BrokerBuyerLedgerDialog';
import { brokerBuyerSearchMatches } from '@/lib/brokerBuyerSearch';

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

function kes(n: number) {
  return formatKes(n);
}

function fmtUnits(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return n.toLocaleString('en-KE');
  return (Math.round(n * 100) / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 });
}

type ExpenseDraftRow = { id: string; name: string; amount: string };

export default function BrokerFallbackDispatchPage() {
  const { dispatchId } = useParams<{ dispatchId: string }>();
  const { user } = useAuth();
  const editorUserId = user?.id ?? null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;

  useBrokerTomatoRealtime(companyId, queryClient);

  const inv = () => {
    if (!companyId || !dispatchId) return;
    void queryClient.invalidateQueries({ queryKey: ['broker-assigned-dispatches', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['broker-fallback-dispatch', companyId, dispatchId] });
    void queryClient.invalidateQueries({ queryKey: ['broker-fallback-sales', companyId, dispatchId] });
    void queryClient.invalidateQueries({ queryKey: ['broker-fallback-expenses', companyId, dispatchId] });
  };

  const { data: dispatch, isLoading: loadD } = useQuery({
    queryKey: ['broker-fallback-dispatch', companyId ?? '', dispatchId ?? ''],
    queryFn: () => fetchFallbackMarketDispatchByIdForBroker({ companyId: companyId!, dispatchId: dispatchId! }),
    enabled: Boolean(companyId && dispatchId),
  });

  const { data: fallbackSession } = useQuery({
    queryKey: ['fallback-harvest-session', companyId, dispatch?.harvest_session_id],
    queryFn: () =>
      fetchFallbackSession({ companyId: companyId!, sessionId: dispatch!.harvest_session_id }),
    enabled: Boolean(companyId && dispatch?.harvest_session_id),
  });

  const buyerUnitLabel = (fallbackSession?.unit_type || 'units').trim().toLowerCase() || 'units';

  const { data: entries = [], isLoading: loadE } = useQuery({
    queryKey: ['broker-fallback-sales', companyId ?? '', dispatchId ?? ''],
    queryFn: () => listFallbackMarketSalesEntries({ companyId: companyId!, dispatchId: dispatchId! }),
    enabled: Boolean(companyId && dispatchId),
  });

  const { data: expenseLines = [], isLoading: loadX } = useQuery({
    queryKey: ['broker-fallback-expenses', companyId ?? '', dispatchId ?? ''],
    queryFn: () => listFallbackMarketExpenseLines({ companyId: companyId!, dispatchId: dispatchId! }),
    enabled: Boolean(companyId && dispatchId),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['broker-fallback-templates', companyId ?? ''],
    queryFn: () => listFallbackExpenseTemplates({ companyId: companyId!, limit: 80 }),
    enabled: Boolean(companyId),
  });

  const unitsSold = useMemo(() => entries.reduce((s, e) => s + e.quantity, 0), [entries]);
  const sent = dispatch?.units_sent ?? 0;
  const remaining = Math.max(0, sent - unitsSold);

  const priceStats = useMemo(() => {
    if (!entries.length) return { avg: 0, min: 0, max: 0 };
    const prices = entries.map((e) => e.price_per_unit);
    const sum = prices.reduce((a, b) => a + b, 0);
    return {
      avg: sum / prices.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }, [entries]);

  const liveRevenue = useMemo(
    () => entries.reduce((s, e) => s + (Number.isFinite(e.line_total) ? e.line_total : 0), 0),
    [entries],
  );
  const liveExpenses = useMemo(
    () => expenseLines.reduce((s, x) => s + (Number.isFinite(x.amount) ? x.amount : 0), 0),
    [expenseLines],
  );
  const liveNet = liveRevenue - liveExpenses;

  const [buyerOpen, setBuyerOpen] = useState(false);
  const [buyerLabel, setBuyerLabel] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerPrice, setBuyerPrice] = useState('');
  const [buyerQty, setBuyerQty] = useState('1');
  const [savingBuyer, setSavingBuyer] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState('');

  const [expOpen, setExpOpen] = useState(false);
  const [expRows, setExpRows] = useState<ExpenseDraftRow[]>([
    { id: crypto.randomUUID(), name: '', amount: '' },
  ]);
  const [savingExp, setSavingExp] = useState(false);

  const [statusSaving, setStatusSaving] = useState(false);

  const [editingEntry, setEditingEntry] = useState<FallbackMarketSalesEntryRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [ledgerEntry, setLedgerEntry] = useState<FallbackMarketSalesEntryRow | null>(null);
  const [savingLedger, setSavingLedger] = useState(false);

  const filteredEntries = useMemo(
    () => entries.filter((e) => brokerBuyerSearchMatches(e, buyerSearch)),
    [entries, buyerSearch],
  );

  const addBuyer = async () => {
    if (!companyId || !dispatchId) return;
    const price = Number(buyerPrice);
    const qty = Math.max(0, Number(buyerQty) || 0);
    if (!Number.isFinite(price) || price < 0) {
      toast({ title: 'Enter a valid price', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: 'Enter a valid quantity', variant: 'destructive' });
      return;
    }
    setSavingBuyer(true);
    try {
      await addFallbackMarketSalesEntry({
        companyId,
        dispatchId,
        buyerLabel: buyerLabel.trim() || null,
        buyerPhone: buyerPhone.trim() || null,
        pricePerUnit: price,
        quantity: qty,
      });
      inv();
      setBuyerOpen(false);
      setBuyerLabel('');
      setBuyerPhone('');
      setBuyerPrice('');
      setBuyerQty('1');
      toast({ title: 'Buyer added' });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingBuyer(false);
    }
  };

  const saveEditedBuyer = async (payload: {
    buyerLabel: string | null;
    quantity: number;
    pricePerUnit: number;
    editReason: string;
  }) => {
    if (!companyId || !editingEntry) return;
    setSavingEdit(true);
    try {
      await updateFallbackMarketSalesEntry({
        companyId,
        entryId: editingEntry.id,
        buyerLabel: payload.buyerLabel,
        quantity: payload.quantity,
        pricePerUnit: payload.pricePerUnit,
        editReason: payload.editReason,
        editorUserId,
      });
      inv();
      setEditingEntry(null);
      toast({ title: 'Buyer line updated' });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const saveLedgerCollected = async (payload: { buyerPhone: string | null; amountPaidNow: number }) => {
    if (!companyId || !ledgerEntry) return;
    setSavingLedger(true);
    try {
      const prev =
        ledgerEntry.broker_payment_kind === 'collected' && ledgerEntry.broker_collected_amount != null
          ? Math.max(0, Number(ledgerEntry.broker_collected_amount) || 0)
          : 0;
      const next = prev + Math.max(0, Math.round(Number(payload.amountPaidNow) || 0));
      await updateFallbackMarketSalesEntryBrokerRecord({
        companyId,
        entryId: ledgerEntry.id,
        buyerPhone: payload.buyerPhone,
        brokerPaymentKind: 'collected',
        brokerCollectedAmount: next,
      });
      inv();
      setLedgerEntry(null);
      toast({ title: 'Payment recorded' });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingLedger(false);
    }
  };

  const saveLedgerDebt = async (payload: { buyerPhone: string | null }) => {
    if (!companyId || !ledgerEntry) return;
    setSavingLedger(true);
    try {
      await updateFallbackMarketSalesEntryBrokerRecord({
        companyId,
        entryId: ledgerEntry.id,
        buyerPhone: payload.buyerPhone,
        brokerPaymentKind: 'debt',
        brokerCollectedAmount: null,
      });
      inv();
      setLedgerEntry(null);
      toast({ title: 'Marked as debt (pay later)' });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingLedger(false);
    }
  };

  const clearLedgerRecord = async (payload: { buyerPhone: string | null }) => {
    if (!companyId || !ledgerEntry) return;
    setSavingLedger(true);
    try {
      await updateFallbackMarketSalesEntryBrokerRecord({
        companyId,
        entryId: ledgerEntry.id,
        buyerPhone: payload.buyerPhone,
        brokerPaymentKind: null,
        brokerCollectedAmount: null,
      });
      inv();
      setLedgerEntry(null);
      toast({ title: 'Payment status cleared' });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingLedger(false);
    }
  };

  const saveExpenses = async () => {
    if (!companyId || !dispatchId) return;
    const lines = expRows
      .map((r) => ({
        category: r.name.trim(),
        amount: Math.max(0, Math.round(Number(r.amount) || 0)),
      }))
      .filter((r) => r.category.length > 0 && r.amount > 0);
    if (lines.length === 0) {
      toast({ title: 'Add at least one line with name and amount', variant: 'destructive' });
      return;
    }
    setSavingExp(true);
    try {
      await addFallbackMarketExpenseLines({ companyId, dispatchId, lines });
      for (const l of lines) {
        await recordFallbackExpenseTemplateUsage({ companyId, name: l.category, lastUsedAmount: l.amount });
      }
      void queryClient.invalidateQueries({ queryKey: ['broker-fallback-templates', companyId] });
      inv();
      setExpOpen(false);
      setExpRows([{ id: crypto.randomUUID(), name: '', amount: '' }]);
      toast({ title: 'Expenses saved' });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingExp(false);
    }
  };

  const toggleComplete = async () => {
    if (!companyId || !dispatchId || !dispatch) return;
    setStatusSaving(true);
    try {
      await updateFallbackMarketDispatchStatus({
        companyId,
        dispatchId,
        status: dispatch.status === 'completed' ? 'pending' : 'completed',
      });
      inv();
      toast({ title: dispatch.status === 'completed' ? 'Marked open' : 'Marked complete' });
    } catch {
      toast({ title: 'Could not update status', variant: 'destructive' });
    } finally {
      setStatusSaving(false);
    }
  };

  if (!dispatchId) {
    return <p className="p-4 text-sm text-muted-foreground">Missing dispatch.</p>;
  }

  if (loadD && !dispatch) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!loadD && !dispatch) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">This dispatch is not available or not assigned to you.</p>
        <Button type="button" variant="outline" onClick={() => navigate('/broker')}>
          Back
        </Button>
      </div>
    );
  }

  const statCardClass =
    'py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation';

  return (
    <div className="space-y-5 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 animate-fade-in w-full min-h-[calc(100dvh-10.5rem)]">
      <button
        type="button"
        className="fv-btn fv-btn--secondary flex w-fit items-center gap-2"
        onClick={() => navigate('/broker')}
      >
        <ChevronLeft className="h-4 w-4" />
        All dispatches
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{dispatch!.market_name}</h1>
          <p className="text-sm text-muted-foreground">Notebook · units sold vs sent</p>
        </div>
      </div>

      <div
        className={cn(
          'grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3',
          'lg:grid-cols-5',
        )}
      >
        <SimpleStatCard
          layout="mobile-compact"
          title="Sold / sent"
          value={`${fmtUnits(unitsSold)}${sent > 0 ? ` / ${fmtUnits(sent)}` : ''}`}
          icon={Truck}
          iconVariant="primary"
          className={statCardClass}
        />
        <SimpleStatCard
          layout="mobile-compact"
          title="Remaining"
          value={fmtUnits(remaining)}
          icon={Package}
          iconVariant="primary"
          className={statCardClass}
        />
        <SimpleStatCard
          layout="mobile-compact"
          title="Revenue"
          value={formatKes(liveRevenue)}
          icon={TrendingUp}
          iconVariant="gold"
          valueVariant="success"
          subtitle="From buyer lines"
          className={statCardClass}
        />
        <SimpleStatCard
          layout="mobile-compact"
          title="Expenses"
          value={formatKes(liveExpenses)}
          icon={Receipt}
          iconVariant="gold"
          className={statCardClass}
        />
        <SimpleStatCard
          layout="mobile-compact"
          title="Net"
          value={formatKes(liveNet)}
          icon={Wallet}
          iconVariant="muted"
          valueVariant={liveNet >= 0 ? 'info' : 'destructive'}
          className={cn(statCardClass, 'col-span-2 sm:col-span-1 lg:col-span-1')}
        />
      </div>

      {entries.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Avg {kes(Math.round(priceStats.avg))} · Min {kes(Math.round(priceStats.min))} · Max{' '}
          {kes(Math.round(priceStats.max))}
        </p>
      )}

      <div className="flex w-full gap-2">
        <Button
          type="button"
          variant={dispatch!.status === 'completed' ? 'outline' : 'default'}
          size="default"
          className="min-h-11 w-full flex-1 touch-manipulation"
          disabled={statusSaving}
          onClick={() => void toggleComplete()}
        >
          {statusSaving ? '…' : dispatch!.status === 'completed' ? 'Reopen dispatch' : 'Mark complete'}
        </Button>
      </div>

      <Tabs defaultValue="buyers" className="w-full">
        <TabsList className="grid h-11 w-full max-w-none grid-cols-2 rounded-lg">
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="buyers" className="mt-4 space-y-3">
          <div className="flex w-full min-w-0 flex-row flex-nowrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="h-11 min-w-0 pl-9 touch-manipulation"
                value={buyerSearch}
                onChange={(e) => setBuyerSearch(e.target.value)}
                placeholder="Search by name or phone…"
                aria-label="Search buyers by name or phone"
              />
            </div>
            <Button
              type="button"
              className="h-11 shrink-0 touch-manipulation whitespace-nowrap"
              onClick={() => setBuyerOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4 shrink-0" />
              Add buyer
            </Button>
          </div>
          {loadE && <p className="text-sm text-muted-foreground">Loading…</p>}
          <div className="space-y-2">
            {filteredEntries.map((e) => (
              <MarketNotebookBuyerRow
                key={e.id}
                entryNumber={e.entry_number}
                buyerLabel={e.buyer_label}
                buyerPhone={e.buyer_phone}
                brokerPaymentKind={e.broker_payment_kind}
                brokerCollectedAmount={e.broker_collected_amount}
                quantity={e.quantity}
                pricePerUnit={e.price_per_unit}
                lineTotal={e.line_total}
                unitLabel={buyerUnitLabel}
                formatKes={formatKes}
                onCardClick={() => setLedgerEntry(e)}
                onEdit={
                  dispatch?.status !== 'completed'
                    ? () => setEditingEntry(e)
                    : undefined
                }
              />
            ))}
          </div>
          {!loadE && entries.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/80 py-16 text-center text-sm text-muted-foreground">
              No buyers yet.
            </p>
          )}
          {!loadE && entries.length > 0 && filteredEntries.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/80 py-8 text-center text-sm text-muted-foreground">
              No buyers match your search.
            </p>
          )}
        </TabsContent>
        <TabsContent value="expenses" className="mt-4 space-y-3">
          <Button type="button" variant="secondary" className="w-full" onClick={() => setExpOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add expenses
          </Button>
          {loadX && <p className="text-sm text-muted-foreground">Loading…</p>}
          <ul className="space-y-2">
            {expenseLines.map((x) => (
              <li
                key={x.id}
                className="flex justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{x.category}</span>
                <span className="tabular-nums">{kes(x.amount)}</span>
              </li>
            ))}
          </ul>
          {!loadX && expenseLines.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/80 py-16 text-center text-sm text-muted-foreground">
              No expenses yet.
            </p>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={buyerOpen} onOpenChange={setBuyerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add buyer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Buyer name (optional)</Label>
              <Input value={buyerLabel} onChange={(e) => setBuyerLabel(e.target.value)} placeholder="e.g. John" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone (optional, for search)</Label>
              <Input
                inputMode="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="e.g. 0712…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Price per unit (KES)</Label>
              <Input
                inputMode="decimal"
                value={buyerPrice}
                onChange={(e) => setBuyerPrice(e.target.value)}
                placeholder="30000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quantity</Label>
              <Input inputMode="decimal" value={buyerQty} onChange={(e) => setBuyerQty(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setBuyerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={savingBuyer} onClick={() => void addBuyer()}>
              {savingBuyer ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BrokerBuyerLedgerDialog
        open={ledgerEntry != null}
        onOpenChange={(o) => {
          if (!o) setLedgerEntry(null);
        }}
        entry={
          ledgerEntry
            ? {
                id: ledgerEntry.id,
                entry_number: ledgerEntry.entry_number,
                buyer_label: ledgerEntry.buyer_label,
                buyer_phone: ledgerEntry.buyer_phone,
                line_total: ledgerEntry.line_total,
                broker_payment_kind: ledgerEntry.broker_payment_kind,
                broker_collected_amount: ledgerEntry.broker_collected_amount,
              }
            : null
        }
        formatKes={formatKes}
        onRecordPayment={(p) => void saveLedgerCollected(p)}
        onMarkDebt={(p) => void saveLedgerDebt(p)}
        onClearRecord={(p) => void clearLedgerRecord(p)}
        isSaving={savingLedger}
      />

      <EditMarketSalesBuyerDialog
        open={editingEntry != null}
        onOpenChange={(o) => {
          if (!o) setEditingEntry(null);
        }}
        entry={
          editingEntry
            ? {
                id: editingEntry.id,
                buyer_label: editingEntry.buyer_label,
                quantity: editingEntry.quantity,
                price_per_unit: editingEntry.price_per_unit,
              }
            : null
        }
        unitLabel={buyerUnitLabel}
        quantityMode="decimal"
        onSave={saveEditedBuyer}
        isSaving={savingEdit}
      />

      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Market expenses</DialogTitle>
            <p className="text-xs text-muted-foreground">Add one or more lines. Names are remembered for next time.</p>
          </DialogHeader>
          <datalist id="broker-fallback-expense-templates">
            {templates.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
          <div className="space-y-3 py-2">
            {expRows.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-5 gap-2 items-end">
                <div className="col-span-3 space-y-1">
                  {idx === 0 ? <Label className="text-xs">Name</Label> : <span className="text-xs block h-4" />}
                  <Input
                    list="broker-fallback-expense-templates"
                    value={row.name}
                    placeholder="Storage"
                    onChange={(e) => {
                      const v = e.target.value;
                      setExpRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, name: v } : r)));
                      const tpl = templates.find((t) => t.name.toLowerCase() === v.trim().toLowerCase());
                      if (tpl?.last_used_amount != null) {
                        setExpRows((rs) =>
                          rs.map((r) =>
                            r.id === row.id ? { ...r, amount: String(Math.round(tpl.last_used_amount!)) } : r,
                          ),
                        );
                      }
                    }}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  {idx === 0 ? <Label className="text-xs">Amount</Label> : <span className="text-xs block h-4" />}
                  <Input
                    inputMode="numeric"
                    value={row.amount}
                    placeholder="50000"
                    onChange={(e) => {
                      const v = e.target.value;
                      setExpRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, amount: v } : r)));
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpRows((r) => [...r, { id: crypto.randomUUID(), name: '', amount: '' }])}
              >
                Add Another Expense
              </Button>
              <p className="text-xs font-medium tabular-nums">
                Total{' '}
                {kes(
                  expRows.reduce((s, r) => s + Math.max(0, Math.round(Number(r.amount) || 0)), 0),
                )}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setExpOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={savingExp} onClick={() => void saveExpenses()}>
              {savingExp ? 'Saving…' : 'Save all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
