import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyStateBlock } from './EmptyStateBlock';
import { formatDevDate, formatDevDateShort, formatMoney } from './utils';
import { computeSubscriptionStatus, subscriptionStatusBadgeClass } from '@/lib/subscription/subscriptionStatus';
import { computeSubscriptionVisibility, subscriptionVisibilityBadgeClass, formatPlanLabel } from '@/lib/subscription/subscriptionVisibility';
import { computeCompanySubscriptionState } from '@/features/billing/lib/computeCompanySubscriptionState';
import { extendCompanyTrial, updateCompanySubscriptionState } from '@/services/developerAdminService';
import { useNow } from '@/hooks/useNow';

type Row = Record<string, unknown>;

type Props = {
  companyId: string;
  header: Record<string, unknown> | undefined;
  payments: Row[];
};

function normalizePlanCode(v: unknown): 'basic' | 'pro' | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'basic') return 'basic';
  if (s === 'pro' || s === 'professional') return 'pro';
  return null;
}

function isSuspendedCompany(header: Record<string, unknown> | undefined): boolean {
  const company = (header?.company as Record<string, unknown> | undefined) ?? {};
  const status = String(company.status ?? '').trim().toLowerCase();
  if (status === 'suspended') return true;
  const sub = (header?.subscription as Record<string, unknown> | undefined) ?? {};
  return String(sub.status ?? '').trim().toLowerCase() === 'suspended';
}

