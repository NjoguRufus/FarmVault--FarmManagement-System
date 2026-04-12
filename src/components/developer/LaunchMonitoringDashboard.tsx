import React, { useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useRunSystemHealthCheck,
  useSystemHealthLogs,
  useSystemHealthSnapshot,
} from '@/hooks/developer/useSystemHealth';
import { overallTone, type SystemHealthIssue, type SystemHealthLogRow } from '@/services/systemHealthService';
import { useToast } from '@/hooks/use-toast';

function StatusPill({ tone }: { tone: 'healthy' | 'warning' | 'critical' }) {
  const cfg = {
    healthy: {
      label: 'OK',
      className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
      icon: CheckCircle2,
    },
    warning: {
      label: 'Warning',
      className: 'border-amber-500/45 bg-amber-500/10 text-amber-900 dark:text-amber-100',
      icon: AlertTriangle,
    },
    critical: {
      label: 'Critical',
      className: 'border-red-500/45 bg-red-500/10 text-red-800 dark:text-red-200',
      icon: AlertTriangle,
    },
  }[tone];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        cfg.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function MetricBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="fv-card space-y-1 border-border/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function IssuesList({ issues }: { issues: SystemHealthIssue[] }) {
  if (!issues.length) {
    return <p className="text-sm text-muted-foreground">No open issues detected for this snapshot.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {issues.map((i, idx) => (
        <li
          key={`${i.type}-${idx}`}
          className={cn(
            'rounded-lg border px-3 py-2',
            i.severity === 'critical'
              ? 'border-red-500/35 bg-red-500/[0.04]'
              : 'border-amber-500/35 bg-amber-500/[0.04]',
          )}
        >
          <span className="font-medium text-foreground">{i.type}</span>
          {i.count > 0 ? <span className="text-muted-foreground"> · {i.count.toLocaleString()}</span> : null}
          <p className="mt-0.5 text-muted-foreground">{i.message}</p>
        </li>
      ))}
    </ul>
  );
}

function LogTable({ rows }: { rows: SystemHealthLogRow[] }) {
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">No logged runs yet. Use “Run health check” or wait for cron.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 font-medium capitalize">{r.status}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.message ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LaunchMonitoringDashboard() {
  const { isDeveloper } = useAuth();
  const { toast } = useToast();
  const enabled = isDeveloper === true;

  const snapshotQ = useSystemHealthSnapshot({ enabled });
  const logsQ = useSystemHealthLogs(15, { enabled });
  const runMutation = useRunSystemHealthCheck();

  const tone = useMemo(() => {
    if (!snapshotQ.data) return 'healthy' as const;
    return overallTone(snapshotQ.data.status);
  }, [snapshotQ.data]);

  const handleRun = () => {
    runMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (!res.ok) {
          toast({ variant: 'destructive', title: 'Health check failed', description: res.detail ?? res.error });
          return;
        }
        toast({
          title: 'Health check complete',
          description: `Status: ${res.snapshot.status.toUpperCase()}${res.emailSent ? ' · Alert email sent' : ''}`,
        });
      },
      onError: (e: Error) => {
        toast({ variant: 'destructive', title: 'Health check failed', description: e.message });
      },
    });
  };

  if (!isDeveloper) return null;

  const snap = snapshotQ.data;
  const metrics = snap?.metrics;

  return (
    <section className="space-y-4" aria-label="Launch monitoring dashboard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Launch Monitoring Dashboard</h2>
          <p className="text-xs text-muted-foreground max-w-prose">
            Read-only payment pipeline checks. Logs append to <code className="text-[11px]">system_health_logs</code>.
            Alerts email on warning/critical via <code className="text-[11px]">send-farmvault-email</code> (cron or manual
            run).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="gap-2"
            onClick={() => handleRun()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run health check
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void snapshotQ.refetch()}
            disabled={snapshotQ.isFetching}
          >
            <RefreshCw className={cn('h-4 w-4', snapshotQ.isFetching && 'animate-spin')} />
            Refresh snapshot
          </Button>
        </div>
      </div>

      {snapshotQ.isError && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(snapshotQ.error as Error)?.message ??
            'Failed to load health snapshot. Apply migration system_health_logs_v1 and deploy system-health-check.'}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Current status</span>
        <StatusPill tone={tone} />
        {snap?.checked_at ? (
          <span className="text-[11px] text-muted-foreground">
            Checked {typeof snap.checked_at === 'string' ? new Date(snap.checked_at).toLocaleString() : '—'}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricBox
          label="Stuck payments"
          value={metrics?.stuck_payments?.toLocaleString() ?? '—'}
          sub="Pending &gt; 10 min"
        />
        <MetricBox
          label="Orphan payments"
          value={metrics?.orphan_payments?.toLocaleString() ?? '—'}
          sub="Paid, not activated"
        />
        <MetricBox
          label="Failed callbacks"
          value={metrics?.failed_callbacks?.toLocaleString() ?? '—'}
          sub="Unresolved webhook rows"
        />
        <MetricBox
          label="Manual stale"
          value={metrics?.manual_pending_over_1h?.toLocaleString() ?? '—'}
          sub="pending_verification &gt; 1h"
        />
      </div>

      <div className="fv-card space-y-2 border-border/60 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Pipeline activity (24h)
        </div>
        <p className="text-sm">
          {metrics === undefined
            ? '—'
            : metrics.pipeline_active_24h
              ? 'Receiving recent payment or callback events.'
              : 'No payment pipeline events in the last 24 hours (warning when historical data exists).'}
        </p>
      </div>

      <div className="fv-card space-y-3 border-border/60 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active issues</h3>
        {snapshotQ.isLoading && !snap ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <IssuesList issues={snap?.issues ?? []} />
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent log entries</h3>
        {logsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading logs…</p>
        ) : logsQ.isError ? (
          <p className="text-sm text-destructive">{(logsQ.error as Error).message}</p>
        ) : (
          <LogTable rows={logsQ.data ?? []} />
        )}
      </div>
    </section>
  );
}
