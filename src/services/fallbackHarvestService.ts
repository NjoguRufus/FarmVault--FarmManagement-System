/**
 * Modular harvest fallback engine (non-tomato, non-french-beans).
 * Tables (harvest schema): fallback_harvest_sessions, fallback_harvest_units,
 * fallback_session_pickers, fallback_session_picker_logs,
 * fallback_market_dispatches, fallback_market_sales_entries, fallback_market_expense_lines, fallback_market_expense_templates.
 *
 * Expenses link (finance schema): finance.expense_links (ref_type='fallback_harvest_session', ref_id=session_id).
 */

import { supabase } from '@/lib/supabase';
import { requireCompanyId } from '@/lib/db';

const harvest = () => supabase.schema('harvest');
const finance = () => supabase.schema('finance');

function num(v: unknown): number {
  if (v == null) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export type FallbackDestination = 'FARM' | 'MARKET';
export type FallbackSessionStatus = 'collecting' | 'completed';
export type FallbackDispatchStatus = 'pending' | 'completed';

export type FallbackHarvestSessionRow = {
  id: string;
  company_id: string;
  project_id: string;
  crop_id: string | null;
  session_date: string;
  use_pickers: boolean;
  unit_type: string;
  total_units: number;
  container_type: string;
  total_containers: number;
  destination: FallbackDestination;
  price_per_unit: number | null;
  auto_units_sold: boolean;
  units_sold: number | null;
  picker_rate_per_unit: number;
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  status: FallbackSessionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type FallbackMarketDispatchRow = {
  id: string;
  company_id: string;
  harvest_session_id: string;
  market_name: string;
  broker_employee_id: string | null;
  units_sent: number;
  total_revenue: number;
  broker_sales_revenue: number;
  market_expenses_total: number;
  net_market_profit: number;
  status: FallbackDispatchStatus;
  created_at: string;
  updated_at: string;
};

export type FallbackMarketSalesEntryRow = {
  id: string;
  company_id: string;
  market_dispatch_id: string;
  entry_number: number;
  buyer_label: string | null;
  price_per_unit: number;
  quantity: number;
  line_total: number;
  created_at: string;
};

export type FallbackMarketExpenseLineRow = {
  id: string;
  company_id: string;
  market_dispatch_id: string;
  category: string;
  amount: number;
  created_at: string;
};

export type FallbackMarketExpenseTemplateRow = {
  id: string;
  company_id: string;
  name: string;
  last_used_amount: number | null;
  usage_count: number;
  updated_at: string;
};

export type FallbackPickerRow = {
  id: string;
  company_id: string;
  harvest_session_id: string;
  picker_number: number;
  name: string;
  sort_order: number;
  created_at: string;
};

export type FallbackPickerLogRow = {
  id: string;
  company_id: string;
  harvest_session_id: string;
  picker_id: string;
  units: number;
  created_at: string;
  recorded_by: string;
};

export function rowToFallbackHarvestSession(r: Record<string, unknown>): FallbackHarvestSessionRow {
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    project_id: String(r.project_id),
    crop_id: r.crop_id != null ? String(r.crop_id) : null,
    session_date: String(r.session_date),
    use_pickers: Boolean(r.use_pickers),
    unit_type: String(r.unit_type ?? 'units'),
    total_units: num(r.total_units),
    container_type: String(r.container_type ?? 'containers'),
    total_containers: num(r.total_containers),
    destination: (String(r.destination ?? 'FARM').toUpperCase() as FallbackDestination) ?? 'FARM',
    price_per_unit: r.price_per_unit != null ? num(r.price_per_unit) : null,
    auto_units_sold: r.auto_units_sold == null ? true : Boolean(r.auto_units_sold),
    units_sold: r.units_sold != null ? num(r.units_sold) : null,
    picker_rate_per_unit: num(r.picker_rate_per_unit),
    total_revenue: num(r.total_revenue),
    total_expenses: num(r.total_expenses),
    net_profit: num(r.net_profit),
    status: String(r.status ?? 'collecting') as FallbackSessionStatus,
    created_by: String(r.created_by ?? ''),
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

export function rowToFallbackMarketDispatch(r: Record<string, unknown>): FallbackMarketDispatchRow {
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    harvest_session_id: String(r.harvest_session_id),
    market_name: String(r.market_name ?? ''),
    broker_employee_id: r.broker_employee_id != null ? String(r.broker_employee_id) : null,
    units_sent: num(r.units_sent),
    total_revenue: num(r.total_revenue),
    broker_sales_revenue: num(r.broker_sales_revenue),
    market_expenses_total: num(r.market_expenses_total),
    net_market_profit: num(r.net_market_profit),
    status: String(r.status ?? 'pending') as FallbackDispatchStatus,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

export async function listFallbackPickers(params: {
  companyId: string;
  sessionId: string;
}): Promise<FallbackPickerRow[]> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_session_pickers')
    .select('*')
    .eq('company_id', cid)
    .eq('harvest_session_id', params.sessionId)
    .order('sort_order', { ascending: true })
    .order('picker_number', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    company_id: String(r.company_id),
    harvest_session_id: String(r.harvest_session_id),
    picker_number: num(r.picker_number),
    name: String(r.name ?? ''),
    sort_order: num(r.sort_order),
    created_at: String(r.created_at ?? ''),
  }));
}

export async function addFallbackPicker(params: {
  companyId: string;
  sessionId: string;
  name: string;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { data: maxRow, error: maxErr } = await harvest()
    .from('fallback_session_pickers')
    .select('picker_number')
    .eq('company_id', cid)
    .eq('harvest_session_id', params.sessionId)
    .order('picker_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const next = maxRow?.picker_number != null ? Number(maxRow.picker_number) + 1 : 1;
  const { error } = await harvest()
    .from('fallback_session_pickers')
    .insert({
      company_id: cid,
      harvest_session_id: params.sessionId,
      picker_number: next,
      name: params.name,
      sort_order: next,
    } as any);
  if (error) throw error;
}

export async function listFallbackPickerLogs(params: {
  companyId: string;
  sessionId: string;
}): Promise<FallbackPickerLogRow[]> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_session_picker_logs')
    .select('*')
    .eq('company_id', cid)
    .eq('harvest_session_id', params.sessionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    company_id: String(r.company_id),
    harvest_session_id: String(r.harvest_session_id),
    picker_id: String(r.picker_id),
    units: num(r.units),
    created_at: String(r.created_at),
    recorded_by: String(r.recorded_by ?? ''),
  }));
}

