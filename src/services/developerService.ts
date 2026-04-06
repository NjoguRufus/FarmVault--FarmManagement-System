import { invokeNotifyCompanyTransactional } from '@/lib/email';
import { getSupabaseAccessToken, supabase } from '@/lib/supabase';

type ClerkJwtProvider = () => Promise<string | null>;
import { sendCompanyPaymentReceipt } from '@/services/receiptsService';
import {
  getDevDashboardKpis,
  listCompanies,
  type DeveloperCompanyRow,
  type DevDashboardKpis,
  type ListCompaniesRpcResponse,
} from '@/services/developerAdminService';

export type DeveloperDashboardKpis = DevDashboardKpis;
export type DeveloperCompany = DeveloperCompanyRow;

export type DeveloperUserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
  active_company_id: string | null;
  company_id: string | null;
  company_name: string | null;
  role: string | null;
  /** user_type from core.profiles: 'ambassador' | 'company_admin' | 'both' */
  user_type: string | null;
  permissions: Record<string, unknown> | null;
  company?: {
    company_id: string | null;
    company_name: string | null;
    role: string | null;
    permissions: Record<string, unknown> | null;
  } | null;
};

export type ListUsersRpcResponse = {
  rows: DeveloperUserRow[];
  total: number;
};

export interface PendingPayment {
  id: string;
  company_id: string;
  company_name: string | null;
  plan_id: string | null;
  amount: number | null;
  status: string;
  billing_mode: string | null;
  billing_cycle: string | null;
  mpesa_name: string | null;
  mpesa_phone: string | null;
  transaction_code: string | null;
  created_at: string | null;
  submitted_at: string | null;
  currency: string | null;
}

export interface PaymentRow {
  id: string;
  company_id: string;
  company_name: string | null;
  plan_id: string | null;
  amount: number | null;
  currency?: string | null;
  status: string;
  billing_mode: string | null;
  created_at: string | null;
  approved_at: string | null;
  approved_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by: string | null;
  payment_method?: string | null;
  reference?: string | null;
  billing_cycle?: string | null;
}

export type ListPaymentsRpcResponse = {
  rows: PaymentRow[];
  total: number;
};

/** Rows from `public.mpesa_payments` (M-Pesa STK push lifecycle). Developer RLS can read all. */
export type MpesaStkPaymentRow = {
  id: string;
  checkout_request_id: string | null;
  company_id: string | null;
  mpesa_receipt: string | null;
  amount: number | string | null;
  phone: string | null;
  status: string;
  result_desc: string | null;
  paid_at: string | null;
  created_at: string;
  billing_reference?: string | null;
  plan?: string | null;
  billing_cycle?: string | null;
  result_code?: number | null;
  subscription_activated?: boolean;
};

export async function fetchMpesaStkPaymentsForDeveloper(): Promise<MpesaStkPaymentRow[]> {
  const { data, error } = await supabase
    .from('mpesa_payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(error.message || 'Failed to load STK payments');
  }
  return (data ?? []) as MpesaStkPaymentRow[];
}

// ---------------------------------------------------------------------------
// Subscription analytics (developer-only)
// ---------------------------------------------------------------------------

export interface SubscriptionSummary {
  total_subscriptions: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  expired_subscriptions: number;
  rejected_subscriptions: number;
}

export interface PlanDistributionEntry {
  plan: string | null;
  count: number;
}

export interface StatusDistributionEntry {
  status: string | null;
  count: number;
}

