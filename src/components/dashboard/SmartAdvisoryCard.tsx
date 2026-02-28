import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';
import {
  subscribeActivity,
  type ActivityLogDoc,
} from '@/services/activityLogService';
import {
  buildSmartAdvisoryCardSummary,
  type BuildSmartAdvisoryCardSummaryParams,
} from '@/utils/advisoryEngine';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'farmvault_smart_advisory_visible';
const MODAL_LIMIT = 15;

function getStoredVisible(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function isToday(date: Date | null, clientCreatedAt: number | null): boolean {
  const d = date ?? (clientCreatedAt ? new Date(clientCreatedAt) : null);
  if (!d) return false;
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export interface SmartAdvisoryCardProps {
  /** Current project name for label */
  projectName?: string | null;
  /** Current project id for activity filter (optional) */
  projectId?: string | null;
  /** Number of pending/overdue tasks */
  pendingTasksCount?: number;
  /** Stage is nearing end */
  stageNearingEnd?: boolean;
  /** Recent expenses trend is high */
  expensesRising?: boolean;
  /** Harvest is active */
  harvestActive?: boolean;
  /** openField | greenhouse */
  environment?: 'openField' | 'greenhouse';
  /** Activity logs from parent (when provided, no internal subscription) */
  activityLogs?: ActivityLogDoc[];
  className?: string;
}

export function SmartAdvisoryCard({
  projectName,
  projectId,
  pendingTasksCount = 0,
  stageNearingEnd = false,
  expensesRising = false,
  harvestActive = false,
  environment = 'openField',
  activityLogs: activityLogsProp,
  className,
}: SmartAdvisoryCardProps) {
  const { user } = useAuth();
  const { isOnline } = useConnectivityStatus();
  const [internalLogs, setInternalLogs] = useState<ActivityLogDoc[]>([]);
  const [visible, setVisible] = useState(getStoredVisible);

  const companyId = user?.companyId ?? null;
  const logs = activityLogsProp ?? internalLogs;

  const handleVisibleChange = (on: boolean) => {
    setVisible(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
    } catch {}
  };

  useEffect(() => {
    if (activityLogsProp != null || !companyId) return;
    const unsubscribe = subscribeActivity(
      companyId,
      { limit: MODAL_LIMIT, projectId: projectId ?? undefined },
      setInternalLogs
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [companyId, projectId, activityLogsProp]);

  const hasActivityToday = useMemo(
    () => logs.some((l) => isToday(l.createdAt, l.clientCreatedAt)),
    [logs]
  );

  const summaryParams: BuildSmartAdvisoryCardSummaryParams = useMemo(
    () => ({
      hasActivityToday,
      pendingTasksCount,
      stageNearingEnd,
      expensesRising,
      harvestActive,
      environment,
    }),
    [
      hasActivityToday,
      pendingTasksCount,
      stageNearingEnd,
      expensesRising,
      harvestActive,
      environment,
    ]
  );

  const summary = useMemo(
    () => buildSmartAdvisoryCardSummary(summaryParams),
    [summaryParams]
  );

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/60 bg-card shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]',
        'bg-gradient-to-br from-stone-50/80 via-background to-slate-50/50 dark:from-stone-950/40 dark:via-background dark:to-slate-950/30',
        visible ? 'p-4 sm:p-5' : 'px-4 py-2.5',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(16,185,129,0.03)_100%)]" />
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-emerald-500/40 to-emerald-500/10 rounded-l-lg" />

      {/* Top row: title, Live badge, project label, switch */}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground sm:text-base truncate">
            Smart Advisory
          </h3>
          {visible && (
            <>
              <span className="rounded-md bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0 border border-emerald-500/20">
                Live
              </span>
              {projectName ? (
                <p className="text-[10px] text-muted-foreground sm:text-xs truncate max-w-[140px] hidden sm:block">
                  {projectName}
                </p>
              ) : null}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap font-medium">
            {visible ? 'On' : 'Off'}
          </span>
          <Switch checked={visible} onCheckedChange={handleVisibleChange} aria-label="Show Smart Advisory" />
        </div>
      </div>

      {!visible && (
        <p className="relative mt-1.5 text-[11px] text-muted-foreground/90">
          Toggle on to see advisory.
        </p>
      )}

      {visible && (
        <>
          {!isOnline && (
            <p className="relative mt-2 text-[11px] text-amber-700/90 dark:text-amber-400/90">
              Offline · syncing later
            </p>
          )}

          {/* Advisory panel */}
          <div className="relative mt-4">
            <p className="font-semibold text-foreground text-sm sm:text-base tracking-tight">
              {summary.headline}
            </p>
            <p className="mt-1.5 text-[12px] sm:text-sm text-foreground/85 leading-relaxed max-w-xl">
              {summary.body}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/90">
              Why: {summary.why}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
