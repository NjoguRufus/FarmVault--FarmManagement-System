/**
 * Sales broker UI — tomato market dispatches, buyer notebook, market expense lines, templates.
 * RLS: brokers only see rows for dispatches assigned to their employee record.
 */

import { supabase } from '@/lib/supabase';
import { requireCompanyId } from '@/lib/db';
import {
  rowToTomatoMarketDispatch,
  type TomatoHarvestSessionRow,
  type TomatoMarketDispatchRow,
} from '@/services/tomatoHarvestService';

const harvest = () => supabase.schema('harvest');

function num(v: unknown): number {
  if (v == null) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export type TomatoMarketSalesEntryRow = {
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

export type TomatoMarketExpenseLineRow = {
  id: string;
  company_id: string;
  market_dispatch_id: string;
  category: string;
  amount: number;
  created_at: string;
};

export type TomatoMarketExpenseTemplateRow = {
  id: string;
  company_id: string;
  name: string;
  last_used_amount: number | null;
  usage_count: number;
  updated_at: string;
};

export type BrokerDispatchWithSession = {
  dispatch: TomatoMarketDispatchRow;
  session: Pick<
    TomatoHarvestSessionRow,
    'id' | 'project_id' | 'packaging_count' | 'packaging_type' | 'harvest_number' | 'session_date' | 'sale_mode'
  > | null;
};

export async function listBrokerTomatoDispatchesWithSessions(
  companyId: string,
): Promise<BrokerDispatchWithSession[]> {
  const cid = requireCompanyId(companyId);
  const { data: dispatches, error } = await harvest()
    .from('tomato_market_dispatches')
    .select('*')
    .eq('company_id', cid)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (dispatches ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const sessionIds = [...new Set(rows.map((r) => String(r.harvest_session_id)))];
  const { data: sessions, error: sErr } = await harvest()
    .from('tomato_harvest_sessions')
    .select('id, project_id, packaging_count, packaging_type, harvest_number, session_date, sale_mode')
    .eq('company_id', cid)
    .in('id', sessionIds);
  if (sErr) throw sErr;

  const sessionById = new Map(
    (sessions ?? []).map((s) => {
      const r = s as Record<string, unknown>;
      return [
        String(r.id),
        {
          id: String(r.id),
          project_id: String(r.project_id),
          packaging_count: num(r.packaging_count),
          packaging_type: r.packaging_type != null ? String(r.packaging_type) : null,
          harvest_number: num(r.harvest_number),
          session_date: String(r.session_date),
          sale_mode: r.sale_mode != null ? String(r.sale_mode) : null,
        } as BrokerDispatchWithSession['session'],
      ];
    }),
  );

  return rows.map((r) => ({
    dispatch: rowToTomatoMarketDispatch(r),
    session: sessionById.get(String(r.harvest_session_id)) ?? null,
  }));
}

export async function fetchTomatoMarketDispatchById(params: {
  companyId: string;
  dispatchId: string;
}): Promise<TomatoMarketDispatchRow | null> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('tomato_market_dispatches')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', params.dispatchId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTomatoMarketDispatch(data as Record<string, unknown>) : null;
}

export async function sumCratesSoldByDispatchIds(
  companyId: string,
  dispatchIds: string[],
): Promise<Map<string, number>> {
  const cid = requireCompanyId(companyId);
  const map = new Map<string, number>();
  if (dispatchIds.length === 0) return map;
  const { data, error } = await harvest()
    .from('tomato_market_sales_entries')
    .select('market_dispatch_id, quantity')
    .eq('company_id', cid)
    .in('market_dispatch_id', dispatchIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const r = row as { market_dispatch_id: string; quantity: unknown };
    const id = String(r.market_dispatch_id);
    map.set(id, (map.get(id) ?? 0) + Math.max(0, Math.floor(num(r.quantity))));
  }
  return map;
}

export async function listTomatoMarketSalesEntries(params: {
  companyId: string;
  dispatchId: string;
}): Promise<TomatoMarketSalesEntryRow[]> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('tomato_market_sales_entries')
    .select('*')
    .eq('company_id', cid)
    .eq('market_dispatch_id', params.dispatchId)
    .order('entry_number', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      company_id: String(r.company_id),
      market_dispatch_id: String(r.market_dispatch_id),
      entry_number: num(r.entry_number),
      buyer_label: r.buyer_label != null ? String(r.buyer_label) : null,
      price_per_unit: num(r.price_per_unit),
      quantity: Math.max(1, Math.floor(num(r.quantity))),
      line_total: num(r.line_total),
      created_at: String(r.created_at ?? ''),
    };
  });
}

