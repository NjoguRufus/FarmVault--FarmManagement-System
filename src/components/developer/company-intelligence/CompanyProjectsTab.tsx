import React, { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDateShort, formatMoney, formatNumber } from './utils';
import { Button } from '@/components/ui/button';
import { DeveloperProjectDetailsSheet } from './DeveloperProjectDetailsSheet';

type Row = Record<string, unknown>;

type Props = {
  companyId: string;
  projects: Row[];
};

export function CompanyProjectsTab({ companyId, projects }: Props) {
  const [selected, setSelected] = useState<Row | null>(null);

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

  const selectedId = selected ? String(selected.id ?? '') : '';

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
              <th className="py-2 text-right font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const id = String(p.id ?? '');
              const pool = p.budget_pool_id ? 'Pool' : 'Project';
              return (
                <tr key={id} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="py-2 font-medium text-foreground max-w-[180px] truncate" title={String(p.name ?? '')}>
                      {String(p.name ?? '—')}
                  </td>
                  <td className="py-2 text-muted-foreground">{String(p.crop_type ?? '—')}</td>
                  <td className="py-2 text-muted-foreground max-w-[160px] truncate" title={String(p.location_notes ?? '')}>
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
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2 text-xs"
                      onClick={() => setSelected(p)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DeveloperProjectDetailsSheet
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        companyId={companyId}
        projectId={selectedId}
        summary={selected}
      />
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
