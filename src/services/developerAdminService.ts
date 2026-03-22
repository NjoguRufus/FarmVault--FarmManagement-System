import { supabase } from '@/lib/supabase';
import {
  listDuplicateEmails,
  setCompanySubscriptionState,
  type DeveloperSubscriptionAction,
  type SetCompanySubscriptionStateResult,
} from '@/services/subscriptionService';

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
  /** Latest row from public.subscription_payments (see list_companies migration). */
  latest_subscription_payment?: {
    id?: string;
    status?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    plan_id?: string | null;
    billing_cycle?: string | null;
    billing_mode?: string | null;
    submitted_at?: string | null;
    mpesa_name?: string | null;
    transaction_code?: string | null;
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
  console.log('[DevAdmin] Calling list_companies_v2 RPC...');
  const { data, error, status, statusText } = await supabase.rpc('list_companies_v2', {
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

  const payload = (data as {
    items?: DeveloperCompanyRow[];
    rows?: DeveloperCompanyRow[];
    total?: number;
    limit?: number;
    offset?: number;
  } | null) ?? null;

  // Support both payload shapes:
  // - { items: [...] } (newer)
  // - { rows: [...] }  (legacy)
  const parsedItems = (payload?.items ?? payload?.rows ?? []) as DeveloperCompanyRow[];
  const parsedTotal = Number(payload?.total ?? parsedItems.length);
  const parsedLimit = Number(payload?.limit ?? limit);
  const parsedOffset = Number(payload?.offset ?? offset);

  // eslint-disable-next-line no-console
  console.log('[DevAdmin] list_companies parsed:', {
    parsedLength: parsedItems.length,
    parsedTotal,
    firstItem: parsedItems[0] ?? null,
  });

  return {
    items: parsedItems,
    total: parsedTotal,
    limit: parsedLimit,
    offset: parsedOffset,
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

export async function updateCompanySubscriptionState(input: {
  companyId: string;
  action: DeveloperSubscriptionAction;
  planCode?: 'basic' | 'pro' | null;
  reason?: string | null;
  days?: number | null;
}): Promise<SetCompanySubscriptionStateResult> {
  return setCompanySubscriptionState(input);
}

export { listDuplicateEmails };

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
  deleted_company_id?: string;
  dependency_counts?: Record<string, number>;
  deleted_counts?: Record<string, number>;
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
  if (Array.isArray(data)) {
    return (data[0] as DeleteCompanyResult) ?? { success: false, blocked: true, reason: 'Unknown error' };
  }
  return (data as DeleteCompanyResult) ?? { success: false, blocked: true, reason: 'Unknown error' };
}

// ---------------------------------------------------------------------------
// Developer settings (identity + company link management)
// ---------------------------------------------------------------------------

export interface DeveloperSettings {
  developer_clerk_user_id: string | null;
  developer_email: string | null;
  developer_full_name: string | null;
  developer_created_at: string | null;
  active_company_id: string | null;
  active_company_name: string | null;
  active_company_created_at: string | null;
  member_company_id: string | null;
  member_company_name: string | null;
  member_role: string | null;
  member_created_at: string | null;
}

export async function getDeveloperSettings(): Promise<DeveloperSettings | null> {
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] Calling get_developer_settings RPC...');
  const { data, error, status, statusText } = await supabase.rpc('get_developer_settings');

  // eslint-disable-next-line no-console
  console.log('[DevAdmin] get_developer_settings response:', {
    status,
    statusText,
    hasData: !!data,
    error,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevAdmin] get_developer_settings FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to load developer settings');
  }

  if (!data) return null;
  if (Array.isArray(data)) {
    return (data[0] as DeveloperSettings) ?? null;
  }
  return (data as DeveloperSettings) ?? null;
}

/**
 * List companies for the Developer Settings page (shared list_companies RPC).
 */
export async function listCompaniesForDeveloperSettings(params?: {
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<ListCompaniesRpcResponse> {
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] listCompaniesForDeveloperSettings()', params);
  return listCompanies(params);
}

export async function linkDeveloperToCompany(companyId: string): Promise<void> {
  if (!companyId) throw new Error('companyId is required');
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] Linking developer to company', { companyId });
  const { error } = await supabase.rpc('link_developer_to_company', {
    p_company_id: companyId,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevAdmin] link_developer_to_company FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to link developer to company');
  }
}

// Backwards-compatible alias (older callers may still use this)
export async function updateDeveloperCompanyLink(companyId: string): Promise<void> {
  return linkDeveloperToCompany(companyId);
}

export async function removeDeveloperCompanyLink(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] Removing developer company link...');
  const { error } = await supabase.rpc('remove_developer_company_link');
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevAdmin] remove_developer_company_link FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to remove developer company link');
  }
}

