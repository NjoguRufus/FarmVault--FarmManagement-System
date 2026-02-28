import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Circle, CheckCircle2, AlertTriangle, Info, Filter } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { subscribeActivity, type ActivityLogDoc } from '@/services/activityLogService';
import { cn } from '@/lib/utils';

type SnapshotFilter = 'all' | 'tasks' | 'harvest' | 'inventory' | 'payments';

interface OperationsSnapshotProps {
  className?: string;
}

function getFilterForType(type: string): SnapshotFilter {
  const t = type.toUpperCase();
  if (t.startsWith('TASK_')) return 'tasks';
  if (t.startsWith('HARVEST_')) return 'harvest';
  if (t.startsWith('INVENTORY_')) return 'inventory';
  if (t.includes('PAYMENT') || t.includes('WALLET')) return 'payments';
  if (t === 'EXPENSE_RECORDED') return 'payments';
  return 'all';
}

function getStatusColor(status: string): {
  dot: string;
  pill: string;
  labelClass: string;
} {
  switch (status) {
    case 'success':
      return {
        dot: 'text-emerald-500',
        pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        labelClass: 'text-emerald-700',
      };
    case 'warning':
      return {
        dot: 'text-amber-500',
        pill: 'bg-amber-50 text-amber-800 border-amber-200',
        labelClass: 'text-amber-800',
      };
    case 'danger':
      return {
        dot: 'text-red-500',
        pill: 'bg-red-50 text-red-800 border-red-200',
        labelClass: 'text-red-800',
      };
    default:
      return {
        dot: 'text-slate-400',
        pill: 'bg-slate-50 text-slate-700 border-slate-200',
        labelClass: 'text-slate-700',
      };
  }
}

function getStatusPillLabel(type: string): string | null {
  const t = type.toUpperCase();
  if (t === 'TASK_CREATED' || t === 'TASK_ASSIGNED') return 'Pending';
  if (t === 'TASK_SUBMITTED') return 'Submitted';
  if (t === 'TASK_APPROVED') return 'Approved';
  if (t === 'TASK_REJECTED') return 'Rejected';
  if (t === 'PAYMENT_MARKED') return 'Paid';
  if (t === 'HARVEST_PAYMENT_BATCHED' || t === 'HARVEST_WALLET_DEDUCT') return 'Paid';
  if (t === 'INVENTORY_RESTOCK') return 'Restocked';
  if (t === 'INVENTORY_USAGE') return 'Used';
  if (t === 'EXPENSE_RECORDED') return 'Recorded';
  return null;
}

function formatTimeAgo(date: Date | null, clientCreatedAt: number | null): string {
  const base = date ?? (clientCreatedAt ? new Date(clientCreatedAt) : null);
  if (!base) return 'Just now';
  const diffMs = Date.now() - base.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function OperationsSnapshot({ className }: OperationsSnapshotProps) {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SnapshotFilter>('all');
  const [logs, setLogs] = useState<ActivityLogDoc[]>([]);

  useEffect(() => {
    const companyId = user?.companyId ?? null;
    if (!companyId) return;

    const unsubscribe = subscribeActivity(companyId, { limit: 30 }, (items) => {
      setLogs(items);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user?.companyId]);

  const filteredLogs = useMemo(() => {
    const subset =
      filter === 'all'
        ? logs
        : logs.filter((log) => {
            const bucket = getFilterForType(log.type);
            return bucket === filter;
          });
    return subset.slice(0, 15);
  }, [logs, filter]);

  const activeProjectId = activeProject?.id ?? null;

  const displayLogs = useMemo(() => {
    if (!activeProjectId) return filteredLogs;
    // When a project is selected, bias towards that project but still show others.
    const projectLogs = filteredLogs.filter((l) => l.projectId === activeProjectId);
    const otherLogs = filteredLogs.filter((l) => l.projectId !== activeProjectId);
    return [...projectLogs, ...otherLogs].slice(0, 15);
  }, [filteredLogs, activeProjectId]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-amber-50/80 via-background to-emerald-50/70 p-3 sm:p-4 shadow-sm',
        'backdrop-blur-sm',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16)_0,transparent_55%)]" />

      <div className="relative flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground sm:text-base">
            Operations Snapshot
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
            Live updates from your farm operations
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
          <div className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 border border-border/40">
            {(['all', 'tasks', 'harvest', 'inventory', 'payments'] as SnapshotFilter[]).map(
              (key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] sm:text-[11px]',
                    'transition-colors',
                    filter === key
                      ? 'bg-emerald-600 text-emerald-50'
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {key === 'all'
                    ? 'All'
                    : key === 'tasks'
                    ? 'Tasks'
                    : key === 'harvest'
                    ? 'Harvest'
                    : key === 'inventory'
                    ? 'Inventory'
                    : 'Payments'}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="relative mt-3 space-y-1.5">
        {displayLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground sm:text-xs">
            No recent operations yet. As you log tasks, harvest, inventory, and payments, they will
            appear here.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {displayLogs.map((log) => {
              const colors = getStatusColor(log.status);
              const pillLabel = getStatusPillLabel(log.type);
              const timeAgo = formatTimeAgo(log.createdAt, log.clientCreatedAt);
              const lineTwoParts = [
                timeAgo,
                log.actorName ? `by ${log.actorName}` : null,
                log.projectName ? `Project: ${log.projectName}` : null,
              ].filter(Boolean);

              const isSuccess = log.status === 'success';
              const isWarning = log.status === 'warning';
              const isDanger = log.status === 'danger';

              let IconComp: React.ComponentType<{ className?: string }> = Info;
              if (isSuccess) IconComp = CheckCircle2;
              else if (isWarning || isDanger) IconComp = AlertTriangle;

              return (
                <li key={log.id} className="flex items-start gap-2.5 py-1.5">
                  <div className="mt-1.5 flex h-4 w-4 items-center justify-center">
                    {isSuccess || isWarning || isDanger ? (
                      <IconComp className={cn('h-3.5 w-3.5', colors.dot)} />
                    ) : (
                      <Circle className={cn('h-2.5 w-2.5', colors.dot)} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-foreground sm:text-xs">
                      {log.message}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">
                      {lineTwoParts.join(' • ')}
                    </p>
                  </div>
                  {pillLabel ? (
                    <span
                      className={cn(
                        'ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium sm:text-[11px]',
                        colors.pill,
                      )}
                    >
                      {pillLabel}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="relative mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => navigate('/operations')}
          className="text-[11px] sm:text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
        >
          View all
        </button>
      </div>
    </div>
  );
}