export function CompanySubscriptionTab({ companyId, header, payments }: Props) {
  const sub = (header?.subscription as Record<string, unknown> | undefined) ?? {};
  const company = (header?.company as Record<string, unknown> | undefined) ?? {};
  const queryClient = useQueryClient();
  const now = useNow(60_000);
  const [extendDays, setExtendDays] = useState<7 | 14 | 30>(7);

  const hasSub =
    sub &&
    Object.keys(sub).length > 0 &&
    (sub.status != null || sub.plan_id != null || sub.plan_code != null);

  const computed = useMemo(() => {
    return computeSubscriptionStatus({
      trialEnd: (sub.trial_ends_at as string | null | undefined) ?? (sub.trial_end as string | null | undefined),
      activeUntil: (sub.active_until as string | null | undefined) ?? (sub.current_period_end as string | null | undefined),
      isSuspended: isSuspendedCompany(header),
      planCode: (sub.plan_code as string | null | undefined) ?? (sub.plan_id as string | null | undefined) ?? (sub.plan as string | null | undefined),
    }, now);
  }, [header, sub, now]);

  const visibility = useMemo(() => {
    const planCode =
      (sub.plan_code as string | null | undefined) ??
      (sub.plan_id as string | null | undefined) ??
      (sub.plan as string | null | undefined);
    return computeSubscriptionVisibility(
      {
        planCode,
        trialStartsAt: (sub.trial_starts_at as string | null | undefined) ?? (sub.trial_started_at as string | null | undefined),
        trialEndsAt: (sub.trial_ends_at as string | null | undefined) ?? (sub.trial_end as string | null | undefined),
        activeUntil: (sub.active_until as string | null | undefined) ?? (sub.current_period_end as string | null | undefined),
        isTrial: (sub.is_trial as boolean | null | undefined) ?? null,
        subscriptionStatus: (sub.status as string | null | undefined) ?? null,
        isSuspended: isSuspendedCompany(header),
      },
      now,
    );
  }, [header, sub, now]);

  const derived = useMemo(() => {
    const latestPayment = payments?.[0] as Record<string, unknown> | undefined;
    return computeCompanySubscriptionState(
      {
        companyStatus: (company.status as string | null | undefined) ?? null,
        planCode:
          (sub.plan_code as string | null | undefined) ??
          (sub.plan_id as string | null | undefined) ??
          (sub.plan as string | null | undefined) ??
          null,
        subscriptionStatus: (sub.status as string | null | undefined) ?? null,
        isTrial: (sub.is_trial as boolean | null | undefined) ?? null,
        trialStartsAt: (sub.trial_starts_at as string | null | undefined) ?? (sub.trial_started_at as string | null | undefined) ?? null,
        trialEndsAt: (sub.trial_ends_at as string | null | undefined) ?? (sub.trial_end as string | null | undefined) ?? null,
        activeUntil: (sub.active_until as string | null | undefined) ?? (sub.current_period_end as string | null | undefined) ?? null,
        latestPaymentStatus: (latestPayment?.status as string | null | undefined) ?? null,
      },
      now,
    );
  }, [company.status, now, payments, sub]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
    await queryClient.invalidateQueries({ queryKey: ['developer', 'subscription-analytics'] });
    await queryClient.invalidateQueries({ queryKey: ['developer', 'company-farm-intelligence', companyId] });
  };

  const extendTrialMutation = useMutation({
    mutationFn: (days: 7 | 14 | 30) =>
      extendCompanyTrial({ companyId, days, reason: 'Developer trial extension (company details)' }),
    onSuccess: invalidate,
  });

  const suspendMutation = useMutation({
    mutationFn: () =>
      updateCompanySubscriptionState({ companyId, action: 'suspend', reason: 'Suspended by developer (company details)' }),
    onSuccess: invalidate,
  });

  const setPlanMutation = useMutation({
    mutationFn: (planCode: 'basic' | 'pro') =>
      updateCompanySubscriptionState({ companyId, action: 'set_plan', planCode, reason: `Set plan to ${planCode} (company details)` }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      {!hasSub ? (
        <EmptyStateBlock title="No subscription row" description="This company may still be in onboarding or lack a subscription record." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2 text-sm lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Subscription</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={subscriptionVisibilityBadgeClass(visibility)}>
                  {visibility.displayLabel}
                </Badge>
                <Badge variant="outline" className={subscriptionStatusBadgeClass(computed)}>
                  {computed.label}
                </Badge>
              </div>
            </div>
            <RowKV k="Plan" v={formatPlanLabel(visibility.plan)} />
            <RowKV k="Access Source" v={derived.accessSource === 'trial' ? 'Trial' : 'Subscription'} />
            <RowKV
              k="Payment Status"
              v={derived.paymentStatus === 'unpaid' ? 'Unpaid' : derived.paymentStatus === 'pending_confirmation' ? 'Pending confirmation' : derived.paymentStatus === 'paid' ? 'Paid' : 'Rejected'}
            />
            <RowKV
              k="Access Status"
              v={visibility.accessStatus === 'suspended' ? 'Suspended' : visibility.accessStatus === 'active' ? 'Active' : 'Expired'}
            />
            <RowKV k="Trial start" v={formatDevDateShort((sub.trial_starts_at ?? sub.trial_started_at) as string)} />
            <RowKV k="Trial end" v={formatDevDateShort((sub.trial_ends_at ?? sub.trial_end) as string)} />
            <RowKV k="Active until / Paid until" v={formatDevDateShort((sub.active_until ?? sub.current_period_end) as string)} />
            <RowKV k="Payment required" v={derived.paymentRequired ? 'Yes' : 'No'} />
            <RowKV
              k="Days remaining"
              v={derived.daysRemaining == null ? '—' : `${derived.daysRemaining} day${derived.daysRemaining === 1 ? '' : 's'}`}
            />
            <RowKV k="Billing mode" v={String(sub.billing_mode ?? '—')} />
            <RowKV k="Billing cycle" v={String(sub.billing_cycle ?? '—')} />
            <RowKV k="Updated" v={formatDevDate(sub.updated_at as string)} />
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3 text-sm">
            <h3 className="text-sm font-semibold">Quick actions</h3>

            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Extend trial</p>
              <div className="flex flex-wrap gap-2">
                {[7, 14, 30].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={extendDays === d ? 'default' : 'outline'}
                    onClick={() => setExtendDays(d as 7 | 14 | 30)}
                    disabled={extendTrialMutation.isPending}
                  >
                    {d}d
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 min-w-[120px]"
                  onClick={() => extendTrialMutation.mutate(extendDays)}
                  disabled={extendTrialMutation.isPending}
                >
                  {extendTrialMutation.isPending ? 'Extending…' : 'Extend'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Set plan</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPlanMutation.mutate('basic')}
                  disabled={setPlanMutation.isPending}
                >
                  Basic
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPlanMutation.mutate('pro')}
                  disabled={setPlanMutation.isPending}
                >
                  Pro
                </Button>
              </div>
              {normalizePlanCode(sub.plan_code ?? sub.plan_id ?? sub.plan) == null && (
                <p className="text-[11px] text-muted-foreground">
                  Current plan is non-standard; setting plan will normalise it.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Suspend</p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="w-full"
                onClick={() => suspendMutation.mutate()}
                disabled={suspendMutation.isPending}
              >
                {suspendMutation.isPending ? 'Suspending…' : 'Suspend company'}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Suspended companies show as gray and are excluded from payment-required counts.
              </p>
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

      {hasSub && (
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
      )}
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
