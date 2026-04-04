import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from '@/lib/documentLayer';
import { db } from '@/lib/documentLayer';
import { supabase } from '@/lib/supabase';
import type { SubscriptionPaymentDoc } from '@/services/subscriptionPaymentService';
import type { CompanySubscriptionRecord } from '@/services/subscriptionAdminService';

export type AnalyticsRangePreset = '7d' | '30d' | '90d';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface RevenueMetrics {
  totalThisMonth: number;
  totalLast30Days: number;
}

export interface ActiveMetrics {
  activeSubscriptions: number;
  activeTrials: number;
}

export interface ConversionMetrics {
  trialsStarted: number;
  firstPayments: number;
  conversionRate: number;
  churned: number;
}

export interface RevenuePoint {
  dateKey: string;
  total: number;
}

export interface MixSlice {
  key: string;
  label: string;
  amount: number;
}

export interface FunnelMetrics {
  trialsStarted: number;
  activePaid: number;
  renewed: number;
}

export interface TopCompanyRow {
  companyId: string;
  companyName: string;
  totalAmount: number;
}

export interface ExpiringSubscriptionRow {
  companyId: string;
  planName?: string;
  currentPeriodEnd: Date;
  hasOverride: boolean;
}

export interface SubscriptionAnalyticsPayload {
  revenue: RevenueMetrics;
  active: ActiveMetrics;
  conversion: ConversionMetrics;
  revenueTrend: RevenuePoint[];
  planMix: MixSlice[];
  modeMix: MixSlice[];
  funnel: FunnelMetrics;
  topCompanies: TopCompanyRow[];
  expiringSoon: ExpiringSubscriptionRow[];
}