export interface SubscriptionAnalyticsRow {
  id: string;
  company_id: string;
  company_name: string | null;
  plan: string | null;
  plan_code: string | null;
  billing_cycle: string | null;
  billing_mode: string | null;
  status: string | null;
  is_trial: boolean | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  active_until: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubscriptionPaymentStats {
  pending_verification_count: number;
  pending_legacy_count: number;
  pending_total_count: number;
  /** Manual (subscription_payments approved, not STK method) + SDK (mpesa_payments SUCCESS). */
  approved_count: number;
  manual_approved_count: number;
  sdk_success_count: number;
  rejected_count: number;
  pending_revenue: number;
  approved_revenue: number;
  manual_approved_revenue: number;
  sdk_confirmed_revenue: number;
  rejected_revenue: number;
}

export interface SubscriptionAnalyticsResponse {
  summary: SubscriptionSummary;
  plan_distribution: PlanDistributionEntry[];
  status_distribution: StatusDistributionEntry[];
  rows: SubscriptionAnalyticsRow[];
  payment_stats: SubscriptionPaymentStats;
}

export async function fetchDeveloperKpis(): Promise<DeveloperDashboardKpis> {
  return getDevDashboardKpis();
}

export async function fetchDeveloperCompanies(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ListCompaniesRpcResponse> {
  return listCompanies(params);
}

export async function fetchDeveloperUsers(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ListUsersRpcResponse> {
  const { search = null, limit = 100, offset = 0 } = params ?? {};

  // eslint-disable-next-line no-console
  console.log('[DevService] Calling list_users RPC...');
  const { data, error, status, statusText } = await supabase.rpc('list_users', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
  
  // eslint-disable-next-line no-console
  console.log('[DevService] list_users response:', { status, statusText, hasData: !!data, error });
  
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[DevService] list_users FAILED:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message ?? 'Failed to load platform users');
  }

  const payload = (data as ListUsersRpcResponse | null) ?? { rows: [], total: 0 };
  return {
    rows: payload.rows ?? [],
    total: payload.total ?? 0,
  };
}

export async function fetchPendingPayments(): Promise<PendingPayment[]> {
  const { data, error } = await supabase.rpc('list_pending_payments');
  if (error) {
    throw new Error(error.message ?? 'Failed to load pending payments');
  }
  const rows = (Array.isArray(data) ? data : []) as PendingPayment[];
  // eslint-disable-next-line no-console
  console.log('[DevService] list_pending_payments:', {
    count: rows.length,
    first: rows[0] ?? null,
  });
  return rows;
}

export async function approveSubscriptionPayment(
  id: string,
  payment?: { company_id?: string | null; plan_id?: string | null; billing_cycle?: string | null },
  /** Prefer `useAuth().getToken({ template: 'supabase' })` so it matches the session used for dev RPCs. */
  getAccessToken: ClerkJwtProvider = getSupabaseAccessToken,
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[Payment] Payment confirmed — ID:', id, '| company:', payment?.company_id ?? '(unknown)');

  const { data: beforeRow, error: beforeErr } = await supabase
    .from('subscription_payments')
    .select('status,company_id')
    .eq('id', id)
    .maybeSingle();
  if (beforeErr) {
    throw new Error(beforeErr.message ?? 'Failed to load payment');
  }
  if (!beforeRow) {
    throw new Error('Payment not found');
  }
  const previousStatus = String(beforeRow.status ?? '').toLowerCase();
  if (previousStatus === 'approved') {
    // eslint-disable-next-line no-console
    console.log('[DevService] approve_subscription_payment skipped — already approved', { paymentId: id });
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[DevService] approve_subscription_payment RPC (syncs company_subscriptions)', { paymentId: id });
  const { error } = await supabase.rpc('approve_subscription_payment', { _payment_id: id });
  if (error) {
    throw new Error(error.message ?? 'Failed to approve payment');
  }
  // eslint-disable-next-line no-console
  console.log('[DevService] approve_subscription_payment OK — tenant UI should refresh via realtime / next gate fetch');

  // eslint-disable-next-line no-console
  console.log('PAYMENT APPROVED EMAIL (notify)', payment?.company_id ?? beforeRow?.company_id ?? '(unknown)');
  try {
    await sendCompanyPaymentReceipt(id, getAccessToken, { sendEmail: false });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('PAYMENT RECEIPT PDF ERROR (billing-receipt-issue):', e);
  }

  let companyIdForNotify =
    payment?.company_id != null && String(payment.company_id).trim() !== ''
      ? String(payment.company_id).trim()
      : '';
  if (!companyIdForNotify) {
    companyIdForNotify =
      beforeRow?.company_id != null && String(beforeRow.company_id).trim() !== ''
        ? String(beforeRow.company_id).trim()
        : '';
  }
  if (!companyIdForNotify) {
    const { data: payRow } = await supabase
      .from('subscription_payments')
      .select('company_id')
      .eq('id', id)
      .maybeSingle();
    companyIdForNotify =
      payRow?.company_id != null && String(payRow.company_id).trim() !== ''
        ? String(payRow.company_id).trim()
        : '';
  }
  if (companyIdForNotify) {
    void invokeNotifyCompanyTransactional(
      {
        companyId: companyIdForNotify,
        kind: 'payment_approved',
        subscriptionPaymentId: id,
      },
      getAccessToken,
    ).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('PAYMENT APPROVED EMAIL ERROR (notify-company-transactional):', e);
    });
  }
}

export async function rejectSubscriptionPayment(id: string): Promise<void> {
  const { error } = await supabase.rpc('reject_subscription_payment', { _payment_id: id });
  if (error) {
    throw new Error(error.message ?? 'Failed to reject payment');
  }
}

export async function setCompanyPaidAccess(input: {
  companyId: string;
  plan: 'basic' | 'pro';
  months: 1 | 2 | 3 | number;
}): Promise<void> {
  const { companyId, plan, months } = input;
  const { error } = await supabase.rpc('set_company_paid_access', {
    _company_id: companyId,
    _plan: plan,
    _months: months,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to set paid access');
  }
}

export interface PaymentsFilter {
  status?: string;
  billingMode?: string | null;
  plan?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

/** PostgREST returns a JSON array for `RETURNS TABLE` RPCs — normalize legacy `{ rows, total }` shapes. */
function normalizeListPaymentsV2Payload(data: unknown): ListPaymentsRpcResponse {
  if (data == null) return { rows: [], total: 0 };
  if (Array.isArray(data)) {
    return { rows: data as PaymentRow[], total: data.length };
  }
  const obj = data as { rows?: PaymentRow[]; total?: number };
  const rows = Array.isArray(obj.rows) ? obj.rows : [];
  return {
    rows,
    total: typeof obj.total === 'number' ? obj.total : rows.length,
  };
}

export async function fetchPayments(filter: PaymentsFilter = {}): Promise<ListPaymentsRpcResponse> {
  const {
    status = 'pending',
    billingMode = null,
    plan = null,
    dateFrom = null,
    dateTo = null,
    search = null,
    limit = 50,
    offset = 0,
  } = filter;

  const { data, error } = await supabase.rpc('list_payments_v2', {
    _status: status,
    _billing_mode: billingMode,
    _plan: plan,
    _date_from: dateFrom,
    _date_to: dateTo,
    _search: search,
    _limit: limit,
    _offset: offset,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load payments');
  }

  return normalizeListPaymentsV2Payload(data);
}

export async function fetchSubscriptionAnalytics(params?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  plan?: string | null;
  status?: string | null;
}): Promise<SubscriptionAnalyticsResponse> {
  const { dateFrom = null, dateTo = null, plan = null, status = null } = params ?? {};

  const { data, error } = await supabase.rpc('get_subscription_analytics', {
    _date_from: dateFrom,
    _date_to: dateTo,
    _plan: plan,
    _status: status,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription analytics');
  }

  const emptyPaymentStats: SubscriptionPaymentStats = {
    pending_verification_count: 0,
    pending_legacy_count: 0,
    pending_total_count: 0,
    approved_count: 0,
    manual_approved_count: 0,
    sdk_success_count: 0,
    rejected_count: 0,
    pending_revenue: 0,
    approved_revenue: 0,
    manual_approved_revenue: 0,
    sdk_confirmed_revenue: 0,
    rejected_revenue: 0,
  };

  const payload = (data as SubscriptionAnalyticsResponse | null) ?? {
    summary: {
      total_subscriptions: 0,
      active_subscriptions: 0,
      trialing_subscriptions: 0,
      expired_subscriptions: 0,
      rejected_subscriptions: 0,
    },
    plan_distribution: [],
    status_distribution: [],
    rows: [],
    payment_stats: emptyPaymentStats,
  };

  const rawStats = payload.payment_stats as Record<string, unknown> | undefined;
  const payment_stats: SubscriptionPaymentStats = rawStats
    ? {
        pending_verification_count: Number(rawStats.pending_verification_count ?? 0),
        pending_legacy_count: Number(rawStats.pending_legacy_count ?? 0),
        pending_total_count: Number(rawStats.pending_total_count ?? 0),
        approved_count: Number(rawStats.approved_count ?? 0),
        manual_approved_count: Number(rawStats.manual_approved_count ?? 0),
        sdk_success_count: Number(rawStats.sdk_success_count ?? 0),
        rejected_count: Number(rawStats.rejected_count ?? 0),
        pending_revenue: Number(rawStats.pending_revenue ?? 0),
        approved_revenue: Number(rawStats.approved_revenue ?? 0),
        manual_approved_revenue: Number(rawStats.manual_approved_revenue ?? 0),
        sdk_confirmed_revenue: Number(rawStats.sdk_confirmed_revenue ?? 0),
        rejected_revenue: Number(rawStats.rejected_revenue ?? 0),
      }
    : emptyPaymentStats;

  // eslint-disable-next-line no-console
  console.log('[DevService] get_subscription_analytics parsed:', {
    rowCount: (payload.rows ?? []).length,
    payment_stats,
  });

  return {
    summary: payload.summary ?? {
      total_subscriptions: 0,
      active_subscriptions: 0,
      trialing_subscriptions: 0,
      expired_subscriptions: 0,
      rejected_subscriptions: 0,
    },
    plan_distribution: payload.plan_distribution ?? [],
    status_distribution: payload.status_distribution ?? [],
    rows: payload.rows ?? [],
    payment_stats,
  };
}

// ---------------------------------------------------------------------------
// Season challenges & crop intelligence (global, developer-only)
// ---------------------------------------------------------------------------

export interface SeasonChallengeAggregate {
  cropType: string;
  count: number;
}

export interface SeasonChallengeStageAggregate {
  cropType: string | null;
  stageName: string | null;
  count: number;
}

export interface SeasonChallengeRecentItem {
  id: string;
  companyId: string;
  projectId: string;
  cropType: string;
  title: string;
  severity: string;
  status: string;
  stageName: string | null;
  createdAt: string;
}

export interface SeasonChallengesIntelligence {
  totalChallenges: number;
  byCrop: SeasonChallengeAggregate[];
  byStage: SeasonChallengeStageAggregate[];
  recent: SeasonChallengeRecentItem[];
}

/**
 * Global season challenges intelligence across all companies.
 * Assumes RLS allows admin.is_developer() to select from season_challenges.
 * Falls back to empty aggregates if query fails.
 */
export async function getSeasonChallengesIntelligence(): Promise<SeasonChallengesIntelligence> {
  try {
    // eslint-disable-next-line no-console
    console.log('[DevService] Querying season_challenges table...');
    const { data, error, status, statusText } = await supabase
      .from('season_challenges')
      .select('id, company_id, project_id, crop_type, title, severity, status, stage_name, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    // eslint-disable-next-line no-console
    console.log('[DevService] season_challenges response:', { status, statusText, rowCount: data?.length ?? 0, error });

    if (error || !data) {
      // eslint-disable-next-line no-console
      console.warn('[DevService] season_challenges query failed or empty:', error);
      return {
        totalChallenges: 0,
        byCrop: [],
        byStage: [],
        recent: [],
      };
    }

    const rows = data as Array<{
      id: string;
      company_id: string;
      project_id: string;
      crop_type: string;
      title: string;
      severity: string;
      status: string;
      stage_name: string | null;
      created_at: string;
    }>;

    const byCropMap = new Map<string, number>();
    const byStageMap = new Map<string, { cropType: string | null; stageName: string | null; count: number }>();

    for (const row of rows) {
      const cropKey = row.crop_type || 'unknown';
      byCropMap.set(cropKey, (byCropMap.get(cropKey) ?? 0) + 1);

      const stageKey = `${row.crop_type ?? 'unknown'}::${row.stage_name ?? 'unknown'}`;
      const existing = byStageMap.get(stageKey);
      if (existing) {
        existing.count += 1;
      } else {
        byStageMap.set(stageKey, {
          cropType: row.crop_type ?? null,
          stageName: row.stage_name ?? null,
          count: 1,
        });
      }
    }

    const byCrop: SeasonChallengeAggregate[] = Array.from(byCropMap.entries())
      .map(([cropType, count]) => ({ cropType, count }))
      .sort((a, b) => b.count - a.count);

    const byStage: SeasonChallengeStageAggregate[] = Array.from(byStageMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    const recent: SeasonChallengeRecentItem[] = rows.slice(0, 25).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      projectId: row.project_id,
      cropType: row.crop_type,
      title: row.title,
      severity: row.severity,
      status: row.status,
      stageName: row.stage_name,
      createdAt: row.created_at,
    }));

    return {
      totalChallenges: rows.length,
      byCrop,
      byStage,
      recent,
    };
  } catch {
    return {
      totalChallenges: 0,
      byCrop: [],
      byStage: [],
      recent: [],
    };
  }
}


