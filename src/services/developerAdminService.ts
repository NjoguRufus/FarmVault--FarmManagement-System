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

export type DeveloperCompanyRow = {
  company_id?: string;
  id?: string;
  company_name?: string | null;
  name?: string | null;
  created_at?: string | null;
  users_count?: number | null;
  employees_count?: number | null;
  pending_payments_count?: number | null;
  subscription_status?: string | null;
  plan_code?: string | null;
  billing_mode?: string | null;
  billing_cycle?: string | null;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
  active_until?: string | null;
  subscription?: {
    id?: string | null;
    plan?: string | null;
    status?: string | null;
    trial_start?: string | null;
    trial_end?: string | null;
    period_start?: string | null;
    period_end?: string | null;
  } | null;
  [key: string]: unknown;
};

export type ListCompaniesRpcResponse = {
  items: DeveloperCompanyRow[];
  total: number;
  limit: number;
  offset: number;
};

export type OverrideMode =
  | 'start_trial'
  | 'free_until'
  | 'free_forever'
  | 'paid_active'
  | 'pilot'
  | 'collaborator'
  | 'remove_override';

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
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] Calling dev_dashboard_kpis RPC...');
  const { data, error, status, statusText } = await supabase.rpc('dev_dashboard_kpis');
  
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] dev_dashboard_kpis response:', { status, statusText, hasData: !!data, error });
  
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevAdmin] dev_dashboard_kpis FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to load developer dashboard KPIs');
  }
  // RPC may return a single row or an array; normalise to object.
  if (Array.isArray(data)) {
    return (data[0] as DevDashboardKpis) ?? {};
  }
  return (data as DevDashboardKpis) ?? {};
}

export async function listCompanies(params?: {
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<ListCompaniesRpcResponse> {
  const { search = null, limit = 200, offset = 0 } = params ?? {};

  // eslint-disable-next-line no-console
  console.log('[DevAdmin] Calling list_companies RPC...');
  const { data, error, status, statusText } = await supabase.rpc('list_companies', {
    p_limit: limit,
    p_offset: offset,
    p_search: search,
  });

  // eslint-disable-next-line no-console
  console.log('[DevAdmin] list_companies response:', { status, statusText, hasData: !!data, error });
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] companies RPC raw:', data);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevAdmin] list_companies FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to load companies');
  }

  const payload = (data as { items?: DeveloperCompanyRow[]; total?: number; limit?: number; offset?: number } | null) ?? {
    items: [],
    total: 0,
    limit,
    offset,
  };

  return {
    items: (payload.items ?? []) as DeveloperCompanyRow[],
    total: Number(payload.total ?? 0),
    limit: Number(payload.limit ?? limit),
    offset: Number(payload.offset ?? offset),
  };
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

// ---------------------------------------------------------------------------
// Safe developer delete actions
// ---------------------------------------------------------------------------

export interface DeleteUserResult {
  success: boolean;
  blocked?: boolean;
  reason?: string | null;
  dependency_counts?: Record<string, number>;
  note?: string | null;
}

export interface DeleteCompanyResult {
  success: boolean;
  blocked?: boolean;
  reason?: string | null;
  dependency_counts?: Record<string, number>;
}

export async function deleteUserSafely(clerkUserId: string): Promise<DeleteUserResult> {
  const { data, error } = await supabase.rpc('delete_user_safely', {
    p_clerk_user_id: clerkUserId,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to delete user');
  }
  return (data as DeleteUserResult) ?? { success: false, blocked: true, reason: 'Unknown error' };
}

export async function deleteCompanySafely(companyId: string): Promise<DeleteCompanyResult> {
  const { data, error } = await supabase.rpc('delete_company_safely', {
    p_company_id: companyId,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to delete company');
  }
  return (data as DeleteCompanyResult) ?? { success: false, blocked: true, reason: 'Unknown error' };
}

