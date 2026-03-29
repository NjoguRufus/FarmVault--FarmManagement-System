import { supabase } from '@/lib/supabase';

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
};

export async function fetchDeveloperCompanyFarmIntelligence(
  companyId: string,
): Promise<CompanyFarmIntelligencePayload> {
  const id = String(companyId ?? '').trim();
  if (!id) throw new Error('Company id is required');

  const { data, error } = await supabase.rpc('get_developer_company_farm_intelligence', {
    p_company_id: id,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load company intelligence');
  }

  const payload = (data ?? {}) as CompanyFarmIntelligencePayload;
  if (payload.error === 'company_not_found') {
    throw new Error('Company not found');
  }

  return payload;
}
