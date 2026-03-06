import { supabase } from '@/lib/supabase';

export interface DevDashboardKpis {
  // Shape is defined by RPC; keep flexible and only read known fields in UI.
  companies?: number;
  users?: number;
  employees?: number;
  monthly_revenue?: number;
  active_subscriptions?: number;
  trial_users?: number;
  pending_payments?: number;
  [key: string]: unknown;
}

export interface DevCompanyRow {
  company_id: string;
  company_name: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  billing_mode: string | null;
  billing_cycle: string | null;
  is_trial: boolean | null;
  trial_ends_at: string | null;
  active_until: string | null;
  [key: string]: unknown;
}

export type OverrideMode =
  | 'start_trial'
  | 'free_until'
  | 'free_forever'
  | 'paid_active';

export interface OverrideSubscriptionInput {
  companyId: string;
  mode: OverrideMode;
  days?: number | null;
  until?: string | null;
  planCode?: string | null;
  billingMode?: string | null;
  billingCycle?: string | null;
  note?: string | null;
  reason?: string | null;
}

export async function getDevDashboardKpis(): Promise<DevDashboardKpis> {
  const { data, error } = await supabase.rpc('dev_dashboard_kpis');
  if (error) {
    throw new Error(error.message ?? 'Failed to load developer dashboard KPIs');
  }
  // RPC may return a single row or an array; normalise to object.
  if (Array.isArray(data)) {
    return (data[0] as DevDashboardKpis) ?? {};
  }
  return (data as DevDashboardKpis) ?? {};
}

export async function listCompanies(): Promise<DevCompanyRow[]> {
  const { data, error } = await supabase.rpc('list_companies');
  if (error) {
    throw new Error(error.message ?? 'Failed to load companies');
  }
  return (data as DevCompanyRow[]) ?? [];
}

export async function overrideSubscription(input: OverrideSubscriptionInput): Promise<void> {
  const { companyId, mode, days, until, planCode, billingMode, billingCycle, note, reason } = input;
  const { error } = await supabase.rpc('override_subscription', {
    _company_id: companyId,
    _mode: mode,
    _days: days ?? null,
    _until: until ?? null,
    _plan_code: planCode ?? null,
    _billing_mode: billingMode ?? null,
    _billing_cycle: billingCycle ?? null,
    _note: note ?? null,
    _reason: reason ?? null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to override subscription');
  }
}

