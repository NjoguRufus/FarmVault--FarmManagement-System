import React, { useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInHours } from 'date-fns';
import { format } from 'date-fns';
import { enGB } from 'date-fns/locale';
import { History, Loader2, RotateCcw, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { computeAuditDiff, type AuditDiffEntry } from '@/lib/auditLogDiff';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  invalidateCachesAfterAuditMutation,
  isAuditMutationTarget,
  isSensitiveUndoTarget,
  restoreRecordFromAuditLog,
  undoAuditUpdate,
} from '@/services/auditLogMutationsService';
import {
  inferAuditSchemaForTable,
  listAuditLogsPage,
  type AuditEntityCategory,
  type AuditLogRow,
} from '@/services/auditLogsService';

const PAGE_SIZE = 50;
const DEFAULT_UNDO_WINDOW_HOURS = 24;

export function getAuditEntityTitle(schema: string, table: string): string {
  if (schema === 'projects' && table === 'projects') return 'Project';
  if (schema === 'finance' && table === 'expenses') return 'Expense';
  if (schema === 'harvest' && table === 'harvest_collections') return 'Harvest collection';
  if (schema === 'harvest' && table === 'harvests') return 'Harvest';
  if (schema === 'public' && table === 'employees') return 'Employee';
  if (schema === 'public' && table === 'inventory_items') return 'Inventory item';
  if (schema === 'public' && table === 'inventory_purchases') return 'Inventory purchase';
  return `${schema}.${table}`;
}

function actionEmoji(action: string): string {
  const a = action.toUpperCase();
  if (a === 'INSERT') return '➕';
  if (a === 'DELETE') return '🗑️';
  if (a === 'RESTORE') return '↩️';
  return '✏️';
}

function actionSummary(action: string, entityTitle: string): string {
  const a = action.toUpperCase();
  const noun = entityTitle;
  if (a === 'INSERT') return `Created ${noun}`;
  if (a === 'DELETE') return `Deleted ${noun}`;
  if (a === 'RESTORE') return `Restored ${noun}`;
  return `Updated ${noun}`;
}

function actionBadgeClass(action: string): string {
  const a = action.toUpperCase();
  if (a === 'INSERT') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  if (a === 'DELETE') return 'bg-destructive/15 text-destructive';
  if (a === 'RESTORE') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
  return 'bg-primary/10 text-primary';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type AuditLogsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  companyId: string | null;
  /** Optional Postgres schema; when omitted with `tableName`, schema is inferred (e.g. expenses → finance). */
  schemaName?: string | null;
  tableName?: string | null;
  recordId?: string | null;
  /** Global drawer: category chips map to `.eq` / `.in` filters on `schema_name` / `table_name`. */
  showEntityFilters?: boolean;
  /** Called after a successful restore or undo (e.g. parent-specific refetch). */
  onMutationSuccess?: () => void;
  /** Disable “Undo” for updates older than this many hours (default 24). */
  undoWindowHours?: number;
};