export async function addFallbackPickerLog(params: {
  companyId: string;
  sessionId: string;
  pickerId: string;
  units: number;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { error } = await harvest()
    .from('fallback_session_picker_logs')
    .insert({
      company_id: cid,
      harvest_session_id: params.sessionId,
      picker_id: params.pickerId,
      units: params.units,
    } as any);
  if (error) throw error;
}

export async function listFallbackSessionsForProject(params: {
  companyId: string;
  projectId: string;
}): Promise<FallbackHarvestSessionRow[]> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_harvest_sessions')
    .select('*')
    .eq('company_id', cid)
    .eq('project_id', params.projectId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToFallbackHarvestSession(r as any));
}

export async function fetchFallbackSession(params: {
  companyId: string;
  sessionId: string;
}): Promise<FallbackHarvestSessionRow | null> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_harvest_sessions')
    .select('*')
    .eq('company_id', cid)
    .eq('id', params.sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToFallbackHarvestSession(data as any) : null;
}

export async function createFallbackSession(params: {
  companyId: string;
  projectId: string;
  cropId?: string | null;
  sessionDate?: string | null;
  unitType?: string;
  containerType?: string;
}): Promise<FallbackHarvestSessionRow> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_harvest_sessions')
    .insert({
      company_id: cid,
      project_id: params.projectId,
      crop_id: params.cropId ?? null,
      session_date: params.sessionDate ?? undefined,
      unit_type: params.unitType ?? 'bags',
      container_type: params.containerType ?? 'bags',
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToFallbackHarvestSession(data as any);
}

export async function updateFallbackSession(params: {
  companyId: string;
  sessionId: string;
  patch: Partial<Pick<
    FallbackHarvestSessionRow,
    | 'use_pickers'
    | 'unit_type'
    | 'container_type'
    | 'total_containers'
    | 'destination'
    | 'price_per_unit'
    | 'auto_units_sold'
    | 'units_sold'
    | 'picker_rate_per_unit'
    | 'status'
    | 'session_date'
  >>;
}): Promise<FallbackHarvestSessionRow> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_harvest_sessions')
    .update(params.patch as any)
    .eq('company_id', cid)
    .eq('id', params.sessionId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToFallbackHarvestSession(data as any);
}

export async function addDirectIntakeUnits(params: {
  companyId: string;
  sessionId: string;
  units: number;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { error } = await harvest()
    .from('fallback_harvest_units')
    .insert({
      company_id: cid,
      harvest_session_id: params.sessionId,
      units: params.units,
    });
  if (error) throw error;
}

export async function fetchFallbackMarketDispatchForSession(params: {
  companyId: string;
  sessionId: string;
}): Promise<FallbackMarketDispatchRow | null> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_market_dispatches')
    .select('*')
    .eq('company_id', cid)
    .eq('harvest_session_id', params.sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToFallbackMarketDispatch(data as any) : null;
}

export async function upsertFallbackMarketDispatch(params: {
  companyId: string;
  sessionId: string;
  marketName: string;
  brokerEmployeeId: string | null;
  unitsSent: number;
}): Promise<FallbackMarketDispatchRow> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_market_dispatches')
    .upsert(
      {
        company_id: cid,
        harvest_session_id: params.sessionId,
        market_name: params.marketName,
        broker_employee_id: params.brokerEmployeeId,
        units_sent: params.unitsSent,
      },
      { onConflict: 'harvest_session_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return rowToFallbackMarketDispatch(data as any);
}

export async function listFallbackMarketSalesEntries(params: {
  companyId: string;
  dispatchId: string;
}): Promise<FallbackMarketSalesEntryRow[]> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_market_sales_entries')
    .select('*')
    .eq('company_id', cid)
    .eq('market_dispatch_id', params.dispatchId)
    .order('entry_number', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    company_id: String(r.company_id),
    market_dispatch_id: String(r.market_dispatch_id),
    entry_number: num(r.entry_number),
    buyer_label: r.buyer_label != null ? String(r.buyer_label) : null,
    price_per_unit: num(r.price_per_unit),
    quantity: num(r.quantity),
    line_total: num(r.line_total),
    created_at: String(r.created_at),
  }));
}

