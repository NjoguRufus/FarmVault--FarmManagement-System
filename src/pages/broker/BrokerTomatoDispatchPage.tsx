import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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
import {
  applyTomatoMarketExpenseTemplateUsage,
  deleteTomatoMarketSalesEntry,
  fetchTomatoMarketDispatchById,
  insertTomatoMarketExpenseLines,
  insertTomatoMarketSalesEntry,
  listTomatoMarketExpenseLines,
  listTomatoMarketExpenseTemplates,
  listTomatoMarketSalesEntries,
  updateTomatoMarketDispatchStatus,
} from '@/services/brokerTomatoMarketService';
import { cn } from '@/lib/utils';

function kes(n: number) {
  return `KES ${Math.round(n).toLocaleString()}`;
}

type ExpenseDraftRow = { id: string; name: string; amount: string };

export default function BrokerTomatoDispatchPage() {
  const { dispatchId } = useParams<{ dispatchId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;

  useBrokerTomatoRealtime(companyId, queryClient);

  const inv = () => {
    if (!companyId || !dispatchId) return;
    void queryClient.invalidateQueries({ queryKey: ['broker-tomato-dispatch', companyId, dispatchId] });
    void queryClient.invalidateQueries({ queryKey: ['broker-tomato-sales', companyId, dispatchId] });
    void queryClient.invalidateQueries({ queryKey: ['broker-tomato-expenses', companyId, dispatchId] });
  };

  const { data: dispatch, isLoading: loadD } = useQuery({
    queryKey: ['broker-tomato-dispatch', companyId ?? '', dispatchId ?? ''],
    queryFn: () => fetchTomatoMarketDispatchById({ companyId: companyId!, dispatchId: dispatchId! }),
    enabled: Boolean(companyId && dispatchId),
  });

  const { data: entries = [], isLoading: loadE } = useQuery({
    queryKey: ['broker-tomato-sales', companyId ?? '', dispatchId ?? ''],
    queryFn: () => listTomatoMarketSalesEntries({ companyId: companyId!, dispatchId: dispatchId! }),
    enabled: Boolean(companyId && dispatchId),
  });

  const { data: expenseLines = [], isLoading: loadX } = useQuery({
    queryKey: ['broker-tomato-expenses', companyId ?? '', dispatchId ?? ''],
    queryFn: () => listTomatoMarketExpenseLines({ companyId: companyId!, dispatchId: dispatchId! }),
    enabled: Boolean(companyId && dispatchId),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['broker-tomato-templates', companyId ?? ''],
    queryFn: () => listTomatoMarketExpenseTemplates(companyId!),
    enabled: Boolean(companyId),
  });

  const cratesSold = useMemo(() => entries.reduce((s, e) => s + e.quantity, 0), [entries]);
  const sent = dispatch?.containers_sent ?? 0;
  const remaining = Math.max(0, sent - cratesSold);

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

  const rev = Number(dispatch?.broker_sales_revenue ?? dispatch?.total_revenue ?? 0);
  const exp = Number(dispatch?.market_expenses_total ?? 0);
  const net = Number(dispatch?.net_market_profit ?? 0);

  const [buyerOpen, setBuyerOpen] = useState(false);
  const [buyerLabel, setBuyerLabel] = useState('');
  const [buyerPrice, setBuyerPrice] = useState('');
  const [buyerQty, setBuyerQty] = useState('1');
  const [savingBuyer, setSavingBuyer] = useState(false);

  const [expOpen, setExpOpen] = useState(false);
  const [expRows, setExpRows] = useState<ExpenseDraftRow[]>([
    { id: crypto.randomUUID(), name: '', amount: '' },
  ]);
  const [savingExp, setSavingExp] = useState(false);

  const [statusSaving, setStatusSaving] = useState(false);

  const addBuyer = async () => {
    if (!companyId || !dispatchId) return;
    const price = Number(buyerPrice);
    const qty = Math.max(1, Math.floor(Number(buyerQty) || 1));
    if (!Number.isFinite(price) || price < 0) {
      toast({ title: 'Enter a valid price', variant: 'destructive' });
      return;
    }
    setSavingBuyer(true);
    try {
      await insertTomatoMarketSalesEntry({
        companyId,
        dispatchId,
        buyerLabel: buyerLabel.trim() || null,
        pricePerUnit: price,
        quantity: qty,
      });
      inv();
      setBuyerOpen(false);
      setBuyerLabel('');
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

  const removeBuyer = async (entryId: string) => {
    if (!companyId) return;
    try {
      await deleteTomatoMarketSalesEntry({ companyId, entryId });
      inv();
      toast({ title: 'Removed' });
    } catch (e) {
      toast({
        title: 'Could not remove',
        variant: 'destructive',
      });
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
      await insertTomatoMarketExpenseLines({ companyId, dispatchId, lines });
      await applyTomatoMarketExpenseTemplateUsage({
        companyId,
        lines: lines.map((l) => ({ name: l.category, amount: l.amount })),
      });
      void queryClient.invalidateQueries({ queryKey: ['broker-tomato-templates', companyId] });
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
      await updateTomatoMarketDispatchStatus({
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

  return (
    <div className="space-y-4 px-3 sm:px-4 py-4 max-w-lg mx-auto animate-fade-in">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => navigate('/broker')}
      >
        <ChevronLeft className="h-4 w-4" />
        All dispatches
      </button>

      <div>
        <h1 className="text-lg font-bold">{dispatch!.market_name}</h1>
        <p className="text-xs text-muted-foreground">Notebook · crates sold vs sent</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
        <div className="rounded-lg border bg-card/60 p-2.5">
          <p className="text-muted-foreground">Sold / sent</p>
          <p className="font-semibold tabular-nums">
            {cratesSold}
            {sent > 0 ? ` / ${sent}` : ''}
          </p>
        </div>
        <div className="rounded-lg border bg-card/60 p-2.5">
          <p className="text-muted-foreground">Remaining</p>
          <p className="font-semibold tabular-nums">{remaining}</p>
        </div>
        <div className="rounded-lg border bg-card/60 p-2.5">
          <p className="text-muted-foreground">Revenue</p>
          <p className="font-semibold tabular-nums text-fv-success">{kes(rev)}</p>
        </div>
        <div className="rounded-lg border bg-card/60 p-2.5">
          <p className="text-muted-foreground">Expenses</p>
          <p className="font-semibold tabular-nums">{kes(exp)}</p>
        </div>
        <div className="col-span-2 rounded-lg border bg-card/60 p-2.5">
          <p className="text-muted-foreground">Net</p>
          <p className={cn('font-bold tabular-nums', net >= 0 ? 'text-fv-success' : 'text-destructive')}>
            {kes(net)}
          </p>
        </div>
      </div>

      {entries.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Avg {kes(Math.round(priceStats.avg))} · Min {kes(Math.round(priceStats.min))} · Max{' '}
          {kes(Math.round(priceStats.max))}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant={dispatch!.status === 'completed' ? 'outline' : 'default'}
          size="sm"
          className="flex-1"
          disabled={statusSaving}
          onClick={() => void toggleComplete()}
        >
          {statusSaving ? '…' : dispatch!.status === 'completed' ? 'Reopen dispatch' : 'Mark complete'}
        </Button>
      </div>

      <Tabs defaultValue="buyers" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="buyers" className="mt-3 space-y-3">
          <Button type="button" className="w-full touch-manipulation" onClick={() => setBuyerOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add buyer
          </Button>
          {loadE && <p className="text-sm text-muted-foreground">Loading…</p>}
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {e.entry_number}. {e.buyer_label?.trim() || 'Buyer'}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {e.quantity} × {kes(e.price_per_unit)} = {kes(e.line_total)}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                  aria-label="Remove buyer line"
                  onClick={() => void removeBuyer(e.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {!loadE && entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No buyers yet.</p>
          )}
        </TabsContent>
        <TabsContent value="expenses" className="mt-3 space-y-3">
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
            <p className="text-sm text-muted-foreground text-center py-6">No expenses yet.</p>
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
              <Label className="text-xs">Price per crate (KES)</Label>
              <Input
                inputMode="decimal"
                value={buyerPrice}
                onChange={(e) => setBuyerPrice(e.target.value)}
                placeholder="30000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quantity (crates)</Label>
              <Input inputMode="numeric" value={buyerQty} onChange={(e) => setBuyerQty(e.target.value)} />
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

      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Market expenses</DialogTitle>
            <p className="text-xs text-muted-foreground">Add one or more lines. Names are remembered for next time.</p>
          </DialogHeader>
          <datalist id="broker-expense-templates">
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
                    list="broker-expense-templates"
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
                + Row
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