export function AuditLogsDrawer({
  isOpen,
  onClose,
  companyId,
  schemaName,
  tableName,
  recordId,
  showEntityFilters = false,
  onMutationSuccess,
  undoWindowHours = DEFAULT_UNDO_WINDOW_HOURS,
}: AuditLogsDrawerProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isDeveloper, isCompanyAdmin } = usePermissions();

  const scoped = Boolean(tableName?.trim() && recordId?.trim());
  const tableOnly = Boolean(tableName?.trim() && !recordId?.trim());
  const showTabs = Boolean(showEntityFilters && !scoped && !tableOnly);

  const [category, setCategory] = React.useState<AuditEntityCategory>('all');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [undoTarget, setUndoTarget] = React.useState<AuditLogRow | null>(null);

  const canAuditMutate = Boolean(
    isDeveloper || isCompanyAdmin || user?.role === 'manager',
  );

  React.useEffect(() => {
    if (!isOpen) setCategory('all');
  }, [isOpen]);

  const filterCategory: AuditEntityCategory = showTabs ? category : 'all';

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'audit_logs_drawer',
      companyId,
      schemaName ?? '',
      tableName ?? '',
      recordId ?? '',
      filterCategory,
    ],
    enabled: Boolean(isOpen && companyId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      listAuditLogsPage({
        companyId: companyId as string,
        schemaName: schemaName ?? undefined,
        tableName: tableName ?? undefined,
        recordId: recordId ?? undefined,
        category: filterCategory,
        limit: PAGE_SIZE,
        offset: pageParam as number,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      const loaded = allPages.reduce((n, p) => n + p.rows.length, 0);
      return loaded;
    },
  });

  const rows: AuditLogRow[] = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data?.pages]);

  const actorIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const id = r.actor_user_id?.trim();
      if (id) s.add(id);
    }
    return [...s];
  }, [rows]);

  const { data: actorNameById = {} } = useQuery({
    queryKey: ['audit_logs_actor_names', companyId, [...actorIds].sort().join('|')],
    enabled: Boolean(isOpen && companyId && actorIds.length),
    queryFn: async () => {
      const map: Record<string, string> = {};
      for (const part of chunk(actorIds, 40)) {
        const { data, error } = await db
          .core()
          .from('profiles')
          .select('clerk_user_id, full_name, email')
          .in('clerk_user_id', part);
        if (error) continue;
        for (const row of data ?? []) {
          const id = String((row as { clerk_user_id?: string }).clerk_user_id ?? '');
          const fn = (row as { full_name?: string | null }).full_name?.trim();
          const em = (row as { email?: string | null }).email?.trim();
          map[id] = fn || em || (id ? `${id.slice(0, 8)}…` : '—');
        }
      }
      return map;
    },
    staleTime: 60_000,
  });

  const resolveActor = (id: string | null) => {
    if (!id?.trim()) return 'System';
    return actorNameById[id] ?? `${id.slice(0, 10)}…`;
  };

  const refreshAfterMutation = async (row: AuditLogRow) => {
    if (companyId) {
      await invalidateCachesAfterAuditMutation(qc, companyId, row);
    }
    onMutationSuccess?.();
  };

  const handleRestore = async (row: AuditLogRow) => {
    try {
      setBusyId(row.id);
      await restoreRecordFromAuditLog(row);
      toast.success('Record restored');
      await refreshAfterMutation(row);
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Restore failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleUndoConfirmed = async () => {
    if (!undoTarget || !companyId) return;
    const row = undoTarget;
    try {
      setBusyId(row.id);
      await undoAuditUpdate(row);
      toast.success('Change reverted');
      await refreshAfterMutation(row);
      setUndoTarget(null);
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Could not revert this change');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AlertDialog open={Boolean(undoTarget)} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert this change?</AlertDialogTitle>
            <AlertDialogDescription>
              The record will be overwritten with the previous values from this audit entry. This cannot be
              automatically reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busyId !== null}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" disabled={busyId !== null} onClick={() => void handleUndoConfirmed()}>
              {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revert'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent
          side="right"
          draggable
          className="w-full sm:max-w-[min(500px,92vw)] p-0 flex flex-col gap-0 border-l"
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/80 text-left shrink-0">
            <div className="flex items-center gap-2 pr-8">
              <ScrollText className="h-5 w-5 text-primary shrink-0" />
              <SheetTitle className="text-lg">Audit logs</SheetTitle>
            </div>
            <SheetDescription className="text-left">
              {scoped
                ? 'History for this record.'
                : tableOnly
                  ? `Changes for ${getAuditEntityTitle(
                      (schemaName?.trim() || inferAuditSchemaForTable(tableName as string)) as string,
                      (tableName as string).trim(),
                    )} records.`
                  : 'Company-wide change history from automated record auditing.'}
            </SheetDescription>
          </SheetHeader>

          {showTabs && (
            <div className="px-3 py-2 border-b border-border/60 shrink-0">
              <Tabs value={category} onValueChange={(v) => setCategory(v as AuditEntityCategory)}>
                <TabsList className="h-auto w-full flex flex-wrap justify-start gap-1 bg-muted/60 p-1">
                  {(
                    [
                      ['all', 'All'],
                      ['projects', 'Projects'],
                      ['expenses', 'Expenses'],
                      ['harvest', 'Harvest'],
                      ['employees', 'Employees'],
                      ['inventory', 'Inventory'],
                    ] as const
                  ).map(([value, label]) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="text-xs px-2 py-1.5 data-[state=active]:shadow-sm"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            {!companyId && (
              <p className="text-sm text-muted-foreground px-5 py-4">Select a company to view audit logs.</p>
            )}

            {companyId && isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm px-5 py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading history…
              </div>
            )}

            {companyId && isError && (
              <p className="text-sm text-destructive px-5 py-4">
                {(error as Error)?.message ?? 'Could not load audit logs.'}
              </p>
            )}

            {companyId && !isLoading && !isError && rows.length === 0 && (
              <p className="text-sm text-muted-foreground px-5 py-6">No audit entries match these filters yet.</p>
            )}

            {companyId && !isLoading && !isError && rows.length > 0 && (
              <ScrollArea className="flex-1 min-h-0">
                <ul className="px-4 py-3 space-y-4 pb-6">
                  {rows.map((row) => (
                    <AuditLogListItem
                      key={row.id}
                      row={row}
                      resolveActor={resolveActor}
                      hideRecordMeta={scoped}
                      canAuditMutate={canAuditMutate}
                      undoWindowHours={undoWindowHours}
                      busyId={busyId}
                      onRestore={() => void handleRestore(row)}
                      onUndo={() => setUndoTarget(row)}
                    />
                  ))}
                </ul>
              </ScrollArea>
            )}

            {companyId && hasNextPage && (
              <div className="p-3 border-t border-border/60 shrink-0 bg-background/95 backdrop-blur-sm">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading…
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function AuditDiffHighlighted({ entries }: { entries: AuditDiffEntry[] }) {
  return (
    <ul className="text-xs space-y-2">
      {entries.map((d) => (
        <li
          key={d.field}
          className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2"
        >
          <div className="font-medium text-foreground/90 mb-1">{d.field}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex max-w-full break-words rounded px-1.5 py-0.5',
                'bg-rose-500/12 text-rose-900 dark:text-rose-100 line-through decoration-rose-500/40',
              )}
            >
              {d.oldDisplay}
            </span>
            <span className="text-muted-foreground shrink-0">→</span>
            <span
              className={cn(
                'inline-flex max-w-full break-words rounded px-1.5 py-0.5',
                'bg-emerald-500/12 text-emerald-900 dark:text-emerald-100',
              )}
            >
              {d.newDisplay}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AuditLogListItem({
  row,
  resolveActor,
  hideRecordMeta,
  canAuditMutate,
  undoWindowHours,
  busyId,
  onRestore,
  onUndo,
}: {
  row: AuditLogRow;
  resolveActor: (id: string | null) => string;
  hideRecordMeta: boolean;
  canAuditMutate: boolean;
  undoWindowHours: number;
  busyId: string | null;
  onRestore: () => void;
  onUndo: () => void;
}) {
  const entity = getAuditEntityTitle(row.schema_name, row.table_name);
  const when = format(new Date(row.created_at), 'd MMM yyyy, HH:mm', { locale: enGB });
  const diffs =
    row.action === 'UPDATE'
      ? computeAuditDiff(
          row.old_data as Record<string, unknown> | null,
          row.new_data as Record<string, unknown> | null,
        )
      : row.action === 'INSERT'
        ? computeAuditDiff({}, row.new_data as Record<string, unknown> | null)
        : row.action === 'DELETE'
          ? computeAuditDiff(row.old_data as Record<string, unknown> | null, {})
          : ([] as AuditDiffEntry[]);

  const targetOk = isAuditMutationTarget(row.schema_name, row.table_name);
  const oldDataObj =
    row.old_data != null && typeof row.old_data === 'object' && !Array.isArray(row.old_data)
      ? (row.old_data as Record<string, unknown>)
      : null;
  const undoAgeOk = differenceInHours(new Date(), new Date(row.created_at)) < undoWindowHours;
  const undoAllowed =
    canAuditMutate &&
    row.action === 'UPDATE' &&
    oldDataObj != null &&
    targetOk &&
    undoAgeOk &&
    !isSensitiveUndoTarget(row.schema_name, row.table_name);

  const restoreAllowed = canAuditMutate && row.action === 'DELETE' && targetOk;

  const busy = busyId === row.id;

  return (
    <li className="rounded-xl border border-border/80 bg-card/40 p-3.5 shadow-sm">
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>
          <span className="mr-1.5" aria-hidden>
            🕓
          </span>
          {when}
        </div>
        <div>
          <span className="mr-1.5" aria-hidden>
            👤
          </span>
          {resolveActor(row.actor_user_id)}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-base leading-none" aria-hidden>
            {actionEmoji(row.action)}
          </span>
          <span className="text-sm font-medium text-foreground">{actionSummary(row.action, entity)}</span>
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5',
              actionBadgeClass(row.action),
            )}
          >
            {row.action}
          </span>
        </div>
      </div>

      {!hideRecordMeta && (
        <p
          className="mt-2 text-[11px] font-mono text-muted-foreground truncate"
          title={`${row.schema_name}.${row.table_name} · ${row.record_id}`}
        >
          {row.schema_name}.{row.table_name} · {row.record_id}
        </p>
      )}

      {diffs.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border/60">
          <p className="text-xs font-semibold text-foreground mb-2">Changes</p>
          <AuditDiffHighlighted entries={diffs} />
        </div>
      )}

      {(restoreAllowed || row.action === 'UPDATE') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {restoreAllowed && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={busy}
              onClick={onRestore}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5 mr-1.5" />}
              Restore
            </Button>
          )}
          {row.action === 'UPDATE' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!undoAllowed || busy}
              title={
                !canAuditMutate
                  ? 'Only managers and company admins can undo from audit history.'
                  : !undoAgeOk
                    ? `Undo is disabled after ${undoWindowHours} hours.`
                    : !targetOk
                      ? 'Undo is not available for this record type.'
                      : oldDataObj == null
                        ? 'No previous snapshot is stored for this entry.'
                        : undefined
              }
              onClick={onUndo}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
              Undo
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
