import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { listCompanyBackups } from '@/services/backupService';
import { Input } from '@/components/ui/input';

export default function DeveloperBackupsPage() {
  const [companyId, setCompanyId] = useState('');

  const {
    data: backups,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'backups', companyId],
    queryFn: () => listCompanyBackups(companyId),
    enabled: !!companyId,
  });

  return (
    <DeveloperPageShell
      title="Backups"
      description="Company-level Firestore backup snapshots for disaster recovery."
      isLoading={isLoading}
      isRefetching={isFetching}
      onRefresh={() => companyId && void refetch()}
    >
      <div className="fv-card mb-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          Enter a company ID to view its existing backup snapshots.
        </p>
        <div className="flex gap-2 max-w-md">
          <Input
            placeholder="Company ID (Firestore / Supabase UUID)…"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error).message || 'Failed to load backups.'}
        </div>
      )}

      {!companyId && (
        <div className="fv-card text-sm text-muted-foreground">
          Start by entering a company ID above to see available backups.
        </div>
      )}

      {companyId && !isLoading && !error && (!backups || backups.length === 0) && (
        <div className="fv-card text-sm text-muted-foreground">
          No backups found for this company yet. Use the existing developer tools to create an
          initial snapshot.
        </div>
      )}

      {companyId && backups && backups.length > 0 && (
        <div className="fv-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2 text-left font-medium">Snapshot ID</th>
                <th className="py-2 text-left font-medium">Company</th>
                <th className="py-2 text-left font-medium">Created at</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-4 text-xs font-mono break-all">{b.id}</td>
                  <td className="py-2 pr-4 text-xs">
                    <div>{b.companyName ?? b.companyId}</div>
                    <div className="text-[11px] text-muted-foreground">{b.companyId}</div>
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {b.createdAt ? String((b.createdAt as any).toDate?.() ?? b.createdAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DeveloperPageShell>
  );
}

