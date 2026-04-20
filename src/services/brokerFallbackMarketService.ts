/**
 * Sales broker UI — modular (fallback) harvest market dispatches.
 * RLS: brokers only see dispatches assigned to their employee record.
 */

import { supabase } from '@/lib/supabase';
import { requireCompanyId } from '@/lib/db';
import {
  rowToFallbackHarvestSession,
  rowToFallbackMarketDispatch,
  type FallbackHarvestSessionRow,
  type FallbackMarketDispatchRow,
} from '@/services/fallbackHarvestService';

const harvest = () => supabase.schema('harvest');

function num(v: unknown): number {
  if (v == null) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export type BrokerFallbackDispatchWithSession = {
  dispatch: FallbackMarketDispatchRow;
  session: Pick<
    FallbackHarvestSessionRow,
    'id' | 'project_id' | 'session_date' | 'unit_type' | 'container_type' | 'destination'
  > | null;
};

export async function listBrokerFallbackDispatchesWithSessions(
  companyId: string,
): Promise<BrokerFallbackDispatchWithSession[]> {
  const cid = requireCompanyId(companyId);
  const { data: dispatches, error } = await harvest()
    .from('fallback_market_dispatches')
    .select('*')
    .eq('company_id', cid)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (dispatches ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const sessionIds = [...new Set(rows.map((r) => String(r.harvest_session_id)))];
  const { data: sessions, error: sErr } = await harvest()
    .from('fallback_harvest_sessions')
    .select('id, project_id, session_date, unit_type, container_type, destination')
    .eq('company_id', cid)
    .in('id', sessionIds);
  if (sErr) {
    return rows.map((r) => ({
      dispatch: rowToFallbackMarketDispatch(r),
      session: null,
    }));
  }

  const sessionById = new Map(
    (sessions ?? []).map((s) => {
      const r = s as Record<string, unknown>;
      return [
        String(r.id),
        rowToFallbackHarvestSession(r) as BrokerFallbackDispatchWithSession['session'],
      ];
    }),
  );

  return rows.map((r) => ({
    dispatch: rowToFallbackMarketDispatch(r),
    session: sessionById.get(String(r.harvest_session_id)) ?? null,
  }));
}

export async function fetchFallbackMarketDispatchByIdForBroker(params: {
  companyId: string;
  dispatchId: string;
}): Promise<FallbackMarketDispatchRow | null> {
  const companyId = requireCompanyId(params.companyId);
  const { data, error } = await harvest()
    .from('fallback_market_dispatches')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', params.dispatchId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToFallbackMarketDispatch(data as Record<string, unknown>) : null;
}

export async function sumUnitsSoldByFallbackDispatchIds(
  companyId: string,
  dispatchIds: string[],
): Promise<Map<string, number>> {
  const cid = requireCompanyId(companyId);
  const map = new Map<string, number>();
  if (dispatchIds.length === 0) return map;
  const { data, error } = await harvest()
    .from('fallback_market_sales_entries')
    .select('market_dispatch_id, quantity')
    .eq('company_id', cid)
    .in('market_dispatch_id', dispatchIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const r = row as { market_dispatch_id: string; quantity: unknown };
    const id = String(r.market_dispatch_id);
    map.set(id, (map.get(id) ?? 0) + Math.max(0, num(r.quantity)));
  }
  return map;
}