export async function addFallbackMarketSalesEntry(params: {
  companyId: string;
  dispatchId: string;
  buyerLabel?: string | null;
  pricePerUnit: number;
  quantity: number;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { data: maxRow, error: maxErr } = await harvest()
    .from('fallback_market_sales_entries')
    .select('entry_number')
    .eq('company_id', cid)
    .eq('market_dispatch_id', params.dispatchId)
    .order('entry_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const next = maxRow?.entry_number != null ? Number(maxRow.entry_number) + 1 : 1;

  const { error } = await harvest()
    .from('fallback_market_sales_entries')
    .insert({
      company_id: cid,
      market_dispatch_id: params.dispatchId,
      entry_number: next,
      buyer_label: params.buyerLabel ?? null,
      price_per_unit: params.pricePerUnit,
      quantity: params.quantity,
    });
  if (error) throw error;
}

export async function deleteFallbackMarketSalesEntry(params: {
  companyId: string;
  entryId: string;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { error } = await harvest()
    .from('fallback_market_sales_entries')
    .delete()
    .eq('company_id', cid)
    .eq('id', params.entryId);
  if (error) throw error;
}

export async function listFallbackMarketExpenseLines(params: {
  companyId: string;
  dispatchId: string;
}): Promise<FallbackMarketExpenseLineRow[]> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_market_expense_lines')
    .select('*')
    .eq('company_id', cid)
    .eq('market_dispatch_id', params.dispatchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    company_id: String(r.company_id),
    market_dispatch_id: String(r.market_dispatch_id),
    category: String(r.category ?? ''),
    amount: num(r.amount),
    created_at: String(r.created_at),
  }));
}

export async function addFallbackMarketExpenseLines(params: {
  companyId: string;
  dispatchId: string;
  lines: Array<{ category: string; amount: number }>;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const rows = params.lines
    .map((l) => ({ category: String(l.category ?? '').trim(), amount: l.amount }))
    .filter((l) => l.category.length > 0 && Number.isFinite(Number(l.amount)) && Number(l.amount) >= 0)
    .map((l) => ({
      company_id: cid,
      market_dispatch_id: params.dispatchId,
      category: l.category,
      amount: Number(l.amount),
    }));
  if (rows.length === 0) return;
  const { error } = await harvest().from('fallback_market_expense_lines').insert(rows as any);
  if (error) throw error;
}

export async function listFallbackExpenseTemplates(params: {
  companyId: string;
  search?: string | null;
  limit?: number;
}): Promise<FallbackMarketExpenseTemplateRow[]> {
  const cid = requireCompanyId(params.companyId);
  const q = harvest()
    .from('fallback_market_expense_templates')
    .select('*')
    .eq('company_id', cid)
    .order('usage_count', { ascending: false })
    .limit(params.limit ?? 30);
  if (params.search && params.search.trim()) {
    q.ilike('name', `%${params.search.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    company_id: String(r.company_id),
    name: String(r.name ?? ''),
    last_used_amount: r.last_used_amount != null ? num(r.last_used_amount) : null,
    usage_count: num(r.usage_count),
    updated_at: String(r.updated_at ?? ''),
  }));
}

export async function recordFallbackExpenseTemplateUsage(params: {
  companyId: string;
  name: string;
  lastUsedAmount?: number | null;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const norm = params.name.trim();
  if (!norm) return;
  const { data: existing, error: selErr } = await harvest()
    .from('fallback_market_expense_templates')
    .select('id,usage_count')
    .eq('company_id', cid)
    .ilike('name', norm)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!existing?.id) {
    const { error } = await harvest()
      .from('fallback_market_expense_templates')
      .insert({
        company_id: cid,
        name: norm,
        last_used_amount: params.lastUsedAmount ?? null,
        usage_count: 1,
      } as any);
    if (error) throw error;
    return;
  }
  const { error } = await harvest()
    .from('fallback_market_expense_templates')
    .update({
      last_used_amount: params.lastUsedAmount ?? null,
      usage_count: num(existing.usage_count) + 1,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('company_id', cid)
    .eq('id', String(existing.id));
  if (error) throw error;
}

export async function linkFinanceExpenseToFallbackSession(params: {
  companyId: string;
  expenseId: string;
  projectId?: string | null;
  sessionId: string;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { error } = await finance()
    .from('expense_links')
    .insert({
      company_id: cid,
      project_id: params.projectId ?? null,
      expense_id: params.expenseId,
      ref_type: 'fallback_harvest_session',
      ref_id: params.sessionId,
    } as any);
  if (error) throw error;
}

