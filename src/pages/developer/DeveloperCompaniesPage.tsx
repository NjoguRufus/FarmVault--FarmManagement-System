import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { fetchDeveloperCompanies } from '@/services/developerService';

export default function DeveloperCompaniesPage() {
  const [search, setSearch] = useState('');
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'companies'],
    queryFn: fetchDeveloperCompanies,
  });

  const companies = data?.rows ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => {
      const name = (c.company_name ?? '').toLowerCase();
      const plan = (c.plan_code ?? '').toLowerCase();
      const status = (c.subscription_status ?? '').toLowerCase();
      const id = (c.company_id ?? c.id ?? '').toLowerCase();
      return (
        name.includes(term) ||
        plan.includes(term) ||
        status.includes(term) ||
        id.includes(term)
      );
    });
  }, [companies, search]);

  return (
    <DeveloperPageShell
      title="Companies"
      description="All FarmVault tenants with subscription status and trial information."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => void refetch()}
      searchPlaceholder="Search by name, plan, status, or company ID…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load companies.'}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="fv-card text-sm text-muted-foreground">
          No companies found. Once tenants start signing up, they will appear here.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="fv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Plan</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-left font-medium">Billing</th>
                <th className="py-2 text-left font-medium">Trial ends</th>
                <th className="py-2 text-left font-medium">Active until</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const id = c.company_id ?? c.id ?? '';
                return (
                  <tr key={id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-foreground">{c.company_name ?? '—'}</div>
                      <div className="text-[11px] text-muted-foreground">{id}</div>
                    </td>
                    <td className="py-2 pr-4 text-xs">{c.plan_code ?? c.subscription?.plan ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs capitalize">
                      {c.subscription_status ?? c.subscription?.status ?? 'unknown'}
                    </td>
                    <td className="py-2 pr-4 text-xs">{c.billing_mode ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs">
                      {c.trial_ends_at ?? c.subscription?.trial_end ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {c.active_until ?? c.subscription?.period_end ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DeveloperPageShell>
  );
}

