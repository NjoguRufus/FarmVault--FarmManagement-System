import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, DollarSign } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { CompaniesTable } from '@/components/dashboard/CompaniesTable';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { mockActivityData } from '@/data/mockData';
import { useCollection } from '@/hooks/useCollection';
import { Company } from '@/types';
import { getDevDashboardKpis, DevDashboardKpis } from '@/services/developerAdminService';

export function DeveloperDashboard() {
  const navigate = useNavigate();
  const { data: companies = [], isLoading } = useCollection<Company>('companies', 'companies', {
    companyScoped: false,
    isDeveloper: true,
  });
  const [kpis, setKpis] = useState<DevDashboardKpis | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStats() {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const next = await getDevDashboardKpis();
      setKpis(next);
      setLastUpdated(new Date());
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : 'Failed to load platform stats');
    } finally {
      setLoadingStats(false);
    }
  }

  const companiesCount = Number(kpis?.companies ?? 0);
  const usersCount = Number(kpis?.users ?? 0);
  const employeesCount = Number(kpis?.employees ?? 0);
  const monthlyRevenue = Number(kpis?.monthly_revenue ?? 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Developer Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            System-wide overview and company management
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Last updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshStats}
            disabled={loadingStats}
            className="fv-btn fv-btn--outline text-xs"
          >
            {loadingStats ? 'Refreshing…' : 'Refresh stats'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/developer/companies')}
            className="fv-btn fv-btn--primary"
          >
            <Building2 className="h-4 w-4" />
            Add Company
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Registered Companies"
          value={companiesCount}
          change={undefined}
          changeLabel={loadingStats ? 'Loading…' : undefined}
          icon={<Building2 className="h-5 w-5" />}
          variant="primary"
        />
        <StatCard
          title="Active Users"
          value={usersCount.toLocaleString()}
          change={undefined}
          changeLabel={loadingStats ? 'Loading…' : undefined}
          icon={<Users className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          title="Employees"
          value={employeesCount.toLocaleString()}
          change={undefined}
          changeLabel={loadingStats ? 'Loading…' : undefined}
          icon={<Users className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          title="Monthly Revenue"
          value={`KES ${monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          change={undefined}
          changeLabel={loadingStats ? 'Loading…' : undefined}
          icon={<DollarSign className="h-5 w-5" />}
          variant="gold"
        />
      </div>

      {statsError && (
        <div className="text-xs text-destructive">
          Failed to load platform stats. Check console and RPC implementation (dev_dashboard_kpis).
        </div>
      )}

      {/* Companies Table */}
      <CompaniesTable companies={companies} loading={isLoading} />

      {/* Activity Chart */}
      <ActivityChart data={mockActivityData} />
    </div>
  );
}
