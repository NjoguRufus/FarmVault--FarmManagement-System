import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Truck, Wallet, TrendingUp, Package, Users } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { listEmployees } from '@/services/employeesSupabaseService';
import type { Employee } from '@/types';
import { createFinanceExpense } from '@/services/financeExpenseService';
import {
  addDirectIntakeUnits,
  addFallbackMarketExpenseLines,
  addFallbackMarketSalesEntry,
  addFallbackPicker,
  addFallbackPickerLog,
  fetchFallbackMarketDispatchForSession,
  fetchFallbackSession,
  linkFinanceExpenseToFallbackSession,
  listFallbackExpenseTemplates,
  listFallbackMarketExpenseLines,
  listFallbackMarketSalesEntries,
  listFallbackPickerLogs,
  listFallbackPickers,
  recordFallbackExpenseTemplateUsage,
  updateFallbackSession,
  upsertFallbackMarketDispatch,
  type FallbackHarvestSessionRow,
  type FallbackMarketDispatchRow,
  type FallbackPickerRow,
} from '@/services/fallbackHarvestService';
import { useFallbackHarvestRealtime } from '@/hooks/useFallbackHarvestRealtime';

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

const UNIT_PRESETS = ['bags', 'sacks', 'crates', 'kg', 'units'] as const;
const DESTINATIONS = [
  { id: 'FARM', label: 'Sold from farm' },
  { id: 'MARKET', label: 'Going to market' },
] as const;

export default function FallbackHarvestSessionDetailPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeProject } = useProject();

  const companyId = user?.companyId ?? null;
  const farmId = activeProject?.farmId ?? null;

  useFallbackHarvestRealtime({ companyId, projectId });

  const { data: session, isLoading } = useQuery({
    queryKey: ['fallback-harvest-session', companyId, sessionId],
    enabled: Boolean(companyId && sessionId),
    queryFn: () => fetchFallbackSession({ companyId: companyId ?? '', sessionId: sessionId ?? '' }),
  });

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
    queryFn: () => listEmployees(companyId ?? ''),
    staleTime: 60_000,
  });

  const { data: pickers = [] } = useQuery({
    queryKey: ['fallback-pickers', companyId, sessionId],
    enabled: Boolean(companyId && sessionId),
    queryFn: () => listFallbackPickers({ companyId: companyId ?? '', sessionId: sessionId ?? '' }),
  });

  const { data: pickerLogs = [] } = useQuery({
    queryKey: ['fallback-picker-logs', companyId, sessionId],
    enabled: Boolean(companyId && sessionId),
    queryFn: () => listFallbackPickerLogs({ companyId: companyId ?? '', sessionId: sessionId ?? '' }),
  });

  const brokerEmployees = useMemo(() => {
    return (employees ?? []).filter((e: Employee) => {
      const r = String((e as any)?.employeeRole ?? (e as any)?.role ?? '').toLowerCase();
      return r === 'sales-broker' || r === 'broker' || r.includes('broker') || r.includes('sales');
    });
  }, [employees]);

  const summary = useMemo(() => {
    const s = session;
    if (!s) return null;
    return {
      units: Math.round(Number(s.total_units ?? 0)),
      unitType: s.unit_type,
      revenue: Number(s.total_revenue ?? 0),
      expenses: Number(s.total_expenses ?? 0),
      net: Number(s.net_profit ?? 0),
    };
  }, [session]);

  const [intakeUnits, setIntakeUnits] = useState('1');
  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPrice, setBuyerPrice] = useState('');
  const [buyerQty, setBuyerQty] = useState('1');
  const [showAddMarketExpense, setShowAddMarketExpense] = useState(false);
  const [expenseRows, setExpenseRows] = useState<Array<{ category: string; amount: string }>>([{ category: '', amount: '' }]);
  const [showAddSessionExpense, setShowAddSessionExpense] = useState(false);
  const [sessionExpenseRows, setSessionExpenseRows] = useState<Array<{ category: string; amount: string; note: string }>>([
    { category: 'transport', amount: '', note: '' },
  ]);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [pickerName, setPickerName] = useState('');

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

  async function ensureDispatchOrThrow(s: FallbackHarvestSessionRow): Promise<FallbackMarketDispatchRow> {
    if (!companyId || !projectId) throw new Error('Missing company/project');
    const d = await upsertFallbackMarketDispatch({
      companyId,
      sessionId: s.id,
      marketName: dispatch?.market_name ?? 'Market',
      brokerEmployeeId: dispatch?.broker_employee_id ?? null,
      unitsSent: Number(s.total_units ?? 0),
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
      setShowAddMarketExpense(false);
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
      setShowAddSessionExpense(false);
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
      await addFallbackPicker({ companyId, sessionId, name });
      setPickerName('');
      setShowAddPicker(false);
      void qc.invalidateQueries({ queryKey: ['fallback-pickers', companyId, sessionId] });
    } catch (e: any) {
      toast({ title: 'Failed to add picker', description: e?.message ?? String(e), variant: 'destructive' });
    }
  }

  async function onLogPickerUnits(p: FallbackPickerRow, units: number) {
    if (!companyId || !sessionId) return;
    if (!Number.isFinite(units) || units <= 0) return;
    try {
      await addFallbackPickerLog({ companyId, sessionId, pickerId: p.id, units });
      void qc.invalidateQueries({ queryKey: ['fallback-picker-logs', companyId, sessionId] });
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-session', companyId, sessionId] });
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
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/harvest-sessions/${projectId}`)}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground">Session not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/harvest-sessions/${projectId}`)}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="text-right">
          <p className="text-sm font-semibold">Harvest session</p>
          <p className="text-xs text-muted-foreground">{session.session_date}</p>
        </div>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimpleStatCard title="Total units" value={`${summary.units.toLocaleString('en-KE')} ${summary.unitType}`} icon={Package} />
          <SimpleStatCard title="Revenue" value={formatKes(summary.revenue)} icon={TrendingUp} />
          <SimpleStatCard title="Expenses" value={formatKes(summary.expenses)} icon={Wallet} />
          <SimpleStatCard title="Net" value={formatKes(summary.net)} icon={TrendingUp} />
        </div>
      )}

      {/* Intake */}
      <Card className="border-border/60 bg-card/40">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Intake</p>
              <p className="text-xs text-muted-foreground">Direct input or use pickers (optional).</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={session.use_pickers ? 'outline' : 'default'}
                onClick={() => patchSession({ use_pickers: false })}
              >
                Direct
              </Button>
              <Button
                type="button"
                size="sm"
                variant={session.use_pickers ? 'default' : 'outline'}
                onClick={() => patchSession({ use_pickers: true })}
              >
                Pickers
              </Button>
            </div>
          </div>

          {!session.use_pickers ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <Label>Unit type</Label>
                <Select value={session.unit_type} onValueChange={(v) => patchSession({ unit_type: v })}>
                  <SelectTrigger className="mt-1">
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
                <Label>Add units</Label>
                <Input className="mt-1" inputMode="numeric" value={intakeUnits} onChange={(e) => setIntakeUnits(e.target.value)} />
              </div>
              <div className="sm:col-span-1 flex items-end">
                <Button className="w-full" onClick={onAddUnits}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Picker rate per unit</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    value={String(session.picker_rate_per_unit ?? 0)}
                    onChange={(e) => patchSession({ picker_rate_per_unit: Number(e.target.value || 0) })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">This auto-generates an immutable labour expense.</p>
                </div>
                <div>
                  <Label>Unit type</Label>
                  <Select value={session.unit_type} onValueChange={(v) => patchSession({ unit_type: v })}>
                    <SelectTrigger className="mt-1">
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

              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Pickers
                </p>
                <Button size="sm" onClick={() => setShowAddPicker(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add picker
                </Button>
              </div>

              <div className="space-y-2">
                {pickers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No pickers added yet.</p>
                ) : (
                  pickers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                      <div>
                        <p className="text-sm font-semibold">
                          #{p.picker_number} {p.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Logged: {pickerLogs.filter((l) => l.picker_id === p.id).reduce((sum, l) => sum + Number(l.units ?? 0), 0)} {session.unit_type}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => onLogPickerUnits(p, 1)}>
                          +1
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onLogPickerUnits(p, 5)}>
                          +5
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Packaging */}
      <Card className="border-border/60 bg-card/40">
        <CardContent className="p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Packaging</p>
            <p className="text-xs text-muted-foreground">How the harvest is grouped.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Container type</Label>
              <Select value={session.container_type} onValueChange={(v) => patchSession({ container_type: v })}>
                <SelectTrigger className="mt-1">
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
              <Label>Total containers</Label>
              <Input
                className="mt-1"
                inputMode="numeric"
                value={String(session.total_containers ?? 0)}
                onChange={(e) => patchSession({ total_containers: Number(e.target.value || 0) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales */}
      <Card className="border-border/60 bg-card/40">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Sales</p>
              <p className="text-xs text-muted-foreground">Farm-gate or market dispatch (broker workflow).</p>
            </div>
            <div className="flex items-center gap-2">
              {DESTINATIONS.map((d) => (
                <Button
                  key={d.id}
                  size="sm"
                  variant={session.destination === d.id ? 'default' : 'outline'}
                  onClick={() => patchSession({ destination: d.id as any })}
                >
                  {d.id === 'FARM' ? 'Farm' : 'Market'}
                </Button>
              ))}
            </div>
          </div>

          {session.destination === 'FARM' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Price per unit</Label>
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={String(session.price_per_unit ?? '')}
                  onChange={(e) => patchSession({ price_per_unit: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <Label>Units sold</Label>
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={String(session.units_sold ?? '')}
                  onChange={(e) => patchSession({ auto_units_sold: false, units_sold: e.target.value ? Number(e.target.value) : null })}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant={session.auto_units_sold ? 'default' : 'outline'} onClick={() => patchSession({ auto_units_sold: true })}>
                    Auto
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Auto keeps units sold = total units.</p>
                </div>
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-lg border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">Revenue (auto)</p>
                  <p className="text-sm font-semibold tabular-nums">{formatKes(session.total_revenue)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label>Market</Label>
                  <Input
                    className="mt-1"
                    value={dispatch?.market_name ?? ''}
                    placeholder="e.g. Wakulima"
                    onChange={(e) => {
                      void upsertFallbackMarketDispatch({
                        companyId: companyId ?? '',
                        sessionId: session.id,
                        marketName: e.target.value,
                        brokerEmployeeId: dispatch?.broker_employee_id ?? null,
                        unitsSent: Number(session.total_units ?? 0),
                      }).then(() => qc.invalidateQueries({ queryKey: ['fallback-market-dispatch', companyId, session.id] }));
                    }}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label>Assign broker</Label>
                  <Select
                    value={dispatch?.broker_employee_id ?? 'none'}
                    onValueChange={(v) => {
                      const brokerEmployeeId = v === 'none' ? null : v;
                      void upsertFallbackMarketDispatch({
                        companyId: companyId ?? '',
                        sessionId: session.id,
                        marketName: dispatch?.market_name ?? 'Market',
                        brokerEmployeeId,
                        unitsSent: Number(session.total_units ?? 0),
                      }).then(() => qc.invalidateQueries({ queryKey: ['fallback-market-dispatch', companyId, session.id] }));
                    }}
                  >
                    <SelectTrigger className="mt-1">
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
                  <Label>Units sent</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    value={String(dispatch?.units_sent ?? Math.round(session.total_units))}
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

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Truck className="h-4 w-4" />
                Revenue comes from broker notebook (buyers + market expenses) and updates in real-time.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expenses + Market notebook */}
      <Tabs defaultValue="session-expenses" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="session-expenses">Expenses</TabsTrigger>
          <TabsTrigger value="buyers" disabled={session.destination !== 'MARKET'}>
            Buyers
          </TabsTrigger>
          <TabsTrigger value="market-expenses" disabled={session.destination !== 'MARKET'}>
            Market expenses
          </TabsTrigger>
        </TabsList>

        <TabsContent value="session-expenses" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Session expenses</p>
              <p className="text-xs text-muted-foreground">These are finance expenses linked to this harvest session.</p>
            </div>
            <Button size="sm" onClick={() => setShowAddSessionExpense(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add expense
            </Button>
          </div>

          <Card className="border-border/60 bg-card/40">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                Totals are included in the Summary card automatically. (Viewing detailed linked expense rows will be added in the reports/expenses screens.)
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="buyers" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Buyers</p>
              <p className="text-xs text-muted-foreground">Notebook-style sales entries.</p>
            </div>
            <Button size="sm" onClick={() => setShowAddBuyer(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add buyer
            </Button>
          </div>

          <div className="space-y-2">
            {buyerLines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No buyer entries yet.</p>
            ) : (
              buyerLines.map((l) => (
                <div key={l.id} className="rounded-lg border border-border/60 bg-card/40 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {l.entry_number}. {l.buyer_label || `Buyer ${l.entry_number}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(l.quantity)} × {formatKes(l.price_per_unit)} = {formatKes(l.line_total)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums">{formatKes(l.line_total)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="market-expenses" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Market expenses</p>
              <p className="text-xs text-muted-foreground">Storage, watchman, transport, etc.</p>
            </div>
            <Button size="sm" onClick={() => setShowAddMarketExpense(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add expenses
            </Button>
          </div>

          <div className="space-y-2">
            {marketExpenses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No market expenses yet.</p>
            ) : (
              marketExpenses.map((l) => (
                <div key={l.id} className="rounded-lg border border-border/60 bg-card/40 p-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{l.category}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatKes(l.amount)}</p>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

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

      {/* Add market expenses modal */}
      <Dialog open={showAddMarketExpense} onOpenChange={setShowAddMarketExpense}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Add market expenses</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {expenseRows.map((r, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-5">
                <div className="sm:col-span-3">
                  <Label className={cn(idx > 0 && 'sr-only')}>Expense</Label>
                  <Input
                    className="mt-1"
                    list="fallback-expense-templates"
                    value={r.category}
                    onChange={(e) =>
                      setExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, category: e.target.value } : p)))
                    }
                    placeholder="storage, watchman…"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className={cn(idx > 0 && 'sr-only')}>Amount</Label>
                  <Input
                    className="mt-1"
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
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setExpenseRows((prev) => [...prev, { category: '', amount: '' }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add row
              </Button>
              <p className="text-xs text-muted-foreground">
                Total:{' '}
                {formatKes(
                  expenseRows.reduce((sum, r) => sum + (Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0), 0),
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMarketExpense(false)}>
              Cancel
            </Button>
            <Button onClick={onSaveMarketExpenses}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add session expenses modal (finance.expenses + expense_links) */}
      <Dialog open={showAddSessionExpense} onOpenChange={setShowAddSessionExpense}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Add expenses</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {sessionExpenseRows.map((r, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label className={cn(idx > 0 && 'sr-only')}>Category</Label>
                  <Input
                    className="mt-1"
                    value={r.category}
                    onChange={(e) =>
                      setSessionExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, category: e.target.value } : p)))
                    }
                    placeholder="transport"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className={cn(idx > 0 && 'sr-only')}>Amount</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    value={r.amount}
                    onChange={(e) =>
                      setSessionExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p)))
                    }
                    placeholder="0"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className={cn(idx > 0 && 'sr-only')}>Note</Label>
                  <Input
                    className="mt-1"
                    value={r.note}
                    onChange={(e) =>
                      setSessionExpenseRows((prev) => prev.map((p, i) => (i === idx ? { ...p, note: e.target.value } : p)))
                    }
                    placeholder="optional"
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSessionExpenseRows((prev) => [...prev, { category: '', amount: '', note: '' }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add row
              </Button>
              <p className="text-xs text-muted-foreground">
                Total:{' '}
                {formatKes(
                  sessionExpenseRows.reduce((sum, r) => sum + (Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0), 0),
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSessionExpense(false)}>
              Cancel
            </Button>
            <Button onClick={onSaveSessionExpenses}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

