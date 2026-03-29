import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDateShort, formatMoney, formatNumber } from './utils';
import { cn } from '@/lib/utils';

type Row = Record<string, unknown>;

type Props = {
  projects: Row[];
};

export function CompanyProjectsTab({ projects }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const { active, completed, draft } = useMemo(() => {
    let a = 0;
    let c = 0;
    let d = 0;
    for (const p of projects) {
      const s = String(p.status ?? '').toLowerCase();
      if (s === 'active') a += 1;
      else if (s === 'completed') c += 1;
      else d += 1;
    }
    return { active: a, completed: c, draft: d };
  }, [projects]);

  if (!projects.length) {
    return <EmptyStateBlock title="No projects yet" description="This company has not created farm projects in FarmVault." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatPill label="Total" value={formatNumber(projects.length)} />
        <StatPill label="Active" value={formatNumber(active)} />
        <StatPill label="Completed / other" value={`${completed} / ${draft}`} />
      </div>

      <div className="fv-card overflow-x-auto">
        <table className="fv-table-mobile w-full min-w-[720px] text-sm">
          <thead className="border-b border-border/60 text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-left font-medium w-8" />
              <th className="py-2 text-left font-medium">Project</th>
              <th className="py-2 text-left font-medium">Crop</th>
              <th className="py-2 text-left font-medium">Location</th>
              <th className="py-2 text-left font-medium">Status</th>
              <th className="py-2 text-left font-medium">Start</th>
              <th className="py-2 text-right font-medium">Budget</th>
              <th className="py-2 text-right font-medium">Spend</th>
              <th className="py-2 text-right font-medium">Staff</th>
              <th className="py-2 text-right font-medium">Harvests</th>
              <th className="py-2 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const id = String(p.id ?? '');
              const open = openId === id;
              const pool = p.budget_pool_id ? 'Pool' : 'Project';
              return (
                <React.Fragment key={id}>
                  <tr className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        aria-expanded={open}
                        onClick={() => setOpenId((cur) => (cur === id ? null : id))}
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="py-2 font-medium text-foreground max-w-[160px] truncate" title={String(p.name ?? '')}>
                      {String(p.name ?? '—')}
                    </td>
                    <td className="py-2 text-muted-foreground">{String(p.crop_type ?? '—')}</td>
                    <td className="py-2 text-muted-foreground max-w-[140px] truncate" title={String(p.location_notes ?? '')}>
                      {String(p.location_notes ?? '—')}
                    </td>
                    <td className="py-2">
                      <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-xs">{String(p.status ?? '—')}</span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{formatDevDateShort(p.start_date as string)}</td>
                    <td className="py-2 text-right tabular-nums">
                      <div>{formatMoney(p.allocated_budget)}</div>
                      <div className="text-[10px] text-muted-foreground">{pool}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(p.actual_spend)}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(p.employees_assigned_count)}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(p.harvest_count)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{formatDevDateShort(p.updated_at as string)}</td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-border/40 bg-muted/15">
                      <td colSpan={11} className="px-4 py-3">
                        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                          <Detail k="Project ID" v={id} mono />
                          <Detail k="Environment" v={String(p.environment ?? '—')} />
                          <Detail k="Budget pool ID" v={p.budget_pool_id ? String(p.budget_pool_id) : '—'} mono />
                          <Detail k="Created" v={formatDevDateShort(p.created_at as string)} />
                          <Detail k="Notes / location" v={String(p.location_notes ?? '—')} />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function Detail({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase text-muted-foreground">{k}</p>
      <p className={cn('text-sm text-foreground', mono && 'font-mono text-xs break-all')}>{v}</p>
    </div>
  );
}
