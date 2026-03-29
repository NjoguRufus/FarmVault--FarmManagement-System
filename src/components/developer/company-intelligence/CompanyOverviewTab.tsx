import React, { useMemo } from 'react';
import { HeartPulse } from 'lucide-react';
import type { CompanyFarmIntelligencePayload } from '@/services/developerCompanyIntelligenceService';
import { EmptyStateBlock } from './EmptyStateBlock';
import { ActivityFeedItem, type ActivityFeedItemData } from './ActivityFeedItem';
import { formatDevDateShort, formatMoney, formatNumber } from './utils';

type Props = {
  data: CompanyFarmIntelligencePayload;
};

export function CompanyOverviewTab({ data }: Props) {
  const header = data.header ?? {};
  const metrics = data.metrics ?? {};
  const projects = (data.projects ?? []) as Record<string, unknown>[];
  const harvests = (data.harvests ?? []) as Record<string, unknown>[];
  const expenses = (data.expenses ?? []) as Record<string, unknown>[];
  const inventory = (data.inventory ?? []) as Record<string, unknown>[];
  const employees = (data.employees ?? []) as Record<string, unknown>[];
  const timeline = (data.timeline ?? []) as ActivityFeedItemData[];

  const activeProjects = useMemo(
    () => projects.filter((p) => String(p.status ?? '').toLowerCase() === 'active').length,
    [projects],
  );
  const completedProjects = useMemo(
    () => projects.filter((p) => String(p.status ?? '').toLowerCase() === 'completed').length,
    [projects],
  );

  const harvestQty = metrics.harvest_quantity_total;
  const expenseTotal = metrics.expenses_total;
  const usageScore = useMemo(() => {
    const signals = [
      Number(metrics.projects_total) > 0,
      Number(metrics.harvest_records_total) > 0,
      Number(metrics.expense_count) > 0,
      Number(metrics.inventory_items_total) > 0,
      Number(metrics.employees_total) > 0,
    ].filter(Boolean).length;
    if (signals >= 4) return { label: 'Strong adoption', tone: 'text-emerald-700 dark:text-emerald-300' };
    if (signals >= 2) return { label: 'Emerging usage', tone: 'text-amber-800 dark:text-amber-200' };
    return { label: 'Early / light usage', tone: 'text-muted-foreground' };
  }, [metrics]);

  const recentTimeline = timeline.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-card/30 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">Company summary</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {String(header.name ?? 'This farm')}{' '}
          is using{' '}
          <span className="font-medium text-foreground">{formatNumber(metrics.projects_total)}</span> projects,{' '}
          <span className="font-medium text-foreground">{formatNumber(metrics.harvest_records_total)}</span> harvest
          records, and{' '}
          <span className="font-medium text-foreground">{formatNumber(metrics.expense_count)}</span> expense entries.
          Inventory holds{' '}
          <span className="font-medium text-foreground">{formatNumber(metrics.inventory_items_total)}</span> items with{' '}
          <span className="font-medium text-foreground">{formatNumber(metrics.employees_total)}</span> employees on
          file.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="flex items-center gap-2">
            <HeartPulse className={`h-4 w-4 ${usageScore.tone}`} />
            <h3 className="text-sm font-semibold">Usage health</h3>
          </div>
          <p className={`mt-2 text-lg font-medium ${usageScore.tone}`}>{usageScore.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Heuristic from modules with data — not a billing or compliance score.
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/30 p-4">
          <h3 className="text-sm font-semibold">Quick stats</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex justify-between gap-2">
              <span>Active projects</span>
              <span className="font-medium text-foreground">{formatNumber(activeProjects)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Completed projects</span>
              <span className="font-medium text-foreground">{formatNumber(completedProjects)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Harvest qty (sum)</span>
              <span className="font-medium text-foreground">{formatNumber(harvestQty, 2)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>Expense total</span>
              <span className="font-medium text-foreground">{formatMoney(expenseTotal)}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewBlock title="Recent activity" empty={recentTimeline.length === 0}>
          <div className="divide-y divide-border/40">
            {recentTimeline.map((ev, i) => (
              <ActivityFeedItem key={`${ev.at}-${i}`} item={ev} />
            ))}
          </div>
        </PreviewBlock>
        <PreviewBlock title="Projects snapshot" empty={projects.length === 0}>
          <ul className="space-y-2 text-sm">
            {projects.slice(0, 5).map((p) => (
              <li key={String(p.id)} className="flex justify-between gap-2 border-b border-border/30 pb-2 last:border-0">
                <span className="truncate font-medium text-foreground">{String(p.name ?? '—')}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{String(p.status ?? '')}</span>
              </li>
            ))}
          </ul>
        </PreviewBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniSummary title="Harvest" value={formatNumber(metrics.harvest_records_total)} sub={formatMoney(metrics.harvest_revenue_total)} />
        <MiniSummary title="Expenses" value={formatMoney(metrics.expenses_total)} sub={`${formatNumber(metrics.expense_count)} records`} />
        <MiniSummary title="Inventory" value={formatNumber(metrics.inventory_items_total)} sub={`${formatNumber(metrics.inventory_low_stock)} low`} />
        <MiniSummary title="Employees" value={formatNumber(metrics.employees_total)} sub={`${formatNumber(metrics.users_total)} users`} />
      </div>

      {(harvests.length === 0 && expenses.length === 0 && inventory.length === 0 && employees.length === 0) && (
        <EmptyStateBlock
          title="Sparse workspace"
          description="This tenant has little operational data yet. Check subscription status and onboarding timing."
        />
      )}
    </div>
  );
}

function PreviewBlock({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {empty ? (
        <EmptyStateBlock title="Nothing recent" description="Data will appear as the farm uses FarmVault." className="mt-3 border-none bg-transparent py-8" />
      ) : (
        <div className="mt-2 max-h-72 overflow-y-auto pr-1">{children}</div>
      )}
    </div>
  );
}

function MiniSummary({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
