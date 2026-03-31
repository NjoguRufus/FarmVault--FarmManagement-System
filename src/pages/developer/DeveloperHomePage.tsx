import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { DeveloperStatGrid } from '@/components/developer/DeveloperStatGrid';
import { fetchDeveloperCompanies, fetchDeveloperKpis, fetchDeveloperUsers } from '@/services/developerService';
import { StatCard } from '@/components/dashboard/StatCard';
import { useSeasonChallengesIntelligence } from '@/hooks/developer/useSeasonChallengesIntelligence';
import { computeSubscriptionStatus } from '@/lib/subscription/subscriptionStatus';
import { computeSubscriptionVisibility } from '@/lib/subscription/subscriptionVisibility';
import { computeCompanySubscriptionState } from '@/features/billing/lib/computeCompanySubscriptionState';
import { useNow } from '@/hooks/useNow';

export default function DeveloperHomePage() {
  const now = useNow(60_000);
  const {
    data: kpis,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'kpis'],
    queryFn: fetchDeveloperKpis,
  });

  const {
    data: companiesData,
  } = useQuery({
    queryKey: ['developer', 'companies', 'overview'],
    queryFn: () => fetchDeveloperCompanies({ limit: 200, offset: 0 }),
  });

  const {
    data: usersData,
  } = useQuery({
    queryKey: ['developer', 'users', 'overview'],
    queryFn: () => fetchDeveloperUsers({ limit: 1 }), // total comes from RPC
  });

  const {
    data: challengesIntel,
    isLoading: loadingChallenges,
    error: challengesError,
  } = useSeasonChallengesIntelligence();

  const companyRows = companiesData?.items ?? [];
  const totalCompanies = companiesData?.total ?? companyRows.length;
  const userRows = usersData?.rows ?? [];
  const totalUsers = usersData?.total ?? userRows.length;

  const totalEmployees = companyRows.reduce(
    (sum, row) => sum + Number((row.employees_count as number | null) ?? 0),
    0,
  );

  const paymentRequiredCount = useMemo(() => {
    return companyRows.reduce((sum, row) => {
      const status = computeSubscriptionStatus(
        {
          trialEnd: (row.trial_ends_at as string | null | undefined) ?? (row.subscription?.trial_end as string | null | undefined),
          activeUntil: (row.active_until as string | null | undefined) ?? (row.subscription?.period_end as string | null | undefined),
          isSuspended: String(row.subscription_status ?? '').toLowerCase() === 'suspended',
          planCode: (row.plan_code as string | null | undefined) ?? (row.subscription?.plan as string | null | undefined),
        },
        now,
      );
      return sum + (status.paymentRequired ? 1 : 0);
    }, 0);
  }, [companyRows, now]);

  const paymentLifecycleCounters = useMemo(() => {
    const out = {
      activeTrials: 0,
      trialsExpired: 0,
      pendingConfirmations: 0,
      paidActiveCompanies: 0,
      subscriptionExpired: 0,
      paymentRequired: 0,
    };

    for (const row of companyRows as any[]) {
      const derived = computeCompanySubscriptionState(
        {
          companyStatus: (row.company_status as string | null | undefined) ?? null,
          planCode: (row.plan_code as string | null | undefined) ?? (row.subscription?.plan as string | null | undefined) ?? null,
          subscriptionStatus: (row.subscription_status as string | null | undefined) ?? (row.subscription?.status as string | null | undefined) ?? null,
          isTrial: (row.is_trial as boolean | null | undefined) ?? (row.subscription?.is_trial as boolean | null | undefined) ?? null,
          trialStartsAt: null,
          trialEndsAt: (row.trial_ends_at as string | null | undefined) ?? (row.subscription?.trial_end as string | null | undefined),
          activeUntil: (row.active_until as string | null | undefined) ?? (row.subscription?.period_end as string | null | undefined),
          latestPaymentStatus: (row.latest_subscription_payment?.status as string | null | undefined) ?? null,
        },
        now,
      );

      if (derived.accessStatus === 'suspended') continue;

      if (derived.paymentStatus === 'pending_confirmation') out.pendingConfirmations += 1;
      if (derived.accessSource === 'trial' && derived.accessStatus === 'active') out.activeTrials += 1;
      if (derived.accessSource === 'trial' && derived.accessStatus === 'expired') out.trialsExpired += 1;
      if (derived.accessSource === 'subscription' && derived.accessStatus === 'active' && derived.paymentStatus === 'paid') out.paidActiveCompanies += 1;
      if (derived.accessSource === 'subscription' && derived.accessStatus === 'expired') out.subscriptionExpired += 1;
      if (derived.paymentRequired) out.paymentRequired += 1;
    }
    return out;
  }, [companyRows, now]);

  const accessCounters = useMemo(() => {
    const out = {
      activeProTrials: 0,
      activeProSubscriptions: 0,
      expiredTrials: 0,
      expiredSubscriptions: 0,
      suspended: 0,
    };
    for (const row of companyRows as any[]) {
      const visibility = computeSubscriptionVisibility(
        {
          planCode: (row.plan_code as string | null | undefined) ?? (row.subscription?.plan as string | null | undefined),
          trialStartsAt: null,
          trialEndsAt: (row.trial_ends_at as string | null | undefined) ?? (row.subscription?.trial_end as string | null | undefined),
          activeUntil: (row.active_until as string | null | undefined) ?? (row.subscription?.period_end as string | null | undefined),
          isTrial: (row.is_trial as boolean | null | undefined) ?? (row.subscription?.is_trial as boolean | null | undefined) ?? null,
          subscriptionStatus: (row.subscription_status as string | null | undefined) ?? (row.subscription?.status as string | null | undefined) ?? null,
          isSuspended: String(row.subscription_status ?? '').toLowerCase() === 'suspended',
        },
        now,
      );
      if (visibility.accessStatus === 'suspended') {
        out.suspended += 1;
        continue;
      }
      if (visibility.accessStatus === 'active') {
        if (visibility.plan === 'pro' && visibility.accessType === 'trial') out.activeProTrials += 1;
        if (visibility.plan === 'pro' && visibility.accessType === 'subscription') out.activeProSubscriptions += 1;
      } else {
        if (visibility.accessType === 'trial') out.expiredTrials += 1;
        else out.expiredSubscriptions += 1;
      }
    }
    return out;
  }, [companyRows, now]);

  const totalChallenges = Number(challengesIntel?.totalChallenges ?? 0);

  return (
    <DeveloperPageShell
      title="Developer Home"
      description="High-level overview of FarmVault tenants, users, and billing health."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => void refetch()}
    >
      <div className="space-y-6 md:space-y-8">
        <DeveloperStatGrid cols="4">
          <StatCard
            title="Companies"
            value={totalCompanies.toLocaleString()}
            icon={<Building2 className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="primary"
            compact
          />
          <StatCard
            title="Users"
            value={totalUsers.toLocaleString()}
            icon={<Users className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="default"
            compact
          />
          <StatCard
            title="Employees"
            value={totalEmployees.toLocaleString()}
            icon={<Users className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant="default"
            compact
          />
          <Link to="/developer/companies?subscription=payment_required" className="block">
            <StatCard
              title="Pending payments"
              value={paymentRequiredCount.toLocaleString()}
              icon={<DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />}
              variant={paymentRequiredCount > 0 ? 'warning' : 'default'}
              compact
            />
          </Link>
        </DeveloperStatGrid>

        <DeveloperStatGrid cols="5">
          <StatCard
            title="Active Trials"
            value={Number(paymentLifecycleCounters.activeTrials ?? 0).toLocaleString()}
            icon={<Users className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant={Number(paymentLifecycleCounters.activeTrials ?? 0) > 0 ? 'warning' : 'default'}
            compact
          />
          <StatCard
            title="Paid Active Companies"
            value={Number(paymentLifecycleCounters.paidActiveCompanies ?? 0).toLocaleString()}
            icon={<DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant={Number(paymentLifecycleCounters.paidActiveCompanies ?? 0) > 0 ? 'primary' : 'default'}
            compact
          />
          <StatCard
            title="Trials Expired"
            value={Number(paymentLifecycleCounters.trialsExpired ?? 0).toLocaleString()}
            icon={<AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant={Number(paymentLifecycleCounters.trialsExpired ?? 0) > 0 ? 'warning' : 'default'}
            compact
          />
          <StatCard
            title="Pending Confirmations"
            value={Number(paymentLifecycleCounters.pendingConfirmations ?? 0).toLocaleString()}
            icon={<AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant={Number(paymentLifecycleCounters.pendingConfirmations ?? 0) > 0 ? 'warning' : 'default'}
            compact
          />
          <StatCard
            title="Subscription Expired"
            value={Number(paymentLifecycleCounters.subscriptionExpired ?? 0).toLocaleString()}
            icon={<Building2 className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant={Number(paymentLifecycleCounters.subscriptionExpired ?? 0) > 0 ? 'warning' : 'default'}
            compact
          />
        </DeveloperStatGrid>

        {/* Season challenges intelligence preview */}
        <section className="space-y-3">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              Season Challenges Intelligence
            </h2>
            <p className="text-xs text-muted-foreground sm:text-right sm:max-w-[55%]">
              Cross-company challenges by crop and stage (last 500 entries).
            </p>
          </div>

          {loadingChallenges ? (
            <div className="fv-card text-sm text-muted-foreground">Loading season challenges…</div>
          ) : challengesError ? (
            <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-xs">
              Failed to load season challenges intelligence.
            </div>
          ) : !challengesIntel || challengesIntel.totalChallenges === 0 ? (
            <div className="fv-card text-sm text-muted-foreground">
              No season challenges have been reported yet across companies.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              <div className="fv-card space-y-2">
                <p className="text-xs text-muted-foreground">Total challenges (sampled)</p>
                <p className="text-2xl font-semibold">{totalChallenges.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">
                  Last {challengesIntel.recent.length.toLocaleString()} entries shown below.
                </p>
              </div>
              <div className="fv-card space-y-2">
                <p className="text-xs text-muted-foreground">Top crops by challenge count</p>
                <ul className="space-y-1 text-xs">
                  {challengesIntel.byCrop.slice(0, 4).map((c) => (
                    <li key={c.cropType} className="flex items-center justify-between">
                      <span className="capitalize">{c.cropType || 'Unknown'}</span>
                      <span className="text-muted-foreground">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="fv-card space-y-2">
                <p className="text-xs text-muted-foreground">Stages with most challenges</p>
                <ul className="space-y-1 text-xs">
                  {challengesIntel.byStage.slice(0, 4).map((s, idx) => (
                    <li key={`${s.cropType ?? 'any'}-${s.stageName ?? 'unknown'}-${idx}`} className="flex items-center justify-between">
                      <span className="truncate max-w-[70%]">
                        {s.cropType ? `${s.cropType} · ` : ''}
                        {s.stageName || 'Unknown stage'}
                      </span>
                      <span className="text-muted-foreground">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {isLoading && (
          <div className="fv-card text-sm text-muted-foreground">Loading platform KPIs…</div>
        )}

        {error && !isLoading && (
          <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
            {(error as Error).message || 'Failed to load platform KPIs.'}
          </div>
        )}

        {!isLoading && !error && !kpis && (
          <div className="fv-card text-sm text-muted-foreground">
            No developer KPIs available yet. Ensure the `dev_dashboard_kpis` RPC is deployed.
          </div>
        )}
      </div>
    </DeveloperPageShell>
  );
}