// New RPC-based implementation for Supabase-backed analytics.
export async function fetchSubscriptionAnalyticsRpc(
  trendRange: AnalyticsRangePreset,
): Promise<SubscriptionAnalyticsPayload> {
  const { data, error } = await supabase.rpc('subscription_analytics', {
    preset: trendRange,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription analytics');
  }

  const payload = (data as SubscriptionAnalyticsPayload | null) ?? {
    revenue: { totalThisMonth: 0, totalLast30Days: 0 },
    active: { activeSubscriptions: 0, activeTrials: 0 },
    conversion: { trialsStarted: 0, firstPayments: 0, conversionRate: 0, churned: 0 },
    revenueTrend: [],
    planMix: [],
    modeMix: [],
    funnel: { trialsStarted: 0, activePaid: 0, renewed: 0 },
    topCompanies: [],
    expiringSoon: [],
  };

  return payload;
}

export function buildPresetRange(preset: AnalyticsRangePreset): DateRange {
  const end = new Date();
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function sameDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export async function fetchSubscriptionAnalytics(
  trendRange: AnalyticsRangePreset,
): Promise<SubscriptionAnalyticsPayload> {
  const now = new Date();
  const { start, end } = buildPresetRange(trendRange);
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  let payments: (SubscriptionPaymentDoc & { id: string })[] = [];
  try {
    const paymentsSnap = await getDocs(
      query(
        collection(db, 'subscriptionPayments'),
        where('status', '==', 'approved'),
        where('createdAt', '>=', startTs),
        where('createdAt', '<=', endTs),
        orderBy('createdAt', 'asc'),
      ),
    );
    payments = paymentsSnap.docs.map(
      (d) =>
        ({
          id: d.id,
          ...(d.data() as SubscriptionPaymentDoc),
        } as SubscriptionPaymentDoc & { id: string }),
    );
  } catch (paymentsErr) {
    try {
      const fallbackSnap = await getDocs(
        query(
          collection(db, 'subscriptionPayments'),
          where('status', '==', 'approved'),
        ),
      );
      const all = fallbackSnap.docs.map(
        (d) =>
          ({
            id: d.id,
            ...(d.data() as SubscriptionPaymentDoc),
          } as SubscriptionPaymentDoc & { id: string }),
      );
      payments = all.filter((p) => {
        const created = toDate((p as any).createdAt);
        return created && created >= start && created <= end;
      });
      payments.sort((a, b) => {
        const ta = toDate((a as any).createdAt)?.getTime() ?? 0;
        const tb = toDate((b as any).createdAt)?.getTime() ?? 0;
        return ta - tb;
      });
    } catch {
      payments = [];
    }
  }

  let subs: CompanySubscriptionRecord[] = [];
  try {
    const subsSnap = await getDocs(collection(db, 'companySubscriptions'));
    subs = subsSnap.docs.map(
      (d) =>
        ({
          companyId: d.id,
          ...(d.data() as Omit<CompanySubscriptionRecord, 'companyId'>),
        } as CompanySubscriptionRecord),
    );
  } catch {
    subs = [];
  }

  if (subs.length === 0) {
    try {
      const companiesSnap = await getDocs(collection(db, 'companies'));
      subs = companiesSnap.docs
        .map((d) => {
          const data = d.data() as any;
          const sub = data?.subscription;
          if (!sub) return null;
          return {
            companyId: d.id,
            status: sub.plan === 'trial' ? 'trial' : sub.status ?? 'active',
            trialEndsAt: sub.trialEndsAt ?? null,
            currentPeriodEnd: sub.paidUntil ?? null,
            override: sub.override ?? null,
            planName: sub.plan === 'basic' ? 'Basic' : sub.plan === 'pro' ? 'Pro' : sub.plan,
            trialStartedAt: sub.trialStartAt ?? null,
            updatedAt: null,
          } as CompanySubscriptionRecord;
        })
        .filter(Boolean) as CompanySubscriptionRecord[];
    } catch {
      // keep subs empty
    }
  }

  // Revenue metrics
  let totalThisMonth = 0;
  let totalLast30Days = 0;

  const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const revenueByDay = new Map<string, number>();
  const revenueByPlan = new Map<string, number>();
  const revenueByMode = new Map<string, number>();
  const revenueByCompany = new Map<string, { name: string; total: number }>();

  payments.forEach((p) => {
    const createdAt = toDate((p as any).createdAt);
    if (!createdAt) return;
    const amount = Number(p.amount || 0);
    if (createdAt >= monthStart) {
      totalThisMonth += amount;
    }
    if (createdAt >= last30Start) {
      totalLast30Days += amount;
    }

    const key = sameDayKey(createdAt);
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + amount);

    const planKey = (p.planId ?? p.plan) || 'unknown';
    revenueByPlan.set(planKey, (revenueByPlan.get(planKey) ?? 0) + amount);

    const modeKey = (p.billingMode ?? p.mode) || 'unknown';
    revenueByMode.set(modeKey, (revenueByMode.get(modeKey) ?? 0) + amount);

    const companyName = p.companyName || p.companyId;
    const prev = revenueByCompany.get(p.companyId) ?? { name: companyName, total: 0 };
    prev.total += amount;
    revenueByCompany.set(p.companyId, prev);
  });

  const revenueTrend: RevenuePoint[] = Array.from(revenueByDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, total]) => ({ dateKey, total }));

  const planMix: MixSlice[] = Array.from(revenueByPlan.entries()).map(
    ([key, amount]) => ({
      key,
      label:
        key === 'basic' ? 'Basic' : key === 'pro' ? 'Pro' : key === 'enterprise' ? 'Enterprise' : key,
      amount,
    }),
  );

  const modeMix: MixSlice[] = Array.from(revenueByMode.entries()).map(
    ([key, amount]) => ({
      key,
      label:
        key === 'monthly'
          ? 'Monthly'
          : key === 'seasonal'
          ? 'Seasonal'
          : key === 'annual'
          ? 'Annual'
          : key,
      amount,
    }),
  );

  // Top paying companies in last 90 days
  const topCompanies: TopCompanyRow[] = Array.from(revenueByCompany.entries())
    .map(([companyId, { name, total }]) => ({
      companyId,
      companyName: name,
      totalAmount: total,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 20);

  // Active / trial metrics + expiring soon
  let activeSubscriptions = 0;
  let activeTrials = 0;
  const expiringSoon: ExpiringSubscriptionRow[] = [];

  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  subs.forEach((s) => {
    const currentEnd = toDate((s as any).currentPeriodEnd);
    const trialEnds = toDate((s as any).trialEndsAt);
    const overrideEnd = toDate((s.override as any)?.endAt);
    const overrideEnabled = Boolean(s.override?.enabled);

    const isActive =
      (s.status === 'active' || s.status === 'override') &&
      ((currentEnd && currentEnd > now) || (overrideEnabled && overrideEnd && overrideEnd > now));
    const isTrialActive = s.status === 'trial' && trialEnds && trialEnds > now;

    if (isActive) activeSubscriptions += 1;
    if (isTrialActive) activeTrials += 1;

    if (
      currentEnd &&
      currentEnd > now &&
      currentEnd <= sevenDaysFromNow &&
      !overrideEnabled
    ) {
      expiringSoon.push({
        companyId: s.companyId,
        planName: s.planName,
        currentPeriodEnd: currentEnd,
        hasOverride: overrideEnabled,
      });
    }
  });

  expiringSoon.sort((a, b) => a.currentPeriodEnd.getTime() - b.currentPeriodEnd.getTime());

  // Conversion + churn (last 30 days)
  const convRangeStart = last30Start;

  let trialsStarted = 0;
  let firstPayments = 0;
  let churned = 0;

  subs.forEach((s) => {
    const trialStarted = toDate((s as any).trialStartedAt);
    const updatedAt = toDate((s as any).updatedAt);

    if (trialStarted && trialStarted >= convRangeStart) {
      trialsStarted += 1;
    }

    if (
      s.status === 'expired' &&
      updatedAt &&
      updatedAt >= convRangeStart &&
      updatedAt <= now
    ) {
      churned += 1;
    }
  });

  payments.forEach((p) => {
    const isFirstPayment = (p as any).isFirstPayment === true;
    const createdAt = toDate((p as any).createdAt);
    if (isFirstPayment && createdAt && createdAt >= convRangeStart && createdAt <= now) {
      firstPayments += 1;
    }
  });

  const conversionRate =
    trialsStarted > 0 ? Math.round((firstPayments / trialsStarted) * 100) : 0;

  const revenue: RevenueMetrics = {
    totalThisMonth,
    totalLast30Days,
  };

  const active: ActiveMetrics = {
    activeSubscriptions,
    activeTrials,
  };

  const conversion: ConversionMetrics = {
    trialsStarted,
    firstPayments,
    conversionRate,
    churned,
  };

  const funnel: FunnelMetrics = {
    trialsStarted,
    activePaid: activeSubscriptions,
    renewed: 0, // can be populated later if we track renewals explicitly
  };

  return {
    revenue,
    active,
    conversion,
    revenueTrend,
    planMix,
    modeMix,
    funnel,
    topCompanies,
    expiringSoon,
  };
}