export async function setDeveloperRole(role: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] Setting developer role...', { role });
  const { error } = await supabase.rpc('set_developer_role', {
    p_role: role,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevAdmin] set_developer_role FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to update developer role');
  }
}

// Backwards-compatible alias
export async function updateDeveloperRole(role: string): Promise<void> {
  return setDeveloperRole(role);
}

export async function renameCompany(companyId: string, name: string): Promise<void> {
  if (!companyId) throw new Error('companyId is required');
  // eslint-disable-next-line no-console
  console.log('[DevAdmin] Renaming company safely...', { companyId, name });
  const { error } = await supabase.rpc('rename_company_safely', {
    p_company_id: companyId,
    p_name: name,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevAdmin] rename_company_safely FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to rename company');
  }
}

/** Resolve company-admin recipient + name for workspace-ready email (developer session; uses public tables). */
export async function fetchCompanyWorkspaceNotifyPayload(companyId: string): Promise<{
  to: string;
  companyName: string;
} | null> {
  const cid = String(companyId ?? '').trim();
  if (!cid) return null;

  let companyName: string | null = null;
  const { data: coPub, error: coPubErr } = await supabase.from('companies').select('name').eq('id', cid).maybeSingle();
  if (coPub?.name && typeof coPub.name === 'string' && coPub.name.trim()) {
    companyName = coPub.name.trim();
  } else {
    const { data: coCore } = await supabase.schema('core').from('companies').select('name').eq('id', cid).maybeSingle();
    if (coCore?.name && typeof coCore.name === 'string' && coCore.name.trim()) {
      companyName = coCore.name.trim();
    }
  }

  if (!companyName) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[DevAdmin] fetchCompanyWorkspaceNotifyPayload: company not found', coPubErr);
    }
    return null;
  }

  let members: unknown[] | null = null;
  const { data: memPub, error: mPubErr } = await supabase
    .from('company_members')
    .select('clerk_user_id, user_id, role')
    .eq('company_id', cid)
    .order('created_at', { ascending: true });

  if (!mPubErr && Array.isArray(memPub) && memPub.length > 0) {
    members = memPub;
  } else {
    const { data: memCore, error: mCoreErr } = await supabase
      .schema('core')
      .from('company_members')
      .select('clerk_user_id, user_id, role')
      .eq('company_id', cid)
      .order('created_at', { ascending: true });
    if (!mCoreErr && Array.isArray(memCore) && memCore.length > 0) {
      members = memCore;
    } else if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[DevAdmin] fetchCompanyWorkspaceNotifyPayload: members', mPubErr ?? mCoreErr);
    }
  }

  if (!members || members.length === 0) {
    return null;
  }

  const preferred = members.filter((m: { role?: string | null }) => {
    const r = (m.role || '').toLowerCase().replace(/-/g, '_');
    return r === 'company_admin' || r === 'companyadmin';
  });
  const ordered = preferred.length > 0 ? preferred : members;

  for (const m of ordered) {
    const row = m as { clerk_user_id?: string | null; user_id?: string | null };
    const uid = (row.clerk_user_id && String(row.clerk_user_id).trim()) || (row.user_id && String(row.user_id).trim()) || '';
    if (!uid) continue;

    let email: string | null = null;

    const { data: profByClerk } = await supabase
      .from('profiles')
      .select('email')
      .eq('clerk_user_id', uid)
      .maybeSingle();
    if (profByClerk?.email && typeof profByClerk.email === 'string') {
      email = profByClerk.email.trim();
    }

    if (!email || !email.includes('@')) {
      const { data: profById } = await supabase.from('profiles').select('email').eq('id', uid).maybeSingle();
      if (profById?.email && typeof profById.email === 'string') email = profById.email.trim();
    }

    if (!email || !email.includes('@')) {
      const { data: coreProf } = await supabase
        .schema('core')
        .from('profiles')
        .select('email')
        .eq('clerk_user_id', uid)
        .maybeSingle();
      if (coreProf?.email && typeof coreProf.email === 'string') email = coreProf.email.trim();
    }

    if (email && email.includes('@')) {
      return { to: email.toLowerCase(), companyName };
    }
  }

  return null;
}

export {
  createPaymentSubmission,
  getCurrentCompanySubscription,
  getPendingPaymentStatus,
  listCompanySubscriptionPayments,
  type CompanySubscriptionRow,
  type CreatePaymentSubmissionInput,
  type PendingPaymentStatusResult,
  type PaymentSubmissionRow,
} from '@/services/billingSubmissionService';

