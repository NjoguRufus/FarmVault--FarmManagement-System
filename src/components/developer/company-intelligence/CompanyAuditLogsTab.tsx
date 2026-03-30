import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Eye, FileText, Hash, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDate } from './utils';
import {
  fetchDeveloperCompanyAuditLogsPage,
  type DeveloperCompanyAuditLogRow,
} from '@/services/developerCompanyIntelligenceService';
import { DeveloperRecordDetailsSheet } from './DeveloperRecordDetailsSheet';

const PAGE_SIZE = 50;

type Props = {
  companyId: string;
  active: boolean;
};

/** Checks if companyId is a non-empty string (valid for query). */
function hasValidCompanyId(companyId: string | null | undefined): boolean {
  if (companyId == null) return false;
  const trimmed = String(companyId).trim();
  return trimmed !== '';
}

export function CompanyAuditLogsTab({ companyId, active }: Props) {
  const [offset, setOffset] = useState(0);
  const [moduleFilter, setModuleFilter] = useState('');
  const [selected, setSelected] = useState<DeveloperCompanyAuditLogRow | null>(null);

  const validCompanyId = hasValidCompanyId(companyId);
  const normalizedId = validCompanyId ? companyId.trim() : '';

  const moduleParam =
    moduleFilter.trim() === '' ? null : moduleFilter.trim().toLowerCase();

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['developer', 'company-audit-logs', normalizedId, offset, moduleParam],
    queryFn: () =>
      fetchDeveloperCompanyAuditLogsPage({
        companyId: normalizedId,
        limit: PAGE_SIZE,
        offset,
        module: moduleParam,
      }),
    enabled: active && validCompanyId,
    staleTime: 30_000,
  });

  const rows: DeveloperCompanyAuditLogRow[] = data?.rows ?? [];
  const hasMore = Boolean(data?.hasMore);

  const selectedSections = useMemo(() => {
    if (!selected) return [];
    return [
      {
        title: 'Audit event',
        items: [
          { label: 'Action / event', value: <Inline icon={<FileText className="h-4 w-4" />} value={selected.action.replace(/_/g, ' ')} /> },
          { label: 'Actor', value: <Inline icon={<UserRound className="h-4 w-4" />} value={selected.actor_label ?? '—'} />, mono: true },
          { label: 'Timestamp', value: formatDevDate(selected.logged_at) },
          { label: 'Module', value: selected.module },
          { label: 'Target record', value: <Inline icon={<Hash className="h-4 w-4" />} value={selected.affected_record ?? '—'} />, mono: true },
        ],
      },
      {
        title: 'Description',
        items: [{ label: 'Message', value: selected.description || '—' }],
      },
    ] as any;
  }, [selected]);

  const onModuleInputChange = (value: string) => {
    setModuleFilter(value);
    setOffset(0);
  };

  if (!active) {
    return null;
  }

  if (!validCompanyId) {
    return (
      <EmptyStateBlock
        title="No company selected"
        description="Select a company to view audit logs."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="fv-card flex flex-col gap-2 border-destructive/40 bg-destructive/5 p-4 text-destructive sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Failed to load audit logs</p>
              <p className="text-xs opacity-90">{(error as Error).message}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="fv-card space-y-3 p-4">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      )}

      {!isLoading && !error && !rows.length && offset === 0 && !moduleParam && (
        <EmptyStateBlock title="No audit logs available for this company." />
      )}
      {!isLoading && !error && !rows.length && offset === 0 && moduleParam && (
        <EmptyStateBlock
          title="No audit logs match this filter"
          description="Try clearing the module filter or use a different entity type."
        />
      )}

      {!isLoading && !error && (rows.length > 0 || offset > 0) && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase text-muted-foreground" htmlFor="audit-module-filter">
                Module filter
              </label>
              <input
                id="audit-module-filter"
                type="text"
                className="h-9 w-full max-w-xs rounded-lg border border-border/60 bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="entity_type (exact, e.g. harvest)"
                value={moduleFilter}
                onChange={(e) => onModuleInputChange(e.target.value)}
                aria-label="Filter audit logs by module"
              />
              <p className="text-[10px] text-muted-foreground">
                Matches <span className="font-mono">audit_logs.entity_type</span> (empty rows use “general”).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isFetching && !isLoading ? (
                <span className="text-[10px] text-muted-foreground">Updating…</span>
              ) : null}
              <Button variant="outline" size="sm" type="button" onClick={() => void refetch()}>
                Refresh
              </Button>
            </div>
          </div>

          {!rows.length && offset > 0 ? (
            <EmptyStateBlock title="No more entries on this page" description="Go back to the previous page." />
          ) : null}

          {rows.length > 0 ? (
            <div className="fv-card overflow-x-auto">
              <table className="fv-table-mobile w-full min-w-[900px] text-sm">
                <thead className="border-b border-border/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left font-medium">Timestamp</th>
                    <th className="py-2 text-left font-medium">Action</th>
                    <th className="py-2 text-left font-medium">Module</th>
                    <th className="py-2 text-left font-medium">User</th>
                    <th className="py-2 text-left font-medium">Description</th>
                    <th className="py-2 text-left font-medium">Affected record</th>
                    <th className="py-2 text-right font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((log) => (
                    <tr key={log.id} className="border-b border-border/40">
                      <td className="py-2 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDevDate(log.logged_at)}
                      </td>
                      <td className="py-2 text-xs font-medium capitalize">{log.action.replace(/_/g, ' ')}</td>
                      <td className="py-2 text-xs">{log.module}</td>
                      <td className="py-2 text-xs max-w-[160px] truncate" title={log.actor_label ?? undefined}>
                        {log.actor_label || '—'}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground max-w-[280px]">
                        <span className="line-clamp-3" title={log.description}>
                          {log.description || '—'}
                        </span>
                      </td>
                      <td className="py-2 font-mono text-[10px] text-muted-foreground max-w-[120px] truncate" title={log.affected_record ?? undefined}>
                        {log.affected_record || '—'}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2 text-xs"
                          onClick={() => setSelected(log)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Page {Math.floor(offset / PAGE_SIZE) + 1}
              {rows.length ? ` · ${rows.length} row${rows.length === 1 ? '' : 's'}` : ''}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0 || isFetching}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasMore || isFetching}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>

          <DeveloperRecordDetailsSheet
            open={Boolean(selected)}
            onOpenChange={(o) => !o && setSelected(null)}
            title={selected ? selected.action.replace(/_/g, ' ') : 'Audit event'}
            description="Audit log inspection (read-only)."
            recordId={selected?.id ?? null}
            sections={selectedSections as any}
            raw={selected ?? undefined}
          />
        </>
      )}
    </div>
  );
}

function Inline({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">{value}</span>
    </span>
  );
}
