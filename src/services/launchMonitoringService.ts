import { supabase } from '@/lib/supabase';

export type LaunchMonitoringMetrics = {
  pending_stk_payments: number;
  failed_payments_24h: number;
  successful_payments_24h: number;
  orphan_stk_callbacks: number;
  pending_manual_approvals: number;
  payment_webhook_failures_24h: number;
  reconciliation_errors_24h: number;
  duplicate_transaction_codes_24h: number;
  stuck_pending_stk_over_10m: number;
  active_companies_projects_24h: number;
  new_companies_24h: number;
};

type RpcRow = {
  pending_stk_payments: number | string | null;
  failed_payments_24h: number | string | null;
  successful_payments_24h: number | string | null;
  orphan_stk_callbacks: number | string | null;
  pending_manual_approvals: number | string | null;
  payment_webhook_failures_24h: number | string | null;
  reconciliation_errors_24h: number | string | null;
  duplicate_transaction_codes_24h: number | string | null;
  stuck_pending_stk_over_10m: number | string | null;
  active_companies_projects_24h: number | string | null;
  new_companies_24h: number | string | null;
};

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(row: RpcRow): LaunchMonitoringMetrics {
  return {
    pending_stk_payments: num(row.pending_stk_payments),
    failed_payments_24h: num(row.failed_payments_24h),
    successful_payments_24h: num(row.successful_payments_24h),
    orphan_stk_callbacks: num(row.orphan_stk_callbacks),
    pending_manual_approvals: num(row.pending_manual_approvals),
    payment_webhook_failures_24h: num(row.payment_webhook_failures_24h),
    reconciliation_errors_24h: num(row.reconciliation_errors_24h),
    duplicate_transaction_codes_24h: num(row.duplicate_transaction_codes_24h),
    stuck_pending_stk_over_10m: num(row.stuck_pending_stk_over_10m),
    active_companies_projects_24h: num(row.active_companies_projects_24h),
    new_companies_24h: num(row.new_companies_24h),
  };
}

export async function fetchLaunchMonitoringMetrics(): Promise<LaunchMonitoringMetrics> {
  const { data, error } = await supabase.rpc('dev_launch_monitoring_metrics');

  if (error) {
    throw new Error(error.message ?? 'Failed to load launch monitoring metrics');
  }

  const row = Array.isArray(data) ? (data[0] as RpcRow | undefined) : (data as RpcRow | null);
  if (!row || typeof row !== 'object') {
    throw new Error('Launch monitoring RPC returned no data');
  }

  return normalizeRow(row);
}

export type LaunchHealthTone = 'healthy' | 'warning' | 'critical';

/** UI-only thresholds for traffic-light cards (read-only metrics). */
export function launchMetricTone(
  metricId:
    | 'pending_stk_payments'
    | 'failed_payments_24h'
    | 'successful_payments_24h'
    | 'orphan_stk_callbacks'
    | 'pending_manual_approvals'
    | 'payment_webhook_failures_24h'
    | 'reconciliation_errors_24h'
    | 'duplicate_transaction_codes_24h'
    | 'stuck_pending_stk_over_10m'
    | 'active_companies_projects_24h'
    | 'new_companies_24h',
  value: number,
): LaunchHealthTone {
  const n = Math.max(0, Math.floor(value));

  switch (metricId) {
    case 'orphan_stk_callbacks':
    case 'stuck_pending_stk_over_10m':
    case 'duplicate_transaction_codes_24h':
      return n > 0 ? 'critical' : 'healthy';

    case 'failed_payments_24h':
      if (n === 0) return 'healthy';
      if (n <= 5) return 'warning';
      return 'critical';

    case 'pending_stk_payments':
      if (n <= 20) return 'healthy';
      return 'warning';

    case 'pending_manual_approvals':
      if (n === 0) return 'healthy';
      if (n <= 10) return 'warning';
      return 'critical';

    case 'payment_webhook_failures_24h':
      if (n === 0) return 'healthy';
      if (n <= 5) return 'warning';
      return 'critical';

    case 'reconciliation_errors_24h':
      if (n === 0) return 'healthy';
      return 'warning';

    case 'successful_payments_24h':
    case 'active_companies_projects_24h':
    case 'new_companies_24h':
      return 'healthy';

    default:
      return 'healthy';
  }
}