export async function insertTomatoMarketSalesEntry(params: {
  companyId: string;
  dispatchId: string;
  buyerLabel?: string | null;
  pricePerUnit: number;
  quantity: number;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { error } = await harvest().from('tomato_market_sales_entries').insert({
    company_id: cid,
    market_dispatch_id: params.dispatchId,
    entry_number: 0,
    buyer_label: params.buyerLabel?.trim() || null,
    price_per_unit: Math.max(0, Number(params.pricePerUnit) || 0),
    quantity: Math.max(1, Math.floor(Number(params.quantity) || 1)),
  });
  if (error) throw error;
}

export async function deleteTomatoMarketSalesEntry(params: {
  companyId: string;
  entryId: string;
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { error } = await harvest()
    .from('tomato_market_sales_entries')
    .delete()
    .eq('company_id', cid)
    .eq('id', params.entryId);
  if (error) throw error;
}

export async function listTomatoMarketExpenseLines(params: {
  companyId: string;
  dispatchId: string;
}): Promise<TomatoMarketExpenseLineRow[]> {
  const cid = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('tomato_market_expense_lines')
    .select('*')
    .eq('company_id', cid)
    .eq('market_dispatch_id', params.dispatchId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      company_id: String(r.company_id),
      market_dispatch_id: String(r.market_dispatch_id),
      category: String(r.category ?? ''),
      amount: num(r.amount),
      created_at: String(r.created_at ?? ''),
    };
  });
}

export async function insertTomatoMarketExpenseLines(params: {
  companyId: string;
  dispatchId: string;
  lines: { category: string; amount: number }[];
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const rows = params.lines
    .map((l) => ({
      company_id: cid,
      market_dispatch_id: params.dispatchId,
      category: l.category.trim(),
      amount: Math.max(0, Math.round(Number(l.amount) || 0)),
    }))
    .filter((l) => l.category.length > 0 && l.amount >= 0);
  if (rows.length === 0) return;
  const { error } = await harvest().from('tomato_market_expense_lines').insert(rows);
  if (error) throw error;
}

export async function listTomatoMarketExpenseTemplates(companyId: string): Promise<TomatoMarketExpenseTemplateRow[]> {
  const cid = requireCompanyId(companyId);
  const { data, error } = await harvest()
    .from('tomato_market_expense_templates')
    .select('*')
    .eq('company_id', cid)
    .order('usage_count', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      company_id: String(r.company_id),
      name: String(r.name ?? ''),
      last_used_amount: r.last_used_amount != null ? num(r.last_used_amount) : null,
      usage_count: num(r.usage_count),
      updated_at: String(r.updated_at ?? ''),
    };
  });
}

/** Upsert template usage after saving expense lines (company-wide names). */
export async function applyTomatoMarketExpenseTemplateUsage(params: {
  companyId: string;
  lines: { name: string; amount: number }[];
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const templates = await listTomatoMarketExpenseTemplates(cid);
  const byLower = new Map(templates.map((t) => [t.name.trim().toLowerCase(), t]));

  for (const line of params.lines) {
    const name = line.name.trim();
    if (!name) continue;
    const amount = Math.max(0, Math.round(Number(line.amount) || 0));
    const key = name.toLowerCase();
    const existing = byLower.get(key);
    if (existing) {
      const { error } = await harvest()
        .from('tomato_market_expense_templates')
        .update({
          last_used_amount: amount,
          usage_count: existing.usage_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('company_id', cid);
      if (error) throw error;
      byLower.set(key, { ...existing, usage_count: existing.usage_count + 1, last_used_amount: amount });
    } else {
      const { data, error } = await harvest()
        .from('tomato_market_expense_templates')
        .insert({
          company_id: cid,
          name,
          last_used_amount: amount,
          usage_count: 1,
        })
        .select('id')
        .single();
      if (error) throw error;
      const id = String((data as { id: string }).id);
      byLower.set(key, {
        id,
        company_id: cid,
        name,
        last_used_amount: amount,
        usage_count: 1,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function updateTomatoMarketDispatchStatus(params: {
  companyId: string;
  dispatchId: string;
  status: 'pending' | 'completed';
}): Promise<void> {
  const cid = requireCompanyId(params.companyId);
  const { error } = await harvest()
    .from('tomato_market_dispatches')
    .update({ status: params.status, updated_at: new Date().toISOString() })
    .eq('company_id', cid)
    .eq('id', params.dispatchId);
  if (error) throw error;
}
