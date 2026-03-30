import { supabase } from '@/lib/supabase';
import { seasonChallengesFromDeveloperRpcJson } from '@/services/seasonChallengesService';
import type { SeasonChallenge } from '@/types';

/** Raw JSON from `public.get_developer_company_farm_intelligence`. */
export type CompanyFarmIntelligencePayload = {
  error?: string;
  company_id?: string;
  header?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  projects?: unknown[];
  harvests?: unknown[];
  expenses?: unknown[];
  expense_by_category?: unknown[];
  inventory?: unknown[];
  inventory_audit_recent?: unknown[];
  employees?: unknown[];
  suppliers?: unknown[];
  harvest_collections?: unknown[];
  subscription_payments?: unknown[];
  timeline?: unknown[];
  activity_logs?: unknown[];
  employee_activity_logs?: unknown[];
  /** Deprecated: season challenges are loaded lazily via `developer_season_challenges_for_company_json`. */
  season_challenges?: unknown[];
};

export type DeveloperCompanyAuditLogRow = {
  id: string;
  logged_at: string;
  action: string;
  module: string;
  actor_label: string | null;
  description: string;
  affected_record: string | null;
};

export async function fetchDeveloperCompanyAuditLogsPage(params: {
  companyId: string;
  limit?: number;
  offset?: number;
  module?: string | null;
}): Promise<{ rows: DeveloperCompanyAuditLogRow[]; hasMore: boolean }> {
  const id = String(params.companyId ?? '').trim();
  
  // Never send empty string to database - return empty result instead
  if (!id) {
    if (import.meta.env?.DEV) {
      console.warn('[developerCompanyIntelligence] fetchDeveloperCompanyAuditLogsPage skipped: empty companyId');
    }
    return { rows: [], hasMore: false };
  }

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const mod = params.module != null && String(params.module).trim() !== '' ? String(params.module).trim() : null;

  if (import.meta.env?.DEV) {
    console.log('[developerCompanyIntelligence] fetchDeveloperCompanyAuditLogsPage', { companyId: id, limit, offset, module: mod });
  }

  const { data, error } = await supabase.rpc('developer_list_company_audit_logs', {
    p_tenant_key: id,
    p_limit: limit,
    p_offset: offset,
    p_module: mod,
  });

  if (error) {
    if (import.meta.env?.DEV) {
      console.error('[developerCompanyIntelligence] fetchDeveloperCompanyAuditLogsPage error', error);
    }
    throw new Error(error.message ?? 'Failed to load audit logs');
  }

  const payload = (data ?? {}) as { rows?: unknown; has_more?: boolean };
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rows: DeveloperCompanyAuditLogRow[] = rawRows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: String(o.id ?? ''),
      logged_at: String(o.logged_at ?? ''),
      action: String(o.action ?? ''),
      module: String(o.module ?? 'general'),
      actor_label: o.actor_label == null || o.actor_label === '' ? null : String(o.actor_label),
      description: String(o.description ?? ''),
      affected_record: o.affected_record == null || o.affected_record === '' ? null : String(o.affected_record),
    };
  });

  return {
    rows,
    hasMore: Boolean(payload.has_more),
  };
}

export async function fetchDeveloperCompanyFarmIntelligence(
  companyId: string,
): Promise<CompanyFarmIntelligencePayload> {
  const id = String(companyId ?? '').trim();
  
  // Never send empty string to database
  if (!id) {
    if (import.meta.env?.DEV) {
      console.warn('[developerCompanyIntelligence] fetchDeveloperCompanyFarmIntelligence: empty companyId');
    }
    throw new Error('Company id is required');
  }

  if (import.meta.env?.DEV) {
    console.log('[developerCompanyIntelligence] fetchDeveloperCompanyFarmIntelligence', { companyId: id });
  }

  const { data, error } = await supabase.rpc('developer_get_company_farm_intelligence', {
    p_tenant_key: id,
  });

  if (error) {
    if (import.meta.env?.DEV) {
      console.error('[developerCompanyIntelligence] fetchDeveloperCompanyFarmIntelligence error', error);
    }
    throw new Error(error.message ?? 'Failed to load company intelligence');
  }

  const payload = (data ?? {}) as CompanyFarmIntelligencePayload;
  if (payload.error === 'company_not_found') {
    throw new Error('Company not found');
  }

  return payload;
}

/** Map `payload.season_challenges` from farm intelligence (snake_case JSON rows). */
export function seasonChallengesFromIntelligencePayload(
  payload: CompanyFarmIntelligencePayload | undefined,
): SeasonChallenge[] {
  return seasonChallengesFromDeveloperRpcJson(payload?.season_challenges);
}
