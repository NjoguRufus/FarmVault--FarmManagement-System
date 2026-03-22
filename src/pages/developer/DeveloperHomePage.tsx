import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { DeveloperStatGrid } from '@/components/developer/DeveloperStatGrid';
import { fetchDeveloperCompanies, fetchDeveloperKpis, fetchDeveloperUsers } from '@/services/developerService';
import { StatCard } from '@/components/dashboard/StatCard';
import { useSeasonChallengesIntelligence } from '@/hooks/developer/useSeasonChallengesIntelligence';

export default function DeveloperHomePage() {
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

  const pendingFromField = companyRows.reduce(
    (sum, row) => sum + Number((row.pending_payments_count as number | null) ?? 0),
    0,
  );

  const pendingFromStatus = companyRows.reduce((sum, row) => {
    const status = row.subscription?.status ?? row.subscription_status ?? '';
    const lowered = status.toLowerCase();
    if (['pending', 'past_due', 'unpaid'].includes(lowered)) {
      return sum + 1;
    }
    return sum;
  }, 0);

  const pendingPayments =
    pendingFromField > 0 ? pendingFromField : pendingFromStatus;

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
          <StatCard
            title="Pending payments"
            value={pendingPayments.toLocaleString()}
            icon={<DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />}
            variant={pendingPayments > 0 ? 'warning' : 'default'}
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

