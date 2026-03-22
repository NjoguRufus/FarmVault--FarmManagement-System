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

export type CompanyWorkspaceNotifyEmailSource =
  /** Signed-in owner / company creator profile (Clerk-linked) — primary for farms without a separate company inbox. */
  | 'onboarding_account_profile'
  | 'company_row_email'
  | 'company_admin_member_profile'
  /** Non-admin member, only after admin/owner list exhausted. */
  | 'company_member_profile';

export type CompanyWorkspaceNotifyResolution =
  | { ok: true; to: string; companyName: string; source: CompanyWorkspaceNotifyEmailSource }
  | { ok: false; companyName: string | null; reason: string; triedSteps: string[] };

function isAdminishMemberRole(role: string | null | undefined): boolean {
  const r = (role || '').toLowerCase().replace(/-/g, '_');
  return r === 'company_admin' || r === 'companyadmin' || r === 'owner' || r === 'admin';
}

function normalizeNotifyEmail(raw: string | null | undefined): string | null {
  const e = String(raw ?? '').trim();
  if (!e || !e.includes('@')) return null;
  return e.toLowerCase();
}

async function resolveProfileEmailForUid(uid: string): Promise<string | null> {
  const id = String(uid ?? '').trim();
  if (!id) return null;

  const { data: profByClerk } = await supabase.from('profiles').select('email').eq('clerk_user_id', id).maybeSingle();
  let email = normalizeNotifyEmail(profByClerk?.email as string | undefined);
  if (email) return email;

  const { data: profById } = await supabase.from('profiles').select('email').eq('id', id).maybeSingle();
  email = normalizeNotifyEmail(profById?.email as string | undefined);
  if (email) return email;

  const { data: coreProf } = await supabase
    .schema('core')
    .from('profiles')
    .select('email')
    .eq('clerk_user_id', id)
    .maybeSingle();
  email = normalizeNotifyEmail(coreProf?.email as string | undefined);
  return email;
}

type CompanyRowLite = {
  name?: string | null;
  email?: string | null;
  created_by?: string | null;
  created_by_clerk_user_id?: string | null;
};

const COMPANY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeCompanyIdUuid(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return COMPANY_UUID_RE.test(s) ? s : null;
}

/** Clerk user ids are not UUIDs — only company_id must be a UUID for the lookup RPC. */
function jsonbClerkIdList(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  const out: string[] = [];
  for (const x of val) {
    const id = String(x ?? '').trim();
    if (id) out.push(id);
  }
  return out;
}

/**
 * Resolve workspace-ready email for a tenant (developer session).
 * Prefer security-definer RPC (reads core.companies + members; browser RLS often blocks direct core selects).
 * Priority: onboarding/account (creator) profile → company row email → admin/owner members → other members.
 */
