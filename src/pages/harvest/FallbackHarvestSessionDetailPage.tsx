import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  Plus,
  Truck,
  UserPlus,
  Wallet,
  TrendingUp,
  Package,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { MarketNotebookBuyerRow } from '@/components/harvest/MarketNotebookBuyerRow';
import { EditMarketSalesBuyerDialog } from '@/components/harvest/EditMarketSalesBuyerDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { EmployeeService } from '@/services/localData/EmployeeService';
import type { Employee } from '@/types';
import { createFinanceExpense } from '@/services/financeExpenseService';
import {
  addDirectIntakeUnits,
  addFallbackMarketExpenseLines,
  addFallbackMarketSalesEntry,
  fetchFallbackMarketDispatchForSession,
  fetchFallbackSession,
  linkFinanceExpenseToFallbackSession,
  listFallbackExpenseTemplates,
  listFallbackMarketExpenseLines,
  listFallbackMarketSalesEntries,
  recordFallbackExpenseTemplateUsage,
  updateFallbackMarketSalesEntry,
  updateFallbackSession,
  upsertFallbackMarketDispatch,
  type FallbackHarvestSessionRow,
  type FallbackMarketDispatchRow,
  type FallbackMarketSalesEntryRow,
  type FallbackPickerRow,
} from '@/services/fallbackHarvestService';
import { useFallbackHarvestRealtime } from '@/hooks/useFallbackHarvestRealtime';
import { useFallbackSessionSummary } from '@/hooks/useFallbackSessionSummary';
import { useHarvestNavPrefix } from '@/hooks/useHarvestNavPrefix';
import { useFallbackSessionDetail } from '@/hooks/useFallbackHarvestRepository';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';
import { formatDate } from '@/lib/dateUtils';

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

const UNIT_PRESETS = ['bags', 'sacks', 'crates', 'kg', 'units'] as const;
const DESTINATIONS = [
  { id: 'FARM', label: 'Sold from farm' },
  { id: 'MARKET', label: 'Going to market' },
] as const;

export default function FallbackHarvestSessionDetailPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const navigate = useNavigate();
  const harvestNavPrefix = useHarvestNavPrefix();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeProject } = useProject();

  const companyId = user?.companyId ?? null;
  const farmId = activeProject?.farmId ?? null;
  const editorUserId = user?.id ?? null;

  useFallbackHarvestRealtime({ companyId, projectId });

  const { data: session, isLoading } = useQuery({
    queryKey: ['fallback-harvest-session', companyId, sessionId],
    enabled: Boolean(companyId && sessionId),
    queryFn: () => fetchFallbackSession({ companyId: companyId ?? '', sessionId: sessionId ?? '' }),
  });

  const { data: computedSummary } = useFallbackSessionSummary(companyId, sessionId);

  const { data: dispatch } = useQuery({
    queryKey: ['fallback-market-dispatch', companyId, sessionId],
    enabled: Boolean(companyId && sessionId),
    queryFn: () => fetchFallbackMarketDispatchForSession({ companyId: companyId ?? '', sessionId: sessionId ?? '' }),
  });

  const { data: buyerLines = [] } = useQuery({
    queryKey: ['fallback-market-sales', companyId, dispatch?.id],
    enabled: Boolean(companyId && dispatch?.id),
    queryFn: () => listFallbackMarketSalesEntries({ companyId: companyId ?? '', dispatchId: dispatch?.id ?? '' }),
  });

  const { data: marketExpenses = [] } = useQuery({
    queryKey: ['fallback-market-expenses', companyId, dispatch?.id],
    enabled: Boolean(companyId && dispatch?.id),
    queryFn: () => listFallbackMarketExpenseLines({ companyId: companyId ?? '', dispatchId: dispatch?.id ?? '' }),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['fallback-market-expense-templates', companyId],
    enabled: Boolean(companyId),
    queryFn: () => listFallbackExpenseTemplates({ companyId: companyId ?? '', limit: 50 }),
    staleTime: 60_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await EmployeeService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return EmployeeService.listEmployees(companyId);
    },
    staleTime: 60_000,
  });

  // Local-first: pickers and picker logs come from Dexie for instant + offline reads
  const {
    pickers,
    pickerLogs,
    addPicker: addPickerLocal,
    recordPickerLog: recordPickerLogLocal,
    totalUnitsForSession: localTotalUnits,
    totalsByPicker,
  } = useFallbackSessionDetail(companyId, sessionId);

  const brokerEmployees = useMemo(() => {
    return (employees ?? []).filter((e: Employee) => {
      const r = String((e as any)?.employeeRole ?? (e as any)?.role ?? '').toLowerCase();
      return r === 'sales-broker' || r === 'broker' || r.includes('broker') || r.includes('sales');
    });
  }, [employees]);

  const liveFallbackMarketSales = useMemo(
    () =>
      buyerLines.reduce((s, e) => s + (Number.isFinite(e.line_total) ? e.line_total : 0), 0),
    [buyerLines],
  );
  const liveFallbackMarketExpenses = useMemo(
    () =>
      marketExpenses.reduce((s, x) => s + (Number.isFinite(x.amount) ? x.amount : 0), 0),
    [marketExpenses],
  );

  const revenuePending =
    session?.destination === 'MARKET' && buyerLines.length === 0 && (computedSummary?.revenueTotal ?? 0) <= 0;

  const fallbackBrokerDisplayName = useMemo(() => {
    const bid = dispatch?.broker_employee_id;
    if (!bid) return '—';
    return employees.find((e: Employee) => e.id === bid)?.name ?? '—';
  }, [dispatch?.broker_employee_id, employees]);

  const summary = useMemo(() => {
    if (!session) return null;
    return {
      units: Math.round(Number(computedSummary?.totalUnits ?? 0)),
      unitType: session.unit_type,
      revenue: Number(computedSummary?.revenueTotal ?? 0),
      expenses: Number(computedSummary?.expensesTotal ?? 0),
      net: Number(computedSummary?.netProfit ?? 0),
    };
  }, [session, computedSummary]);

  const [intakeUnits, setIntakeUnits] = useState('1');
  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPrice, setBuyerPrice] = useState('');
  const [buyerQty, setBuyerQty] = useState('1');
  const [expenseRows, setExpenseRows] = useState<Array<{ category: string; amount: string }>>([{ category: '', amount: '' }]);
  const [workflowTab, setWorkflowTab] = useState('intake');

  /** Default to Packaging & sales only when a market dispatch row exists. */
  const fulfillmentTabDefaultedKey = useRef<string | null>(null);
  useEffect(() => {
    fulfillmentTabDefaultedKey.current = null;
  }, [sessionId]);

  useEffect(() => {
    setEditingBuyerEntry(null);
  }, [sessionId]);

  useEffect(() => {
    if (!session || session.destination !== 'MARKET' || !dispatch) return;
    const key = `${session.id}:${dispatch.id}`;
    if (fulfillmentTabDefaultedKey.current === key) return;
    fulfillmentTabDefaultedKey.current = key;
    setWorkflowTab('fulfillment');
  }, [session?.id, session?.destination, dispatch?.id]);
  const [sessionExpenseRows, setSessionExpenseRows] = useState<Array<{ category: string; amount: string; note: string }>>([
    { category: 'transport', amount: '', note: '' },
  ]);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [pickerName, setPickerName] = useState('');

  const [editingBuyerEntry, setEditingBuyerEntry] = useState<FallbackMarketSalesEntryRow | null>(null);
  const [savingBuyerEdit, setSavingBuyerEdit] = useState(false);

  async function patchSession(patch: Partial<FallbackHarvestSessionRow>) {
    if (!companyId || !sessionId) return;
    try {
      await updateFallbackSession({ companyId, sessionId, patch });
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-session', companyId, sessionId] });
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-sessions'], exact: false });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  async function saveFallbackBuyerLineEdit(payload: {
    buyerLabel: string | null;
    quantity: number;
    pricePerUnit: number;
    editReason: string;
  }) {
    if (!companyId || !editingBuyerEntry) return;
    setSavingBuyerEdit(true);
    try {
      await updateFallbackMarketSalesEntry({
        companyId,
        entryId: editingBuyerEntry.id,
        buyerLabel: payload.buyerLabel,
        quantity: payload.quantity,
        pricePerUnit: payload.pricePerUnit,
        editReason: payload.editReason,
        editorUserId,
      });
      void qc.invalidateQueries({ queryKey: ['fallback-market-sales', companyId, editingBuyerEntry.market_dispatch_id] });
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-session', companyId, sessionId] });
      setEditingBuyerEntry(null);
      toast({ title: 'Buyer line updated' });
    } catch (e: any) {
      toast({
        title: 'Could not save',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setSavingBuyerEdit(false);
    }
  }

  async function ensureDispatchOrThrow(s: FallbackHarvestSessionRow): Promise<FallbackMarketDispatchRow> {
    if (!companyId || !projectId) throw new Error('Missing company/project');
    const effectiveUnitsSent = Number(computedSummary?.totalUnits ?? 0);
    const d = await upsertFallbackMarketDispatch({
      companyId,
      sessionId: s.id,
      marketName: dispatch?.market_name ?? 'Market',
      brokerEmployeeId: dispatch?.broker_employee_id ?? null,
      unitsSent: effectiveUnitsSent,
    });
    void qc.invalidateQueries({ queryKey: ['fallback-market-dispatch', companyId, s.id] });
    return d;
  }

  async function onAddUnits() {
    if (!companyId || !sessionId) return;
    const units = Number(intakeUnits);
    if (!Number.isFinite(units) || units <= 0) return;
    try {
      await addDirectIntakeUnits({ companyId, sessionId, units });
      setIntakeUnits('1');
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-session', companyId, sessionId] });
    } catch (e: any) {
      toast({ title: 'Failed to record intake', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  async function onAddBuyer() {
    if (!companyId || !session) return;
    const price = Number(buyerPrice);
    const qty = Number(buyerQty || 1);
    if (!Number.isFinite(price) || price < 0) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    try {
      const d = await ensureDispatchOrThrow(session);
      await addFallbackMarketSalesEntry({
        companyId,
        dispatchId: d.id,
        buyerLabel: buyerName.trim() ? buyerName.trim() : null,
        pricePerUnit: price,
        quantity: qty,
      });
      setShowAddBuyer(false);
      setBuyerName('');
      setBuyerPrice('');
      setBuyerQty('1');
      void qc.invalidateQueries({ queryKey: ['fallback-market-sales', companyId, d.id] });
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-session', companyId, session.id] });
    } catch (e: any) {
      toast({ title: 'Failed to add buyer', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  async function onSaveMarketExpenses() {
    if (!companyId || !session) return;
    try {
      const d = await ensureDispatchOrThrow(session);
      const lines = expenseRows
        .map((r) => ({ category: r.category.trim(), amount: Number(r.amount) }))
        .filter((r) => r.category && Number.isFinite(r.amount) && r.amount >= 0);
      await addFallbackMarketExpenseLines({ companyId, dispatchId: d.id, lines });
      for (const l of lines) {
        await recordFallbackExpenseTemplateUsage({ companyId, name: l.category, lastUsedAmount: l.amount });
      }
      setExpenseRows([{ category: '', amount: '' }]);
      void qc.invalidateQueries({ queryKey: ['fallback-market-expenses', companyId, d.id] });
      void qc.invalidateQueries({ queryKey: ['fallback-market-expense-templates', companyId] });
    } catch (e: any) {
      toast({ title: 'Failed to save expenses', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  async function onSaveSessionExpenses() {
    if (!companyId || !session || !farmId) {
      toast({ title: 'Missing farm', description: 'This project needs a farmId to record expenses.', variant: 'destructive' });
      return;
    }
    try {
      const rows = sessionExpenseRows
        .map((r) => ({ category: r.category.trim(), amount: Number(r.amount), note: r.note.trim() }))
        .filter((r) => r.category && Number.isFinite(r.amount) && r.amount >= 0);
      for (const r of rows) {
        const exp = await createFinanceExpense({
          companyId,
          farmId,
          projectId: session.project_id,
          category: r.category,
          amount: r.amount,
          note: r.note || `Harvest expense (${session.unit_type})`,
        });
        await linkFinanceExpenseToFallbackSession({
          companyId,
          expenseId: exp.id,
          projectId: session.project_id,
          sessionId: session.id,
        });
      }
      setSessionExpenseRows([{ category: 'transport', amount: '', note: '' }]);
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-session', companyId, session.id] });
      void qc.invalidateQueries({ queryKey: ['expenses'], exact: false });
    } catch (e: any) {
      toast({ title: 'Failed to record expenses', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  async function onAddPicker() {
    if (!companyId || !sessionId) return;
    const name = pickerName.trim();
    if (!name) return;
    try {
      await addPickerLocal({ session_id: sessionId, name });
      setPickerName('');
      setShowAddPicker(false);
    } catch (e: any) {
      toast({ title: 'Failed to add picker', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  async function onLogPickerUnits(p: FallbackPickerRow, units: number) {
    if (!companyId || !sessionId || !editorUserId) return;
    if (!Number.isFinite(units) || units <= 0) return;
    try {
      await recordPickerLogLocal({
        session_id: sessionId,
        picker_id: p.id,
        units,
        recorded_by: editorUserId,
      });
      // Realtime hook will invalidate session summary on the server side when synced
    } catch (e: any) {
      toast({ title: 'Failed to log picker units', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  if (!projectId || !sessionId) {
    return <p className="text-sm text-muted-foreground">Missing session.</p>;
  }

  if (isLoading && !session) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`${harvestNavPrefix}/harvest-sessions/${projectId}`)}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground">Session not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 animate-fade-in w-full">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`${harvestNavPrefix}/harvest-sessions/${projectId}`)}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="text-right space-y-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Harvest session</p>
          <p className="text-sm font-semibold">
            <span aria-hidden>🗓</span> {formatDate(session.session_date)}
          </p>
        </div>
      </div>

      {summary && (
        <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
          <SimpleStatCard
            layout="mobile-compact"
            title="Total units"
            value={`${summary.units.toLocaleString('en-KE')} ${summary.unitType}`}
            icon={Package}
            iconVariant="primary"
            className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
          />
          <SimpleStatCard
            layout="mobile-compact"
            title="Revenue"
            value={revenuePending ? 'Pending' : formatKes(summary.revenue)}
            icon={TrendingUp}
            iconVariant="gold"
            valueVariant={revenuePending ? 'warning' : 'success'}
            className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
          />
          <SimpleStatCard
            layout="mobile-compact"
            title="Expenses"
            value={formatKes(summary.expenses)}
            icon={Wallet}
            iconVariant="muted"
            className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
          />
          <SimpleStatCard
            layout="mobile-compact"
            title="Net profit"
            value={formatKes(summary.net)}
            icon={BarChart3}
            iconVariant="muted"
            valueVariant={summary.net > 0 ? 'success' : summary.net < 0 ? 'destructive' : 'default'}
            className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
          />
        </div>
      )}

      <Tabs value={workflowTab} onValueChange={setWorkflowTab} className="w-full space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1.5 rounded-xl border border-border/50 bg-muted/30 p-1.5">
          <TabsTrigger value="intake" className="rounded-lg px-2 py-2.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3">
            Intake
          </TabsTrigger>
          <TabsTrigger value="fulfillment" className="rounded-lg px-2 py-2.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3">
            Packaging &amp; sales
          </TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-lg px-2 py-2.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3">
            Expenses
          </TabsTrigger>
        </TabsList>

        <TabsContent value="intake" className="mt-0 space-y-4 outline-none">
          <div className="fv-card p-4 sm:p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold">Record intake</p>
              <p className="text-xs text-muted-foreground">Direct entry or picker-based logging (same flow as tomato harvest).</p>
            </div>

            <div
              className="flex w-full max-w-md rounded-lg bg-muted/60 p-0.5 gap-0.5"
              role="tablist"
              aria-label="Intake mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!session.use_pickers}
                className={cn(
                  'flex min-h-9 flex-1 items-center justify-center rounded-md px-3 py-2 text-xs font-medium transition-colors touch-manipulation sm:text-sm',
                  !session.use_pickers ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => patchSession({ use_pickers: false })}
              >
                Direct
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={session.use_pickers}
                className={cn(
                  'flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors touch-manipulation sm:text-sm',
                  session.use_pickers ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => patchSession({ use_pickers: true })}
              >
                <Users className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
                Pickers
              </button>
            </div>

            {!session.use_pickers ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label className="text-xs text-muted-foreground">Unit type</Label>
                  <Select value={session.unit_type} onValueChange={(v) => patchSession({ unit_type: v })}>
                    <SelectTrigger className="mt-1.5 min-h-11 rounded-lg">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_PRESETS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-1">
                  <Label className="text-xs text-muted-foreground">Add units</Label>
                  <Input
                    className="mt-1.5 min-h-11 rounded-lg text-base tabular-nums"
                    inputMode="numeric"
                    value={intakeUnits}
                    onChange={(e) => setIntakeUnits(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <Button className="w-full min-h-11 rounded-lg touch-manipulation" onClick={onAddUnits}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Picker rate per unit</Label>
                    <Input
                      className="mt-1.5 min-h-11 rounded-lg text-base tabular-nums"
                      inputMode="numeric"
                      value={String(session.picker_rate_per_unit ?? 0)}
                      onChange={(e) => patchSession({ picker_rate_per_unit: Number(e.target.value || 0) })}
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">This auto-generates an immutable labour expense.</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Unit type</Label>
                    <Select value={session.unit_type} onValueChange={(v) => patchSession({ unit_type: v })}>
                      <SelectTrigger className="mt-1.5 min-h-11 rounded-lg">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_PRESETS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg touch-manipulation" onClick={() => setShowAddPicker(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add picker
                  </Button>
                </div>

                <div className="space-y-2 max-h-[min(28rem,55vh)] overflow-y-auto pr-0.5">
                  {pickers.length === 0 ? (
                    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                      <p className="text-sm text-muted-foreground">No pickers added yet.</p>
                      <Button type="button" size="sm" onClick={() => setShowAddPicker(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add picker
                      </Button>
                    </div>
                  ) : (
                    pickers.map((p) => {
                      const logged = pickerLogs.filter((l) => l.picker_id === p.id).reduce((sum, l) => sum + Number(l.units ?? 0), 0);
                      return (
                        <Card key={p.id} className="relative overflow-hidden rounded-xl border-border/80 shadow-sm">
                          <CardContent className="flex items-stretch gap-2 p-2 sm:p-3">
                            <div className="relative shrink-0">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-base font-bold tabular-nums text-primary-foreground shadow-lg ring-2 ring-background">
                                {p.picker_number}
                              </div>
                              <div className="absolute -right-1 -top-1 flex h-4 min-w-[1.125rem] items-center justify-center rounded-full border border-border bg-muted px-1 text-[9px] font-bold tabular-nums">
                                {Math.round(logged)}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1 py-0.5">
                              <p className="truncate text-sm font-semibold text-foreground">{p.name || '—'}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Logged {Math.round(logged)} {session.unit_type}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 self-center">
                              <Button size="sm" variant="secondary" className="touch-manipulation" onClick={() => onLogPickerUnits(p, 1)}>
                                +1
                              </Button>
                              <Button size="sm" variant="secondary" className="touch-manipulation" onClick={() => onLogPickerUnits(p, 5)}>
                                +5
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fulfillment" className="mt-0 space-y-4 outline-none">
          <div className="fv-card p-4 sm:p-5 space-y-6">
            <section className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Packaging</p>
                  <p className="text-xs text-muted-foreground">How the harvest is grouped for handling.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Container type</Label>
                  <Select value={session.container_type} onValueChange={(v) => patchSession({ container_type: v })}>
                    <SelectTrigger className="mt-1.5 min-h-11 rounded-lg">
                      <SelectValue placeholder="Select container" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_PRESETS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Total containers</Label>
                  <Input
                    className="mt-1.5 min-h-11 rounded-lg text-base tabular-nums"
                    inputMode="numeric"
                    value={String(session.total_containers ?? 0)}
                    onChange={(e) => patchSession({ total_containers: Number(e.target.value || 0) })}
                  />
                </div>
              </div>
            </section>

            <div className="border-t border-border/50 pt-5">
              <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Truck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Sales</p>
                      <p className="text-xs text-muted-foreground">Farm-gate pricing or market dispatch.</p>
                    </div>
                  </div>
                  <div className="flex w-full max-w-md rounded-lg bg-muted/60 p-0.5 gap-0.5 sm:w-auto">
                    {DESTINATIONS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={cn(
                          'min-h-9 flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors touch-manipulation sm:flex-none sm:text-sm',
                          session.destination === d.id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => patchSession({ destination: d.id as 'FARM' | 'MARKET' })}
                      >
                        {d.id === 'FARM' ? 'Farm' : 'Market'}
                      </button>
                    ))}
                  </div>
                </div>

                {session.destination === 'FARM' ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Price per unit</Label>
                      <Input
                        className="mt-1.5 min-h-11 rounded-lg text-base tabular-nums"
                        inputMode="numeric"
                        value={String(session.price_per_unit ?? '')}
                        onChange={(e) => patchSession({ price_per_unit: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Units sold</Label>
                      <Input
                        className="mt-1.5 min-h-11 rounded-lg text-base tabular-nums"
                        inputMode="numeric"
                        value={String(session.units_sold ?? '')}
                        onChange={(e) => patchSession({ auto_units_sold: false, units_sold: e.target.value ? Number(e.target.value) : null })}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button size="sm" variant={session.auto_units_sold ? 'default' : 'outline'} onClick={() => patchSession({ auto_units_sold: true })}>
                          Auto-fill
                        </Button>
                        <p className="text-[11px] text-muted-foreground">Auto matches units sold to total intake.</p>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <div className="w-full rounded-lg border border-border/60 bg-background/40 p-3">
                        <p className="text-[10px] font-medium text-muted-foreground">Revenue</p>
                        <p className="text-sm font-semibold tabular-nums">
                          {revenuePending ? 'Pending' : formatKes(summary?.revenue ?? 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-1">
                        <Label className="text-xs text-muted-foreground">Market</Label>
                        <Input
                          className="mt-1.5 min-h-11 rounded-lg"
                          value={dispatch?.market_name ?? ''}
                          placeholder="e.g. Wakulima"
                          onChange={(e) => {
                            void upsertFallbackMarketDispatch({
                              companyId: companyId ?? '',
                              sessionId: session.id,
                              marketName: e.target.value,
                              brokerEmployeeId: dispatch?.broker_employee_id ?? null,
                              unitsSent: Number(computedSummary?.totalUnits ?? 0),
                            }).then(() => qc.invalidateQueries({ queryKey: ['fallback-market-dispatch', companyId, session.id] }));
                          }}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs text-muted-foreground">Assign broker</Label>
                        <Select
                          value={dispatch?.broker_employee_id ?? 'none'}
                          onValueChange={(v) => {
                            const brokerEmployeeId = v === 'none' ? null : v;
                            void upsertFallbackMarketDispatch({
                              companyId: companyId ?? '',
                              sessionId: session.id,
                              marketName: dispatch?.market_name ?? 'Market',
                              brokerEmployeeId,
                              unitsSent: Number(computedSummary?.totalUnits ?? 0),
                            }).then(() => qc.invalidateQueries({ queryKey: ['fallback-market-dispatch', companyId, session.id] }));
                          }}
                        >
                          <SelectTrigger className="mt-1.5 min-h-11 rounded-lg">
                            <SelectValue placeholder="Select broker" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No broker</SelectItem>
                            {brokerEmployees.map((e: Employee) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name} ({String((e as any)?.role ?? (e as any)?.employeeRole ?? 'employee')})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs text-muted-foreground">Units sent</Label>
                        <Input
                          className="mt-1.5 min-h-11 rounded-lg text-base tabular-nums"
                          inputMode="numeric"
                          value={String(dispatch?.units_sent ?? Math.round(Number(computedSummary?.totalUnits ?? 0)))}
                          onChange={(e) => {
                            void upsertFallbackMarketDispatch({
                              companyId: companyId ?? '',
                              sessionId: session.id,
                              marketName: dispatch?.market_name ?? 'Market',
                              brokerEmployeeId: dispatch?.broker_employee_id ?? null,
                              unitsSent: Number(e.target.value || 0),
                            }).then(() => qc.invalidateQueries({ queryKey: ['fallback-market-dispatch', companyId, session.id] }));
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-border/50 pt-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold">Buyers</p>
                          <p className="text-xs text-muted-foreground">Notebook-style sales entries (price × quantity).</p>
                        </div>
                        <Button size="sm" className="rounded-lg touch-manipulation" onClick={() => setShowAddBuyer(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add buyer
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {buyerLines.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No buyer entries yet.</p>
                        ) : (
                          buyerLines.map((l) => (
                            <MarketNotebookBuyerRow
                              key={l.id}
                              entryNumber={l.entry_number}
                              buyerLabel={l.buyer_label}
                              quantity={l.quantity}
                              pricePerUnit={l.price_per_unit}
                              lineTotal={l.line_total}
                              unitLabel={(session.unit_type || 'units').trim().toLowerCase() || 'units'}
                              formatKes={formatKes}
                              onEdit={() => setEditingBuyerEntry(l)}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    <Collapsible defaultOpen={false} className="rounded-lg border border-border/60 bg-background/80">
                      <CollapsibleTrigger
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-muted/40 touch-manipulation [&[data-state=open]>svg]:rotate-180"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-sm font-semibold text-foreground">Broker market (live)</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Dispatch summary &amp; totals — expand to view.
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 border-t border-border/50 px-3 pb-3 pt-3">
                        <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-[11px] sm:text-xs">
                          {(
                            [
                              { k: 'Type', v: session.unit_type || '—' },
                              { k: 'Total', v: String(Math.max(0, Math.round(Number(session.total_containers ?? 0)))) },
                              { k: 'Market', v: (dispatch?.market_name ?? '').trim() || '—' },
                              { k: 'Broker', v: fallbackBrokerDisplayName },
                              {
                                k: 'Sent',
                                v: String(
                                  Math.max(
                                    0,
                                    Math.round(
                                      dispatch?.units_sent != null
                                        ? Number(dispatch.units_sent)
                                        : Number(computedSummary?.totalUnits ?? 0),
                                    ),
                                  ),
                                ),
                              },
                            ] as const
                          ).map((row) => (
                            <div key={row.k} className="flex justify-between gap-3">
                              <span className="text-muted-foreground">{row.k}</span>
                              <span className="min-w-0 text-right font-medium text-foreground">{row.v}</span>
                            </div>
                          ))}
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                          <SimpleStatCard
                            layout="mobile-compact"
                            title="Sales"
                            value={formatKes(Math.round(liveFallbackMarketSales))}
                            icon={TrendingUp}
                            iconVariant="gold"
                            valueVariant="success"
                            className="py-3 px-3 text-sm min-h-[3.25rem] touch-manipulation"
                          />
                          <SimpleStatCard
                            layout="mobile-compact"
                            title="Market expenses"
                            value={formatKes(Math.round(liveFallbackMarketExpenses))}
                            icon={Wallet}
                            iconVariant="muted"
                            className="py-3 px-3 text-sm min-h-[3.25rem] touch-manipulation"
                          />
                          <SimpleStatCard
                            layout="mobile-compact"
                            title="Net (market)"
                            value={formatKes(Math.round(liveFallbackMarketSales - liveFallbackMarketExpenses))}
                            icon={Banknote}
                            iconVariant="muted"
                            valueVariant={
                              liveFallbackMarketSales - liveFallbackMarketExpenses >= 0 ? 'info' : 'destructive'
                            }
                            className="py-3 px-3 text-sm min-h-[3.25rem] touch-manipulation"
                          />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Truck className="h-4 w-4 shrink-0" />
                          Revenue rolls up from buyer lines minus market-side costs. Session summary updates after saves.
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-0 outline-none">
          <div className="fv-card p-4 sm:p-5 space-y-8">
            <div>
              <p className="text-sm font-semibold">Expenses</p>
              <p className="text-xs text-muted-foreground">
                On-farm costs are saved to finance and linked to this session. Market costs apply when you sell via market dispatch. Summary cards update
                after each save.
                {!farmId ? ' This project needs a farm assigned to save on-farm expenses.' : ''}
              </p>
            </div>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <Wallet className="h-4 w-4 text-primary shrink-0" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On-farm</h3>
              </div>

              <datalist id="fallback-session-expense-suggestions">
                {templates.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>

              <div className="space-y-3">
                {sessionExpenseRows.map((r, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <Label className={cn(idx > 0 && 'sr-only', 'text-xs text-muted-foreground')}>Category</Label>
                      <Input
                        className="mt-1.5 min-h-10 rounded-lg"
                        list="fallback-session-expense-suggestions"
                        value={r.category}
                        onChange={(e) =>
                          setSessionExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, category: e.target.value } : p)))
                        }
                        placeholder="transport"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className={cn(idx > 0 && 'sr-only', 'text-xs text-muted-foreground')}>Amount</Label>
                      <Input
                        className="mt-1.5 min-h-10 rounded-lg tabular-nums"
                        inputMode="numeric"
                        value={r.amount}
                        onChange={(e) =>
                          setSessionExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p)))
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className={cn(idx > 0 && 'sr-only', 'text-xs text-muted-foreground')}>Note</Label>
                      <Input
                        className="mt-1.5 min-h-10 rounded-lg"
                        value={r.note}
                        onChange={(e) =>
                          setSessionExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, note: e.target.value } : p)))
                        }
                        placeholder="optional"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {templates.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">Suggested</p>
                  <div className="flex flex-wrap gap-2">
                    {templates.slice(0, 12).map((t) => (
                      <Button
                        key={t.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full text-xs"
                        onClick={() =>
                          setSessionExpenseRows((prev) => [
                            ...prev,
                            {
                              category: t.name,
                              amount: t.last_used_amount != null ? String(t.last_used_amount) : '',
                              note: '',
                            },
                          ])
                        }
                      >
                        {t.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={() => setSessionExpenseRows((prev) => [...prev, { category: '', amount: '', note: '' }])}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add row
                </Button>
                <p className="text-sm font-medium tabular-nums text-muted-foreground">
                  Draft (farm):{' '}
                  <span className="text-foreground">
                    {formatKes(sessionExpenseRows.reduce((sum, r) => sum + (Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0), 0))}
                  </span>
                </p>
              </div>

              <Button className="w-full sm:w-auto" onClick={() => void onSaveSessionExpenses()} disabled={!farmId}>
                Save farm expenses
              </Button>
            </section>

            {session.destination === 'MARKET' && (
              <section className="space-y-4 border-t border-border/50 pt-6">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <Truck className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">At market</h3>
                </div>
                <p className="text-xs text-muted-foreground">Recorded against the market dispatch (storage, watchman, transport, etc.).</p>

                <div className="space-y-2">
                  {marketExpenses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No market expenses recorded yet.</p>
                  ) : (
                    marketExpenses.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                        <p className="text-sm font-semibold">{l.category}</p>
                        <p className="text-sm font-semibold tabular-nums">{formatKes(l.amount)}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3">
                  {expenseRows.map((r, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-5">
                      <div className="sm:col-span-3">
                        <Label className={cn(idx > 0 && 'sr-only', 'text-xs text-muted-foreground')}>Expense</Label>
                        <Input
                          className="mt-1.5 min-h-10 rounded-lg"
                          list="fallback-expense-templates"
                          value={r.category}
                          onChange={(e) =>
                            setExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, category: e.target.value } : p)))
                          }
                          placeholder="storage, watchman…"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className={cn(idx > 0 && 'sr-only', 'text-xs text-muted-foreground')}>Amount</Label>
                        <Input
                          className="mt-1.5 min-h-10 rounded-lg tabular-nums"
                          inputMode="numeric"
                          value={r.amount}
                          onChange={(e) =>
                            setExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p)))
                          }
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                  <datalist id="fallback-expense-templates">
                    {templates.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button type="button" variant="outline" onClick={() => setExpenseRows((prev) => [...prev, { category: '', amount: '' }])}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add row
                    </Button>
                    <p className="text-sm font-medium tabular-nums text-muted-foreground">
                      Draft (market):{' '}
                      <span className="text-foreground">
                        {formatKes(expenseRows.reduce((sum, r) => sum + (Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0), 0))}
                      </span>
                    </p>
                  </div>
                  <Button className="w-full sm:w-auto" onClick={() => void onSaveMarketExpenses()}>
                    Save market expenses
                  </Button>
                </div>
              </section>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <EditMarketSalesBuyerDialog
        open={editingBuyerEntry != null}
        onOpenChange={(o) => {
          if (!o) setEditingBuyerEntry(null);
        }}
        entry={
          editingBuyerEntry
            ? {
                id: editingBuyerEntry.id,
                buyer_label: editingBuyerEntry.buyer_label,
                quantity: editingBuyerEntry.quantity,
                price_per_unit: editingBuyerEntry.price_per_unit,
              }
            : null
        }
        unitLabel={(session?.unit_type || 'units').trim().toLowerCase() || 'units'}
        quantityMode="decimal"
        onSave={saveFallbackBuyerLineEdit}
        isSaving={savingBuyerEdit}
      />

      {/* Add picker modal */}
      <Dialog open={showAddPicker} onOpenChange={setShowAddPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add picker</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input className="mt-1" value={pickerName} onChange={(e) => setPickerName(e.target.value)} placeholder="e.g. John" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPicker(false)}>
              Cancel
            </Button>
            <Button onClick={onAddPicker}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add buyer modal */}
      <Dialog open={showAddBuyer} onOpenChange={setShowAddBuyer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add buyer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Buyer name (optional)</Label>
              <Input className="mt-1" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Price per unit</Label>
                <Input className="mt-1" inputMode="numeric" value={buyerPrice} onChange={(e) => setBuyerPrice(e.target.value)} />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input className="mt-1" inputMode="numeric" value={buyerQty} onChange={(e) => setBuyerQty(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBuyer(false)}>
              Cancel
            </Button>
            <Button onClick={onAddBuyer}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

