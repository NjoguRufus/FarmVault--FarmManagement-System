import React from 'react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDate, formatDevDateShort, formatMoney } from './utils';

type Row = Record<string, unknown>;

type Props = {
  header: Record<string, unknown> | undefined;
  payments: Row[];
};

export function CompanySubscriptionTab({ header, payments }: Props) {
  const sub = (header?.subscription as Record<string, unknown> | undefined) ?? {};

  const hasSub =
    sub &&
    Object.keys(sub).length > 0 &&
    (sub.status != null || sub.plan_id != null || sub.plan_code != null);

  return (
    <div className="space-y-6">
      {!hasSub ? (
        <EmptyStateBlock title="No subscription row" description="This company may still be in onboarding or lack a subscription record." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2 text-sm">
            <h3 className="text-sm font-semibold">Current plan</h3>
            <RowKV k="Plan" v={String(sub.plan_code ?? sub.plan_id ?? sub.plan ?? '—')} />
            <RowKV k="Status" v={String(sub.status ?? '—')} />
            <RowKV k="Trial" v={sub.is_trial === true ? 'Yes' : 'No'} />
            <RowKV k="Trial ends" v={formatDevDateShort(sub.trial_ends_at as string)} />
            <RowKV k="Active until" v={formatDevDateShort((sub.active_until ?? sub.current_period_end) as string)} />
            <RowKV k="Billing mode" v={String(sub.billing_mode ?? '—')} />
            <RowKV k="Billing cycle" v={String(sub.billing_cycle ?? '—')} />
            <RowKV k="Updated" v={formatDevDate(sub.updated_at as string)} />
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2 text-sm">
            <h3 className="text-sm font-semibold">Overrides & notes</h3>
            <RowKV k="Override reason" v={String(sub.override_reason ?? '—')} />
            <RowKV k="Override by" v={String(sub.override_by ?? '—')} />
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Override JSON</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] font-mono">
                {sub.override != null ? JSON.stringify(sub.override, null, 2) : '—'}
              </pre>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Subscription payments</h3>
        {!payments.length ? (
          <EmptyStateBlock title="No payment submissions" className="py-10" />
        ) : (
          <div className="fv-card overflow-x-auto">
            <table className="fv-table-mobile w-full min-w-[720px] text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">Submitted</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                  <th className="py-2 text-left font-medium">Plan</th>
                  <th className="py-2 text-left font-medium">Cycle</th>
                  <th className="py-2 text-left font-medium">M-Pesa</th>
                  <th className="py-2 text-left font-medium">Code</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={String(p.id)} className="border-b border-border/40">
                    <td className="py-2 text-xs">{formatDevDate((p.submitted_at ?? p.created_at) as string)}</td>
                    <td className="py-2 text-xs">{String(p.status ?? '—')}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(p.amount, String(p.currency ?? 'KES'))}</td>
                    <td className="py-2 text-xs">{String(p.plan_id ?? '—')}</td>
                    <td className="py-2 text-xs">{String(p.billing_cycle ?? '—')}</td>
                    <td className="py-2 text-xs max-w-[120px] truncate">{String(p.mpesa_name ?? '—')}</td>
                    <td className="py-2 font-mono text-[11px]">{String(p.transaction_code ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right text-foreground">{v}</span>
    </div>
  );
}
