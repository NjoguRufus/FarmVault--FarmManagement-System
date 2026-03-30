import React, { useMemo, useState } from 'react';
import { Briefcase, Eye, Phone, UserRound } from 'lucide-react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDateShort, formatNumber } from './utils';
import { Button } from '@/components/ui/button';
import { DeveloperRecordDetailsSheet } from './DeveloperRecordDetailsSheet';

type Row = Record<string, unknown>;

type Props = {
  employees: Row[];
  metrics: Record<string, unknown> | undefined;
};

export function CompanyEmployeesTab({ employees, metrics }: Props) {
  const [selected, setSelected] = useState<Row | null>(null);

  const roles = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) {
      const r = String(e.role ?? 'unknown');
      m.set(r, (m.get(r) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [employees]);

  const active = useMemo(
    () => employees.filter((e) => String(e.status ?? '').toLowerCase() === 'active').length,
    [employees],
  );

  if (!employees.length) {
    return (
      <EmptyStateBlock
        title="No employees"
        description="Workforce profiles will show here after the farm adds employees."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total" value={formatNumber(metrics?.employees_total)} />
        <Stat label="Active (status)" value={formatNumber(active)} />
        <Stat label="Distinct roles" value={formatNumber(roles.length)} />
      </div>

      {roles.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/30 p-4">
          <h3 className="text-sm font-semibold">Roles</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map(([role, cnt]) => (
              <span key={role} className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs">
                {role}{' '}
                <span className="text-muted-foreground">({cnt})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="fv-card overflow-x-auto">
        <table className="fv-table-mobile w-full min-w-[640px] text-sm">
          <thead className="border-b border-border/60 text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-left font-medium">Name</th>
              <th className="py-2 text-left font-medium">Role</th>
              <th className="py-2 text-left font-medium">Phone</th>
              <th className="py-2 text-right font-medium">Projects</th>
              <th className="py-2 text-left font-medium">Status</th>
              <th className="py-2 text-left font-medium">Added</th>
              <th className="py-2 text-right font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={String(e.id)} className="border-b border-border/40">
                <td className="py-2 font-medium">{String(e.display_name ?? '—')}</td>
                <td className="py-2 text-xs text-muted-foreground">{String(e.role ?? '—')}</td>
                <td className="py-2 text-xs">{String(e.phone ?? '—')}</td>
                <td className="py-2 text-right tabular-nums">{formatNumber(e.assigned_projects_count)}</td>
                <td className="py-2 text-xs">{String(e.status ?? '—')}</td>
                <td className="py-2 text-xs text-muted-foreground">{formatDevDateShort(e.created_at as string)}</td>
                <td className="py-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={() => setSelected(e)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeveloperRecordDetailsSheet
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        title={String(selected?.display_name ?? 'Employee')}
        description="Employee inspection (read-only)."
        recordId={selected ? String(selected.id ?? '') : null}
        sections={[
          {
            title: 'Employee',
            items: [
              { label: 'Name', value: <Inline icon={<UserRound className="h-4 w-4" />} value={String(selected?.display_name ?? '—')} /> },
              { label: 'Role', value: <Inline icon={<Briefcase className="h-4 w-4" />} value={String(selected?.role ?? '—')} /> },
              { label: 'Phone', value: <Inline icon={<Phone className="h-4 w-4" />} value={String(selected?.phone ?? '—')} /> },
              { label: 'Status', value: String(selected?.status ?? '—') },
            ],
          },
          {
            title: 'Work context',
            items: [
              { label: 'Assigned projects', value: formatNumber(selected?.assigned_projects_count) },
              { label: 'Linked project/work', value: String(selected?.project_name ?? selected?.project ?? '—') },
              { label: 'Attendance', value: String(selected?.attendance ?? '—') },
              { label: 'Payments', value: String(selected?.payment_info ?? selected?.payment ?? '—') },
              { label: 'Added', value: formatDevDateShort(selected?.created_at as string) },
            ],
          },
        ]}
        raw={selected ?? undefined}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Inline({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">{value}</span>
    </span>
  );
}
