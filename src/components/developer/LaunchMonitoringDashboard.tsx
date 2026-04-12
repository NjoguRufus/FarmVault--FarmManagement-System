import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLaunchMetrics } from '@/hooks/developer/useLaunchMetrics';
import {
  launchMetricTone,
  type LaunchHealthTone,
  type LaunchMonitoringMetrics,
} from '@/services/launchMonitoringService';
import { useAuth } from '@/contexts/AuthContext';

type MetricDef = {
  id: keyof LaunchMonitoringMetrics;
  title: string;
  subtitle?: string;
  detailHref?: string;
  detailLabel?: string;
};

const SECTIONS: { heading: string; metrics: MetricDef[] }[] = [
  {
    heading: 'Payments health',
    metrics: [
      {
        id: 'pending_stk_payments',
        title: 'Pending STK payments',
        subtitle: 'All time · mpesa_payments = PENDING',
        detailHref: '/developer/billing-confirmation',
        detailLabel: 'Billing console',
      },
      {
        id: 'failed_payments_24h',
        title: 'Failed STK (24h)',
        subtitle: 'mpesa_payments = FAILED',
        detailHref: '/developer/billing-confirmation',
        detailLabel: 'Billing console',
      },
      {
        id: 'successful_payments_24h',
        title: 'Successful STK (24h)',
        subtitle: 'mpesa_payments = SUCCESS',
        detailHref: '/developer/billing-confirmation',
        detailLabel: 'Billing console',
      },
      {
        id: 'orphan_stk_callbacks',
        title: 'Orphan STK callbacks',
        subtitle: 'Callbacks with no matching mpesa_payments row',
        detailHref: '/developer/billing-confirmation',
        detailLabel: 'Billing console',
      },
      {
        id: 'pending_manual_approvals',
        title: 'Pending manual approvals',
        subtitle: 'subscription_payments · pending_verification',
        detailHref: '/developer/billing-confirmation',
        detailLabel: 'Billing console',
      },
    ],
  },
  {
    heading: 'System errors',
    metrics: [
      {
        id: 'payment_webhook_failures_24h',
        title: 'Payment webhook failures (24h)',
        subtitle: 'payment_webhook_failures',
        detailHref: '/developer/code-red',
        detailLabel: 'Code Red',
      },
      {
        id: 'reconciliation_errors_24h',
        title: 'Reconciliation issues (24h)',
        subtitle: 'payment_reconciliation_log · action_taken ILIKE %error%',
        detailHref: '/developer/code-red',
        detailLabel: 'Code Red',
      },
    ],
  },
  {
    heading: 'Data integrity',
    metrics: [
      {
        id: 'duplicate_transaction_codes_24h',
        title: 'Duplicate transaction codes (24h)',
        subtitle: 'Distinct M-Pesa codes appearing more than once',
        detailHref: '/developer/billing-confirmation',
        detailLabel: 'Billing console',
      },
      {
        id: 'stuck_pending_stk_over_10m',
        title: 'Stuck pending STK (>10 min)',
        subtitle: 'PENDING and created_at older than 10 minutes',
        detailHref: '/developer/billing-confirmation',
        detailLabel: 'Billing console',
      },
    ],
  },
  {
    heading: 'User activity',
    metrics: [
      {
        id: 'active_companies_projects_24h',
        title: 'Active companies (projects)',
        subtitle: 'Distinct company_id on projects updated in 24h',
        detailHref: '/developer/companies',
        detailLabel: 'Companies',
      },
      {
        id: 'new_companies_24h',
        title: 'New companies (24h)',
        subtitle: 'core.companies created in 24h',
        detailHref: '/developer/companies',
        detailLabel: 'Companies',
      },
    ],
  },
];

function toneClasses(tone: LaunchHealthTone): { card: string; value: string; bar: string } {
  switch (tone) {
    case 'critical':
      return {
        card: 'border-red-500/45 bg-red-500/[0.06]',
        value: 'text-red-700 dark:text-red-300',
        bar: 'bg-red-500',
      };
    case 'warning':
      return {
        card: 'border-amber-500/45 bg-amber-500/[0.07]',
        value: 'text-amber-800 dark:text-amber-200',
        bar: 'bg-amber-500',
      };
    default:
      return {
        card: 'border-emerald-500/35 bg-emerald-500/[0.05]',
        value: 'text-emerald-800 dark:text-emerald-200',
        bar: 'bg-emerald-500',
      };
  }
}

function MetricCard({
  title,
  subtitle,
  value,
  tone,
  detailHref,
  detailLabel,
  loading,
}: {
  title: string;
  subtitle?: string;
  value: number;
  tone: LaunchHealthTone;
  detailHref?: string;
  detailLabel?: string;
  loading: boolean;
}) {
  const t = toneClasses(tone);

  return (
    <div className={cn('fv-card relative overflow-hidden border', t.card)}>
      <div className={cn('absolute left-0 top-0 h-full w-1', t.bar)} aria-hidden />
      <div className="space-y-2 pl-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          {subtitle ? <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitle}</p> : null}
        </div>
        <p className={cn('font-heading text-3xl font-bold tabular-nums tracking-tight', t.value)}>
          {loading ? '—' : value.toLocaleString()}
        </p>
        {detailHref && detailLabel ? (
          <Link
            to={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {detailLabel}
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function LaunchMonitoringDashboard() {
  const { isDeveloper } = useAuth();
  const { data, isLoading, isFetching, error, refetch, isError } = useLaunchMetrics({
    enabled: isDeveloper === true,
  });

  const metrics = data ?? null;

  const cards = useMemo(() => {
    return SECTIONS.map((section) => ({
      heading: section.heading,
      items: section.metrics.map((m) => ({
        ...m,
        value: metrics ? metrics[m.id] : 0,
        tone: metrics ? launchMetricTone(m.id, metrics[m.id]) : ('healthy' as LaunchHealthTone),
      })),
    }));
  }, [metrics]);

  if (!isDeveloper) return null;

  return (
    <section className="space-y-4" aria-label="Launch monitoring dashboard">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Launch Monitoring Dashboard</h2>
          <p className="text-xs text-muted-foreground max-w-prose">
            Read-only platform pulse for launch week. Refreshes automatically about every 45 seconds; use refresh for
            an immediate pull.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 self-start sm:self-auto"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Refresh metrics
        </Button>
      </div>

      {isError && (
        <div className="fv-card border-destructive/40 bg-destructive/5 text-destructive text-sm">
          {(error as Error)?.message ?? 'Failed to load launch metrics. Deploy migration dev_launch_monitoring_metrics.'}
        </div>
      )}

      {!isError &&
        cards.map((section) => (
          <div key={section.heading} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.heading}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.items.map((item) => (
                <MetricCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  value={item.value}
                  tone={item.tone}
                  detailHref={item.detailHref}
                  detailLabel={item.detailLabel}
                  loading={isLoading && !metrics}
                />
              ))}
            </div>
          </div>
        ))}
    </section>
  );
}