export async function fetchCompanyWorkspaceNotifyPayload(companyId: string): Promise<CompanyWorkspaceNotifyResolution> {
  const triedSteps: string[] = [];
  const rawIn = String(companyId ?? '').trim();
  if (!rawIn) {
    return { ok: false, companyName: null, reason: 'missing_company_id', triedSteps: ['validate_id'] };
  }

  const uuidForRpc = normalizeCompanyIdUuid(rawIn);
  if (!uuidForRpc) {
    triedSteps.push('invalid_uuid_format');
    // eslint-disable-next-line no-console
    console.warn('[DevAdmin] workspace notify: company id is not a valid UUID', { companyId: rawIn });
    return { ok: false, companyName: null, reason: 'company_not_found', triedSteps };
  }

  const { data: lookupRaw, error: lookupErr } = await supabase.rpc('get_company_workspace_notify_lookup', {
    p_company_id: uuidForRpc,
  });

  if (lookupErr) {
    triedSteps.push(`rpc_lookup_error:${lookupErr.message ?? 'unknown'}`);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[DevAdmin] get_company_workspace_notify_lookup failed; falling back to direct selects', lookupErr);
    }
  } else {
    triedSteps.push('rpc_get_company_workspace_notify_lookup');
  }

  const lookup =
    lookupRaw && typeof lookupRaw === 'object' && !Array.isArray(lookupRaw)
      ? (lookupRaw as {
          company_id?: string;
          name?: string | null;
          email?: string | null;
          created_by?: string | null;
          admin_clerk_ids?: unknown;
          all_clerk_ids?: unknown;
          source_table?: string | null;
        })
      : null;

  if (lookup?.name && String(lookup.name).trim()) {
    const companyName = String(lookup.name).trim();
    const canonicalId = String(lookup.company_id ?? uuidForRpc).trim();
    const rowEmail = normalizeNotifyEmail(lookup.email as string | undefined);
    const creatorClerkId =
      lookup.created_by && String(lookup.created_by).trim() ? String(lookup.created_by).trim() : null;

    const adminIds = jsonbClerkIdList(lookup.admin_clerk_ids);
    const allIds = jsonbClerkIdList(lookup.all_clerk_ids);

    // 1) Onboarding / account owner (company creator)
    if (creatorClerkId) {
      const acctEmail = await resolveProfileEmailForUid(creatorClerkId);
      if (acctEmail) {
        // eslint-disable-next-line no-console
        console.log('[FarmVault] workspace notify: recipient', {
          source: 'onboarding_account_profile',
          companyId: canonicalId,
        });
        return { ok: true, to: acctEmail, companyName, source: 'onboarding_account_profile' };
      }
      triedSteps.push('onboarding_account_profile(no_email)');
    } else {
      triedSteps.push('onboarding_account(missing_created_by)');
    }

    // 2) Company row email (optional in UI; may be empty)
    if (rowEmail) {
      // eslint-disable-next-line no-console
      console.log('[FarmVault] workspace notify: recipient', {
        source: 'company_row_email',
        companyId: canonicalId,
      });
      return { ok: true, to: rowEmail, companyName, source: 'company_row_email' };
    }
    triedSteps.push('company_row_email(empty)');

    // 3) Admin / owner members
    for (const uid of adminIds) {
      const email = await resolveProfileEmailForUid(uid);
      if (email) {
        // eslint-disable-next-line no-console
        console.log('[FarmVault] workspace notify: recipient', {
          source: 'company_admin_member_profile',
          companyId: canonicalId,
        });
        return { ok: true, to: email, companyName, source: 'company_admin_member_profile' };
      }
    }
    triedSteps.push(adminIds.length ? 'admin_member_profiles(no_valid_email)' : 'admin_member_ids(empty)');

    // Other members (last resort)
    for (const uid of allIds) {
      if (adminIds.includes(uid)) continue;
      const email = await resolveProfileEmailForUid(uid);
      if (email) {
        // eslint-disable-next-line no-console
        console.log('[FarmVault] workspace notify: recipient', {
          source: 'company_member_profile',
          companyId: canonicalId,
        });
        return { ok: true, to: email, companyName, source: 'company_member_profile' };
      }
    }
    triedSteps.push(allIds.length ? 'other_member_profiles(no_valid_email)' : 'all_member_ids(empty)');

    // eslint-disable-next-line no-console
    console.warn('[DevAdmin] workspace notify: recipient unresolved (RPC row)', {
      companyId: canonicalId,
      companyName,
      source_table: lookup.source_table,
      triedSteps,
    });
    return {
      ok: false,
      companyName,
      reason: 'no_recipient_after_all_sources',
      triedSteps,
    };
  }

  const cid = uuidForRpc;
  let companyName: string | null = null;
  let rowEmail: string | null = null;
  let creatorClerkId: string | null = null;

  const { data: coCore, error: coCoreErr } = await supabase
    .schema('core')
    .from('companies')
    .select('name,email,created_by')
    .eq('id', cid)
    .maybeSingle();

  if (coCore && typeof coCore === 'object') {
    const r = coCore as CompanyRowLite;
    if (r.name && String(r.name).trim()) companyName = String(r.name).trim();
    rowEmail = normalizeNotifyEmail(r.email as string | undefined);
    if (r.created_by && String(r.created_by).trim()) creatorClerkId = String(r.created_by).trim();
    triedSteps.push('load_core.companies');
  } else {
    triedSteps.push('load_core.companies(empty_or_error)');
    if (import.meta.env.DEV && coCoreErr) {
      // eslint-disable-next-line no-console
      console.warn('[DevAdmin] workspace notify: core.companies', coCoreErr);
    }
  }

  if (!companyName || !creatorClerkId) {
    const { data: coPub, error: coPubErr } = await supabase
      .from('companies')
      .select('name,created_by,created_by_clerk_user_id')
      .eq('id', cid)
      .maybeSingle();
    triedSteps.push('load_public.companies');
    if (coPub && typeof coPub === 'object') {
      const r = coPub as CompanyRowLite;
      if (!companyName && r.name && String(r.name).trim()) companyName = String(r.name).trim();
      const pubCreator =
        (r.created_by_clerk_user_id && String(r.created_by_clerk_user_id).trim()) ||
        (r.created_by && String(r.created_by).trim()) ||
        '';
      if (!creatorClerkId && pubCreator) creatorClerkId = pubCreator;
    } else if (import.meta.env.DEV && coPubErr) {
      // eslint-disable-next-line no-console
      console.warn('[DevAdmin] workspace notify: public.companies', coPubErr);
    }
  }

  if (!companyName) {
    // eslint-disable-next-line no-console
    console.warn('[DevAdmin] workspace notify: company not found', { companyId: cid, triedSteps });
    return { ok: false, companyName: null, reason: 'company_not_found', triedSteps };
  }

  let members: { clerk_user_id?: string | null; user_id?: string | null; role?: string | null }[] | null = null;
  const { data: memPub, error: mPubErr } = await supabase
    .from('company_members')
    .select('clerk_user_id, user_id, role')
    .eq('company_id', cid)
    .order('created_at', { ascending: true });

  if (!mPubErr && Array.isArray(memPub) && memPub.length > 0) {
    members = memPub as typeof members;
    triedSteps.push(`public.company_members(${memPub.length})`);
  } else {
    const { data: memCore, error: mCoreErr } = await supabase
      .schema('core')
      .from('company_members')
      .select('clerk_user_id, user_id, role')
      .eq('company_id', cid)
      .order('created_at', { ascending: true });
    if (!mCoreErr && Array.isArray(memCore) && memCore.length > 0) {
      members = memCore as typeof members;
      triedSteps.push(`core.company_members(${memCore.length})`);
    } else {
      triedSteps.push('company_members(none_or_error)');
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[DevAdmin] workspace notify: no members', mPubErr ?? mCoreErr);
      }
    }
  }

  if (!members || members.length === 0) {
    triedSteps.push('company_members(empty)');
  }

  const admins = members?.filter((m) => isAdminishMemberRole(m.role)) ?? [];
  const nonAdmins =
    members?.filter((m) => !isAdminishMemberRole(m.role)) ?? [];

  // 1) Onboarding / account owner
  if (creatorClerkId) {
    const acctEmail = await resolveProfileEmailForUid(creatorClerkId);
    if (acctEmail) {
      // eslint-disable-next-line no-console
      console.log('[FarmVault] workspace notify: recipient', { source: 'onboarding_account_profile', companyId: cid });
      return { ok: true, to: acctEmail, companyName, source: 'onboarding_account_profile' };
    }
    triedSteps.push('onboarding_account_profile(no_email)');
  } else {
    triedSteps.push('onboarding_account(missing_created_by)');
  }

  // 2) Company row email
  if (rowEmail) {
    // eslint-disable-next-line no-console
    console.log('[FarmVault] workspace notify: recipient', { source: 'company_row_email', companyId: cid });
    return { ok: true, to: rowEmail, companyName, source: 'company_row_email' };
  }
  triedSteps.push('company_row_email(empty)');

  // 3) Admin / owner members
  for (const m of admins) {
    const uid =
      (m.clerk_user_id && String(m.clerk_user_id).trim()) || (m.user_id && String(m.user_id).trim()) || '';
    if (!uid) continue;
    const email = await resolveProfileEmailForUid(uid);
    if (email) {
      // eslint-disable-next-line no-console
      console.log('[FarmVault] workspace notify: recipient', {
        source: 'company_admin_member_profile',
        companyId: cid,
      });
      return { ok: true, to: email, companyName, source: 'company_admin_member_profile' };
    }
  }
  triedSteps.push(admins.length ? 'admin_member_profiles(no_valid_email)' : 'admin_member_ids(empty)');

  for (const m of nonAdmins) {
    const uid =
      (m.clerk_user_id && String(m.clerk_user_id).trim()) || (m.user_id && String(m.user_id).trim()) || '';
    if (!uid) continue;
    const email = await resolveProfileEmailForUid(uid);
    if (email) {
      // eslint-disable-next-line no-console
      console.log('[FarmVault] workspace notify: recipient', { source: 'company_member_profile', companyId: cid });
      return { ok: true, to: email, companyName, source: 'company_member_profile' };
    }
  }
  triedSteps.push(nonAdmins.length ? 'other_member_profiles(no_valid_email)' : 'no_non_admin_members');

  // eslint-disable-next-line no-console
  console.warn('[DevAdmin] workspace notify: recipient unresolved', {
    companyId: cid,
    companyName,
    reason: 'no_recipient_after_all_sources',
    triedSteps,
  });

  return {
    ok: false,
    companyName,
    reason: 'no_recipient_after_all_sources',
    triedSteps,
  };
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

