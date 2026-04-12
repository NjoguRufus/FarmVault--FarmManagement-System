import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Loader2 } from 'lucide-react';
import { listRecordAuditLogForCompany } from '@/services/recordAuditLogService';
import { formatDate } from '@/lib/dateUtils';

type Props = {
  companyId: string | null;
};

function summarizeTable(schema: string, table: string) {
  if (schema === 'projects' && table === 'projects') return 'Project';
  if (schema === 'finance' && table === 'expenses') return 'Expense';
  if (schema === 'harvest' && table === 'harvest_collections') return 'Harvest collection';
  if (schema === 'harvest' && table === 'harvests') return 'Harvest sale / record';
  return `${schema}.${table}`;
}

export function RecordAuditLogPanel({ companyId }: Props) {
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['record_audit_log', companyId],
    enabled: Boolean(companyId),
    queryFn: () => listRecordAuditLogForCompany({ companyId: companyId as string, limit: 80 }),
  });

  if (!companyId) return null;

  return (
    <div className="fv-card">
      <div className="flex items-center gap-2 mb-3">
        <ScrollText className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Record change history</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Recent inserts, updates, and deletes on key farm records (projects, expenses, harvests, collections).
        Useful for tracing who changed what.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? 'Could not load audit history.'}
        </p>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">No audit entries yet for this company.</p>
      )}

      {!isLoading && !isError && (data?.length ?? 0) > 0 && (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="p-2 font-medium">When</th>
                <th className="p-2 font-medium">Record</th>
                <th className="p-2 font-medium">Action</th>
                <th className="p-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {data!.map((row) => (
                <tr key={row.id} className="border-b border-border/80 last:border-0">
                  <td className="p-2 whitespace-nowrap text-muted-foreground">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="p-2">
                    <span className="font-medium text-foreground">{summarizeTable(row.schema_name, row.table_name)}</span>
                    <span className="text-muted-foreground text-xs block font-mono truncate max-w-[200px]">
                      {row.record_id}
                    </span>
                  </td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground truncate max-w-[140px]">
                    {row.actor_user_id ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
