import { supabase } from '@/lib/supabase';

export type SystemHealthSeverity = 'critical' | 'warning';

export type SystemHealthIssue = {
  type: string;
  count: number;
  message: string;
  severity?: string;
};

export type SystemHealthMetrics = {
  stuck_payments: number;
  orphan_payments: number;
  failed_callbacks: number;
  manual_pending_over_1h: number;
  pipeline_active_24h: boolean;
};

export type SystemHealthSnapshot = {
  status: 'ok' | 'warning' | 'critical';
  issues: SystemHealthIssue[];
  metrics: SystemHealthMetrics;
  checked_at: string | null;
};

export type SystemHealthLogRow = {
  id: string;
  check_type: string;
  status: string;
  message: string | null;
  metadata: unknown;
  created_at: string;
};

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  return v === true;
}

export function parseSystemHealthPayload(raw: unknown): SystemHealthSnapshot {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const st = typeof o.status === 'string' ? o.status.toLowerCase() : 'ok';
  const status =
    st === 'critical' ? 'critical' : st === 'warning' ? 'warning' : 'ok';

  const issuesRaw = o.issues;
  const issues: SystemHealthIssue[] = [];
  if (Array.isArray(issuesRaw)) {
    for (const it of issuesRaw) {
      if (!it || typeof it !== 'object') continue;
      const r = it as Record<string, unknown>;
      issues.push({
        type: typeof r.type === 'string' ? r.type : 'unknown',
        count: num(r.count),
        message: typeof r.message === 'string' ? r.message : '',
        severity: typeof r.severity === 'string' ? r.severity : undefined,
      });
    }
  }

  const m = o.metrics && typeof o.metrics === 'object' && !Array.isArray(o.metrics)
    ? (o.metrics as Record<string, unknown>)
    : {};

  const metrics: SystemHealthMetrics = {
    stuck_payments: num(m.stuck_payments),
    orphan_payments: num(m.orphan_payments),
    failed_callbacks: num(m.failed_callbacks),
    manual_pending_over_1h: num(m.manual_pending_over_1h),
    pipeline_active_24h: bool(m.pipeline_active_24h),
  };

  let checked_at: string | null = null;
  if (o.checked_at !== undefined && o.checked_at !== null) {
    if (typeof o.checked_at === 'string') checked_at = o.checked_at;
    else if (typeof o.checked_at === 'object' && o.checked_at !== null && 'value' in (o.checked_at as object)) {
      checked_at = String((o.checked_at as { value?: string }).value ?? '');
    }
  }

  return { status, issues, metrics, checked_at };
}

/** Read-only snapshot (no new log row). Developer-only via RPC gate. */
export async function fetchSystemHealthSnapshot(): Promise<SystemHealthSnapshot> {
  const { data, error } = await supabase.rpc('system_health_evaluate', { p_write_log: false });
  if (error) {
    throw new Error(error.message ?? 'Failed to evaluate system health');
  }
  return parseSystemHealthPayload(data);
}

export async function fetchSystemHealthLogs(limit = 20): Promise<SystemHealthLogRow[]> {
  const { data, error } = await supabase
    .from('system_health_logs')
    .select('id, check_type, status, message, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? 'Failed to load system health logs');
  }
  return (data ?? []) as SystemHealthLogRow[];
}

export function overallTone(status: SystemHealthSnapshot['status']): 'healthy' | 'warning' | 'critical' {
  if (status === 'critical') return 'critical';
  if (status === 'warning') return 'warning';
  return 'healthy';
}
