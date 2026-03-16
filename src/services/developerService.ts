import { supabase } from '@/lib/supabase';
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
  created_at: string | null;
}

export interface PaymentRow {
  id: string;
  company_id: string;
  company_name: string | null;
  plan_id: string | null;
  amount: number | null;
  status: string;
  billing_mode: string | null;
  created_at: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
}

export type ListPaymentsRpcResponse = {
  rows: PaymentRow[];
  total: number;
};

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

export interface SubscriptionAnalyticsResponse {
  summary: SubscriptionSummary;
  plan_distribution: PlanDistributionEntry[];
  status_distribution: StatusDistributionEntry[];
  rows: SubscriptionAnalyticsRow[];
}

export async function fetchDeveloperKpis(): Promise<DeveloperDashboardKpis> {
  return getDevDashboardKpis();
}

export async function fetchDeveloperCompanies(): Promise<ListCompaniesRpcResponse> {
  return listCompanies();
}

export async function fetchDeveloperUsers(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ListUsersRpcResponse> {
  const { search = null, limit = 100, offset = 0 } = params ?? {};

  const { data, error } = await supabase.rpc('list_users', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to load platform users');
  }

  const payload = (data as ListUsersRpcResponse | null) ?? { rows: [], total: 0 };
  return {
    rows: payload.rows ?? [],
    total: payload.total ?? 0,
  };
}

export async function fetchPendingPayments(): Promise<PendingPayment[]> {
  const { data, error } = await supabase.rpc('list_billing_confirmations', {
    p_status: 'pending',
    p_company_id: null,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to load pending payments');
  }
  const payload = (data as { rows?: PendingPayment[] } | null) ?? { rows: [] };
  return payload.rows ?? [];
}

export async function approveSubscriptionPayment(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_billing_confirmation', { p_confirmation_id: id });
  if (error) {
    throw new Error(error.message ?? 'Failed to approve billing confirmation');
  }
}

export async function rejectSubscriptionPayment(id: string): Promise<void> {
  const { error } = await supabase.rpc('reject_billing_confirmation', { p_confirmation_id: id });
  if (error) {
    throw new Error(error.message ?? 'Failed to reject billing confirmation');
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

  const { data, error } = await supabase.rpc('list_payments', {
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

  const payload = (data as ListPaymentsRpcResponse | null) ?? { rows: [], total: 0 };
  return {
    rows: payload.rows ?? [],
    total: payload.total ?? 0,
  };
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
  };

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
    const { data, error } = await supabase
      .from('season_challenges')
      .select('id, company_id, project_id, crop_type, title, severity, status, stage_name, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data) {
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


