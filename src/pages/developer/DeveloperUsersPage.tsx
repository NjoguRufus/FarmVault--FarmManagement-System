import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { fetchDeveloperUsers } from '@/services/developerService';

export default function DeveloperUsersPage() {
  const [search, setSearch] = useState('');
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'users'],
    queryFn: () => fetchDeveloperUsers(),
  });

  const rows = data?.rows ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((u) => {
      const email = (u.email ?? '').toLowerCase();
      const name = (u.full_name ?? '').toLowerCase();
      const role = (u.role ?? '').toLowerCase();
      const company = (u.company_name ?? u.company?.company_name ?? '').toLowerCase();
      const userId = (u.user_id ?? '').toLowerCase();
      return (
        email.includes(term) ||
        name.includes(term) ||
        role.includes(term) ||
        company.includes(term) ||
        userId.includes(term)
      );
    });
  }, [rows, search]);

  return (
    <DeveloperPageShell
      title="Platform Users"
      description="All non-developer user accounts across FarmVault."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => void refetch()}
      searchPlaceholder="Search by email, name, role, or company…"
      searchValue={search}
      onSearchChange={setSearch}
    >
      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load users.'}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="fv-card text-sm text-muted-foreground">
          No users found. Once customers start inviting their teams, they will appear here.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="fv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">User</th>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Role</th>
                <th className="py-2 text-left font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, idx) => {
                const name = u.full_name || 'Unnamed User';
                const email = u.email || '—';
                const companyName = u.company_name || u.company?.company_name || 'No Company';
                const role = u.role || u.company?.role || '—';
                const createdAt = u.created_at || '—';
                // Use compound key: user_id + company_id + index to handle users in multiple companies
                const rowKey = `${u.user_id}-${u.company_id ?? 'no-company'}-${idx}`;

                return (
                  <tr key={rowKey} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-foreground">{name}</div>
                      <div className="text-[11px] text-muted-foreground break-all">
                        {email} · {u.user_id}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      <div>{companyName}</div>
                      <div className="text-[11px] text-muted-foreground">{u.company_id ?? u.company?.company_id ?? ''}</div>
                    </td>
                    <td className="py-2 pr-4 text-xs capitalize">{role}</td>
                    <td className="py-2 pr-4 text-xs">{createdAt}</td>
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

