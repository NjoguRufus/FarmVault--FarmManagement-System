/**
 * Tomato harvest sessions — Supabase harvest schema.
 * Tables: tomato_harvest_sessions, tomato_harvest_pickers, tomato_harvest_picker_logs
 */

import { supabase } from '@/lib/supabase';
import { requireCompanyId } from '@/lib/db';
import { harvestOrdinalTitle } from '@/lib/tomatoHarvestTally';

const harvestSchema = () => supabase.schema('harvest');

export type TomatoPackagingType = 'crates' | 'wooden_boxes' | 'sacks';
export type TomatoSaleMode = 'farm_gate' | 'market';
export type TomatoHarvestStatus = 'collecting' | 'completed';

export type TomatoHarvestSessionRow = {
  id: string;
  company_id: string;
  project_id: string;
  crop_id: string | null;
  harvest_number: number;
  session_date: string;
  packaging_type: string | null;
  packaging_count: number;
  sale_mode: string | null;
  price_per_container: number | null;
  sale_units: number | null;
  total_revenue: number | null;
  picker_rate_per_bucket: number;
  status: TomatoHarvestStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TomatoMarketDispatchStatus = 'pending' | 'completed';

export type TomatoMarketDispatchRow = {
  id: string;
  company_id: string;
  harvest_session_id: string;
  market_name: string;
  broker_employee_id: string | null;
  containers_sent: number;
  price_per_container: number | null;
  total_revenue: number | null;
  /** Sum of broker buyer lines (notebook). */
  broker_sales_revenue?: number;
  /** Broker-recorded market costs. */
  market_expenses_total?: number;
  /** broker_sales_revenue − market_expenses_total. */
  net_market_profit?: number;
  status: TomatoMarketDispatchStatus;
  created_at: string;
  updated_at: string;
};

export type TomatoCustomMarketRow = {
  id: string;
  company_id: string;
  name: string;
  location: string | null;
  created_at: string;
};

export type TomatoHarvestPickerRow = {
  id: string;
  company_id: string;
  harvest_session_id: string;
  picker_number: number;
  name: string;
  sort_order: number;
  created_at: string;
};

export type TomatoHarvestPickerLogRow = {
  id: string;
  company_id: string;
  harvest_session_id: string;
  picker_id: string;
  units: number;
  created_at: string;
  recorded_by: string;
};

export type TomatoSessionSummary = {
  session: TomatoHarvestSessionRow;
  dispatch: TomatoMarketDispatchRow | null;
  totalBuckets: number;
  pickerCount: number;
  pickerCost: number;
  revenue: number;
  netProfit: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function computePickerCost(totalBuckets: number, ratePerBucket: number): number {
  return Math.round(totalBuckets * ratePerBucket);
}

/** Farm gate: session totals. Market: completed dispatch; legacy session-only market rows still supported. */
export function computeRevenue(
  session: TomatoHarvestSessionRow,
  dispatch?: TomatoMarketDispatchRow | null,
): number {
  if (session.sale_mode === 'market') {
    if (dispatch) {
      // Prefer broker notebook totals when available — they’re updated live even while dispatch is pending.
      const brokerRev = dispatch.broker_sales_revenue;
      if (brokerRev != null && Number.isFinite(Number(brokerRev)) && Number(brokerRev) > 0) {
        return Math.round(Number(brokerRev));
      }
      const tr = dispatch.total_revenue;
      if (tr != null && Number.isFinite(Number(tr)) && Number(tr) >= 0) {
        return Math.round(Number(tr));
      }
      if (dispatch.status !== 'completed') return 0;
      const dp = dispatch.price_per_container != null ? Number(dispatch.price_per_container) : 0;
      const sent = dispatch.containers_sent ?? 0;
      if (dp > 0 && sent > 0) return Math.round(dp * sent);
      return 0;
    }
    if (session.total_revenue != null && Number.isFinite(Number(session.total_revenue))) {
      return Math.round(Number(session.total_revenue));
    }
    const price = session.price_per_container != null ? Number(session.price_per_container) : 0;
    const units = session.sale_units != null ? Number(session.sale_units) : 0;
    if (price > 0 && units > 0) return Math.round(price * units);
    return 0;
  }
  if (session.total_revenue != null && Number.isFinite(Number(session.total_revenue))) {
    return Math.round(Number(session.total_revenue));
  }
  const price = session.price_per_container != null ? Number(session.price_per_container) : 0;
  const units = session.sale_units != null ? Number(session.sale_units) : 0;
  if (price > 0 && units > 0) return Math.round(price * units);
  return 0;
}

export function computeNet(revenue: number, pickerCost: number): number {
  return Math.round(revenue - pickerCost);
}

function mapTomatoSessionSummaryRow(
  session: TomatoHarvestSessionRow,
  totalBuckets: number,
  pickerCount: number,
  dispatch: TomatoMarketDispatchRow | null = null,
): TomatoSessionSummary {
  const pickerCost = computePickerCost(totalBuckets, Number(session.picker_rate_per_bucket));
  const revenue = computeRevenue(session, dispatch);
  const marketExpenses =
    session.sale_mode === 'market' && dispatch?.market_expenses_total != null
      ? Math.round(Number(dispatch.market_expenses_total) || 0)
      : 0;
  const netProfit =
    session.sale_mode === 'market' && dispatch
      ? Math.round(revenue - pickerCost - marketExpenses)
      : computeNet(revenue, pickerCost);
  return {
    session,
    dispatch,
    totalBuckets,
    pickerCount,
    pickerCost,
    revenue,
    netProfit,
  };
}

export function rowToTomatoMarketDispatch(r: Record<string, unknown>): TomatoMarketDispatchRow {
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    harvest_session_id: String(r.harvest_session_id),
    market_name: String(r.market_name ?? ''),
    broker_employee_id: r.broker_employee_id != null ? String(r.broker_employee_id) : null,
    containers_sent: num(r.containers_sent),
    price_per_container: r.price_per_container != null ? Number(r.price_per_container) : null,
    total_revenue: r.total_revenue != null ? Number(r.total_revenue) : null,
    broker_sales_revenue:
      r.broker_sales_revenue != null ? Number(r.broker_sales_revenue) : undefined,
    market_expenses_total:
      r.market_expenses_total != null ? Number(r.market_expenses_total) : undefined,
    net_market_profit: r.net_market_profit != null ? Number(r.net_market_profit) : undefined,
    status: r.status === 'completed' ? 'completed' : 'pending',
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

/** Summaries RPC returns md_* columns alongside session fields. */
function dispatchFromSummariesRpc(
  row: Record<string, unknown>,
  sessionId: string,
  companyId: string,
): TomatoMarketDispatchRow | null {
  if (row.md_id == null) return null;
  return {
    id: String(row.md_id),
    company_id: companyId,
    harvest_session_id: sessionId,
    market_name: String(row.md_market_name ?? ''),
    broker_employee_id: row.md_broker_employee_id != null ? String(row.md_broker_employee_id) : null,
    containers_sent: num(row.md_containers_sent),
    price_per_container: row.md_price_per_container != null ? Number(row.md_price_per_container) : null,
    total_revenue: row.md_total_revenue != null ? Number(row.md_total_revenue) : null,
    broker_sales_revenue:
      row.md_broker_sales_revenue != null ? Number(row.md_broker_sales_revenue) : undefined,
    market_expenses_total:
      row.md_market_expenses_total != null ? Number(row.md_market_expenses_total) : undefined,
    net_market_profit:
      row.md_net_market_profit != null ? Number(row.md_net_market_profit) : undefined,
    status: row.md_status === 'completed' ? 'completed' : 'pending',
    created_at: '',
    updated_at: '',
  };
}

function rowToTomatoHarvestSession(r: Record<string, unknown>): TomatoHarvestSessionRow {
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    project_id: String(r.project_id),
    crop_id: r.crop_id != null ? String(r.crop_id) : null,
    harvest_number: num(r.harvest_number),
    session_date: String(r.session_date),
    packaging_type: r.packaging_type != null ? String(r.packaging_type) : null,
    packaging_count: num(r.packaging_count),
    sale_mode: r.sale_mode != null ? String(r.sale_mode) : null,
    price_per_container: r.price_per_container != null ? Number(r.price_per_container) : null,
    sale_units: r.sale_units != null ? num(r.sale_units) : null,
    total_revenue: r.total_revenue != null ? Number(r.total_revenue) : null,
    picker_rate_per_bucket: num(r.picker_rate_per_bucket),
    status: r.status as TomatoHarvestStatus,
    created_by: String(r.created_by),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

/** Legacy: 3 requests (sessions + parallel logs/pickers). Used if RPC is unavailable. */
async function fetchTomatoSessionsForProjectBatched(params: {
  companyId: string;
  projectId: string;
}): Promise<TomatoSessionSummary[]> {
  const companyId = requireCompanyId(params.companyId);
  const { data: sessions, error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .select('*')
    .eq('company_id', companyId)
    .eq('project_id', params.projectId)
    .order('session_date', { ascending: false })
    .order('harvest_number', { ascending: false });

  if (error) throw error;
  const rows = (sessions ?? []) as TomatoHarvestSessionRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [{ data: logs, error: logErr }, { data: pickers, error: pickErr }, { data: dispatches, error: dispErr }] =
    await Promise.all([
      harvestSchema()
        .from('tomato_harvest_picker_logs')
        .select('harvest_session_id,units')
        .eq('company_id', companyId)
        .in('harvest_session_id', ids),
      harvestSchema()
        .from('tomato_harvest_pickers')
        .select('harvest_session_id')
        .eq('company_id', companyId)
        .in('harvest_session_id', ids),
      harvestSchema()
        .from('tomato_market_dispatches')
        .select('*')
        .eq('company_id', companyId)
        .in('harvest_session_id', ids),
    ]);

  if (logErr) throw logErr;
  if (pickErr) throw pickErr;
  if (dispErr) throw dispErr;

  const dispatchBySession = new Map<string, TomatoMarketDispatchRow>();
  for (const raw of dispatches ?? []) {
    const d = rowToTomatoMarketDispatch(raw as Record<string, unknown>);
    dispatchBySession.set(d.harvest_session_id, d);
  }

  const bucketsBySession = new Map<string, number>();
  for (const l of logs ?? []) {
    const sid = String((l as { harvest_session_id: string }).harvest_session_id);
    const u = num((l as { units: unknown }).units);
    bucketsBySession.set(sid, (bucketsBySession.get(sid) ?? 0) + u);
  }

  const pickersBySession = new Map<string, number>();
  for (const p of pickers ?? []) {
    const sid = String((p as { harvest_session_id: string }).harvest_session_id);
    pickersBySession.set(sid, (pickersBySession.get(sid) ?? 0) + 1);
  }

  return rows.map((session) => {
    const totalBuckets = bucketsBySession.get(session.id) ?? 0;
    const pickerCount = pickersBySession.get(session.id) ?? 0;
    const dispatch = dispatchBySession.get(session.id) ?? null;
    return mapTomatoSessionSummaryRow(session, totalBuckets, pickerCount, dispatch);
  });
}

/** Single DB round-trip when migration `tomato_harvest_sessions_summaries_for_project` is applied. */
export async function fetchTomatoSessionsForProject(params: {
  companyId: string;
  projectId: string;
}): Promise<TomatoSessionSummary[]> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvestSchema().rpc('tomato_harvest_sessions_summaries_for_project', {
    p_company_id: companyId,
    p_project_id: params.projectId,
  });

  if (error || data == null) {
    return fetchTomatoSessionsForProjectBatched(params);
  }

  const rpcRows = data as Record<string, unknown>[];
  return rpcRows.map((row) => {
    const session = rowToTomatoHarvestSession(row);
    const totalBuckets = num(row.total_buckets);
    const pickerCount = num(row.picker_count);
    const dispatch = dispatchFromSummariesRpc(row, session.id, session.company_id);
    return mapTomatoSessionSummaryRow(session, totalBuckets, pickerCount, dispatch);
  });
}

export async function getNextHarvestNumber(params: { companyId: string; projectId: string }): Promise<number> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .select('harvest_number')
    .eq('company_id', companyId)
    .eq('project_id', params.projectId)
    .order('harvest_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const last = data?.harvest_number != null ? Number(data.harvest_number) : 0;
  return last + 1;
}

export async function createTomatoHarvestSession(params: {
  companyId: string;
  projectId: string;
  sessionDate: string;
  cropId?: string | null;
  /** KES paid per picker bucket; defaults to 30 in DB if omitted */
  pickerRatePerBucket?: number;
}): Promise<TomatoHarvestSessionRow> {
  const companyId = requireCompanyId(params.companyId);
  const harvest_number = await getNextHarvestNumber({ companyId, projectId: params.projectId });
  const rate =
    params.pickerRatePerBucket != null && Number.isFinite(Number(params.pickerRatePerBucket))
      ? Math.max(0, Number(params.pickerRatePerBucket))
      : undefined;
  const { data, error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .insert({
      company_id: companyId,
      project_id: params.projectId,
      crop_id: params.cropId ?? null,
      harvest_number,
      session_date: params.sessionDate,
      sale_mode: 'market',
      ...(rate != null ? { picker_rate_per_bucket: rate } : {}),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TomatoHarvestSessionRow;
}

export async function fetchTomatoSession(params: {
  companyId: string;
  sessionId: string;
}): Promise<TomatoHarvestSessionRow | null> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', params.sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as TomatoHarvestSessionRow) ?? null;
}

export async function fetchTomatoMarketDispatchBySession(params: {
  companyId: string;
  sessionId: string;
}): Promise<TomatoMarketDispatchRow | null> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvestSchema()
    .from('tomato_market_dispatches')
    .select('*')
    .eq('company_id', companyId)
    .eq('harvest_session_id', params.sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTomatoMarketDispatch(data as Record<string, unknown>) : null;
}

export async function upsertTomatoMarketDispatch(params: {
  companyId: string;
  sessionId: string;
  marketName: string;
  brokerEmployeeId: string | null;
  containersSent: number;
  pricePerContainer: number | null;
  totalRevenue: number | null;
  status: TomatoMarketDispatchStatus;
}): Promise<TomatoMarketDispatchRow> {
  const companyId = requireCompanyId(params.companyId);
  const payload = {
    company_id: companyId,
    harvest_session_id: params.sessionId,
    market_name: params.marketName.trim(),
    broker_employee_id: params.brokerEmployeeId,
    containers_sent: Math.max(0, Math.floor(params.containersSent)),
    price_per_container: params.pricePerContainer,
    total_revenue: params.totalRevenue,
    status: params.status,
  };
  const { data, error } = await harvestSchema()
    .from('tomato_market_dispatches')
    .upsert(payload, { onConflict: 'harvest_session_id' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToTomatoMarketDispatch(data as Record<string, unknown>);
}

export async function deleteTomatoMarketDispatchForSession(params: {
  companyId: string;
  sessionId: string;
}): Promise<void> {
  const companyId = requireCompanyId(params.companyId);
  const { error } = await harvestSchema()
    .from('tomato_market_dispatches')
    .delete()
    .eq('company_id', companyId)
    .eq('harvest_session_id', params.sessionId);
  if (error) throw error;
}

export async function listTomatoCustomMarkets(companyId: string): Promise<TomatoCustomMarketRow[]> {
  const cid = requireCompanyId(companyId);
  const { data, error } = await harvestSchema()
    .from('tomato_custom_markets')
    .select('*')
    .eq('company_id', cid)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String((r as Record<string, unknown>).id),
    company_id: String((r as Record<string, unknown>).company_id),
    name: String((r as Record<string, unknown>).name ?? ''),
    location: (r as Record<string, unknown>).location != null ? String((r as Record<string, unknown>).location) : null,
    created_at: String((r as Record<string, unknown>).created_at ?? ''),
  }));
}

export async function insertTomatoCustomMarket(params: {
  companyId: string;
  name: string;
  location?: string | null;
}): Promise<TomatoCustomMarketRow> {
  const companyId = requireCompanyId(params.companyId);
  const name = params.name.trim();
  if (!name) throw new Error('Market name is required');
  const { data, error } = await harvestSchema()
    .from('tomato_custom_markets')
    .insert({
      company_id: companyId,
      name,
      location: params.location?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    name: String(r.name ?? ''),
    location: r.location != null ? String(r.location) : null,
    created_at: String(r.created_at ?? ''),
  };
}

export type TomatoMarketRevenueByMarketRow = {
  market_name: string;
  total_revenue: number;
  completed_count: number;
  pending_count: number;
};

export async function fetchTomatoRevenueByMarket(companyId: string): Promise<TomatoMarketRevenueByMarketRow[]> {
  const cid = requireCompanyId(companyId);
  const { data, error } = await harvestSchema().rpc('tomato_market_revenue_by_market', {
    p_company_id: cid,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    market_name: String(r.market_name ?? ''),
    total_revenue: num(r.total_revenue),
    completed_count: num(r.completed_count),
    pending_count: num(r.pending_count),
  }));
}

export async function fetchPickersForSession(params: {
  companyId: string;
  sessionId: string;
}): Promise<TomatoHarvestPickerRow[]> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvestSchema()
    .from('tomato_harvest_pickers')
    .select('*')
    .eq('company_id', companyId)
    .eq('harvest_session_id', params.sessionId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TomatoHarvestPickerRow[];
}

export async function fetchLogsForSession(params: {
  companyId: string;
  sessionId: string;
}): Promise<TomatoHarvestPickerLogRow[]> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvestSchema()
    .from('tomato_harvest_picker_logs')
    .select('*')
    .eq('company_id', companyId)
    .eq('harvest_session_id', params.sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TomatoHarvestPickerLogRow[];
}

export type PickerWithBuckets = TomatoHarvestPickerRow & { bucketCount: number };

export function mergePickersWithBuckets(
  pickers: TomatoHarvestPickerRow[],
  logs: TomatoHarvestPickerLogRow[],
): PickerWithBuckets[] {
  const byPicker = new Map<string, number>();
  for (const l of logs) {
    byPicker.set(l.picker_id, (byPicker.get(l.picker_id) ?? 0) + num(l.units));
  }
  return pickers.map((p) => ({
    ...p,
    bucketCount: byPicker.get(p.id) ?? 0,
  }));
}

export async function addTomatoPicker(params: {
  companyId: string;
  sessionId: string;
  pickerNumber: number;
  name: string;
}): Promise<TomatoHarvestPickerRow> {
  const companyId = requireCompanyId(params.companyId);
  const { data: maxRow } = await harvestSchema()
    .from('tomato_harvest_pickers')
    .select('sort_order')
    .eq('harvest_session_id', params.sessionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = maxRow?.sort_order != null ? Number(maxRow.sort_order) + 1 : 0;

  const { data, error } = await harvestSchema()
    .from('tomato_harvest_pickers')
    .insert({
      company_id: companyId,
      harvest_session_id: params.sessionId,
      picker_number: params.pickerNumber,
      name: params.name.trim(),
      sort_order: sortOrder,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TomatoHarvestPickerRow;
}

export async function addTomatoBucketLog(params: {
  companyId: string;
  sessionId: string;
  pickerId: string;
  units?: number;
}): Promise<TomatoHarvestPickerLogRow> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvestSchema()
    .from('tomato_harvest_picker_logs')
    .insert({
      company_id: companyId,
      harvest_session_id: params.sessionId,
      picker_id: params.pickerId,
      units: params.units ?? 1,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TomatoHarvestPickerLogRow;
}

export async function undoLastTomatoBucketLog(params: {
  companyId: string;
  sessionId: string;
}): Promise<{ deleted: TomatoHarvestPickerLogRow | null }> {
  const companyId = requireCompanyId(params.companyId);
  const { data: last, error: selErr } = await harvestSchema()
    .from('tomato_harvest_picker_logs')
    .select('*')
    .eq('company_id', companyId)
    .eq('harvest_session_id', params.sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!last?.id) return { deleted: null };

  const { error: delErr } = await harvestSchema()
    .from('tomato_harvest_picker_logs')
    .delete()
    .eq('id', last.id)
    .eq('company_id', companyId);
  if (delErr) throw delErr;
  return { deleted: last as TomatoHarvestPickerLogRow };
}

export async function updateTomatoSessionPackaging(params: {
  companyId: string;
  sessionId: string;
  packagingType: TomatoPackagingType | null;
  packagingCount: number;
}): Promise<void> {
  const companyId = requireCompanyId(params.companyId);
  const { error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .update({
      packaging_type: params.packagingType,
      packaging_count: Math.max(0, Math.floor(params.packagingCount)),
    })
    .eq('id', params.sessionId)
    .eq('company_id', companyId);
  if (error) throw error;
}

export async function updateTomatoSessionSales(params: {
  companyId: string;
  sessionId: string;
  saleMode: TomatoSaleMode | null;
  pricePerContainer: number | null;
  saleUnits: number | null;
  totalRevenue: number | null;
}): Promise<void> {
  const companyId = requireCompanyId(params.companyId);
  const { error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .update({
      sale_mode: params.saleMode,
      price_per_container: params.pricePerContainer,
      sale_units: params.saleUnits,
      total_revenue: params.totalRevenue,
    })
    .eq('id', params.sessionId)
    .eq('company_id', companyId);
  if (error) throw error;
}

export async function updateTomatoSessionPickerRate(params: {
  companyId: string;
  sessionId: string;
  pickerRatePerBucket: number;
}): Promise<void> {
  const companyId = requireCompanyId(params.companyId);
  const { error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .update({ picker_rate_per_bucket: Math.max(0, params.pickerRatePerBucket) })
    .eq('id', params.sessionId)
    .eq('company_id', companyId);
  if (error) throw error;
}

export async function updateTomatoSessionStatus(params: {
  companyId: string;
  sessionId: string;
  status: TomatoHarvestStatus;
}): Promise<void> {
  const companyId = requireCompanyId(params.companyId);
  const { error } = await harvestSchema()
    .from('tomato_harvest_sessions')
    .update({ status: params.status })
    .eq('id', params.sessionId)
    .eq('company_id', companyId);
  if (error) throw error;
}

/** Company (or single-project) rollup for dashboard + analytics — DB RPC when available. */
export type TomatoCompanyAggregate = {
  totalRevenue: number;
  totalBuckets: number;
  totalCrates: number;
  pickerCost: number;
  pendingMarketDispatches: number;
  totalMarketExpenses?: number;
};

export async function fetchTomatoCompanyAggregate(
  companyId: string,
  projectId?: string | null,
): Promise<TomatoCompanyAggregate> {
  const cid = requireCompanyId(companyId);
  const { data, error } = await harvestSchema().rpc('company_tomato_harvest_aggregate', {
    p_company_id: cid,
    p_project_id: projectId ?? null,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return {
      totalRevenue: 0,
      totalBuckets: 0,
      totalCrates: 0,
      pickerCost: 0,
      pendingMarketDispatches: 0,
      totalMarketExpenses: 0,
    };
  }
  const row = data[0] as Record<string, unknown>;
  return {
    totalRevenue: num(row.total_revenue),
    totalBuckets: num(row.total_buckets),
    totalCrates: num(row.total_crates),
    pickerCost: num(row.picker_cost),
    pendingMarketDispatches: num(row.pending_market_dispatches),
    totalMarketExpenses:
      row.total_market_expenses != null ? num(row.total_market_expenses) : undefined,
  };
}

export type TomatoMonthlyRevenueRow = { month: string; revenue: number };

function monthKeyFromRpc(d: unknown): string {
  if (d == null) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/** Per-month tomato session revenue for merging into analytics monthly trend. */
export async function fetchTomatoMonthlyRevenueByCompany(companyId: string): Promise<TomatoMonthlyRevenueRow[]> {
  const cid = requireCompanyId(companyId);
  const { data, error } = await harvestSchema().rpc('company_tomato_monthly_revenue', {
    p_company_id: cid,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    month: monthKeyFromRpc(r.month),
    revenue: num(r.revenue),
  }));
}

export function sessionDisplayTitle(session: TomatoHarvestSessionRow): string {
  return harvestOrdinalTitle(session.harvest_number);
}
