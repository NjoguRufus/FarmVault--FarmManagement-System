import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthedSupabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  BILLING_PRICES_QUERY_KEY,
  type BillingPriceCycle,
  type BillingPricePlan,
  type BillingPriceRow,
  fetchBillingPrices,
  upsertBillingPrice,
} from '@/services/billingPricesService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type ClerkTokenFn = () => Promise<string | null>;

function computeSeasonalFromMonthly(monthly: number): number {
  return Math.round(monthly * 4 * 0.9);
}

function computeAnnualFromMonthly(monthly: number): number {
  return Math.round(monthly * 12 * 0.8);
}

function cellKey(plan: BillingPricePlan, cycle: BillingPriceCycle): string {
  return `${plan}:${cycle}`;
}

function getMonthlyFromRows(rows: BillingPriceRow[] | undefined, plan: BillingPricePlan): number {
  return rows?.find((r) => r.plan === plan && r.cycle === 'monthly')?.amount ?? 0;
}

function mergeBillingUpdatesIntoRows(
  oldRows: BillingPriceRow[] | undefined,
  updates: Array<{ plan: BillingPricePlan; cycle: BillingPriceCycle; amount: number }>,
): BillingPriceRow[] {
  const map = new Map<string, BillingPriceRow>();
  for (const r of oldRows ?? []) {
    map.set(cellKey(r.plan, r.cycle), r);
  }
  const now = new Date().toISOString();
  for (const u of updates) {
    const key = cellKey(u.plan, u.cycle);
    const existing = map.get(key);
    map.set(key, {
      id: existing?.id ?? `temp-${key}`,
      plan: u.plan,
      cycle: u.cycle,
      amount: u.amount,
      currency: existing?.currency ?? 'KES',
      updated_at: now,
    });
  }
  return Array.from(map.values());
}

function MonthlyDraftCell({
  plan,
  committedAmount,
  disabled,
  onDraftChange,
  className,
}: {
  plan: BillingPricePlan;
  committedAmount: number;
  disabled: boolean;
  onDraftChange: (plan: BillingPricePlan, amount: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(committedAmount));

  useEffect(() => {
    setText(String(committedAmount));
  }, [committedAmount]);

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">Monthly</Label>
      <Input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        className="h-9 font-mono text-sm"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const n = Math.round(Number(v.replace(/[^\d.-]/g, '')));
          if (Number.isFinite(n) && n >= 0) {
            onDraftChange(plan, n);
          }
        }}
        onBlur={() => {
          const n = Math.round(Number(String(text).replace(/[^\d.-]/g, '')));
          if (Number.isFinite(n) && n >= 0) {
            setText(String(n));
            onDraftChange(plan, n);
          } else {
            setText(String(committedAmount));
          }
        }}
      />
    </div>
  );
}

function ReadOnlyDerivedCell({
  label,
  amount,
  className,
}: {
  label: string;
  amount: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        readOnly
        tabIndex={-1}
        className="h-9 cursor-not-allowed bg-muted/40 font-mono text-sm text-muted-foreground"
        value={String(amount)}
      />
    </div>
  );
}

export function DeveloperBillingPricingControl({
  getAccessToken,
  enabled,
  embeddedInDialog = false,
}: {
  getAccessToken: ClerkTokenFn;
  enabled: boolean;
  /** When true, omit outer card and title (use inside a dialog with its own header). */
  embeddedInDialog?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rows, isLoading, error } = useQuery({
    queryKey: BILLING_PRICES_QUERY_KEY,
    queryFn: async () => {
      const client = await getAuthedSupabase(getAccessToken);
      return fetchBillingPrices(client);
    },
    enabled,
    staleTime: 15_000,
  });

  const [draftMonthly, setDraftMonthly] = useState<{ basic: number; pro: number }>({ basic: 0, pro: 0 });
  const [userEdited, setUserEdited] = useState(false);

  useEffect(() => {
    if (!rows) return;
    if (userEdited) return;
    setDraftMonthly({
      basic: getMonthlyFromRows(rows, 'basic'),
      pro: getMonthlyFromRows(rows, 'pro'),
    });
  }, [rows, userEdited]);

  const amountByKey = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      m.set(cellKey(r.plan, r.cycle), r.amount);
    }
    amountByKey.current = m;
  }, [rows]);

  const hasUnsavedChanges = useMemo(() => {
    if (!rows) return false;
    return (
      draftMonthly.basic !== getMonthlyFromRows(rows, 'basic') ||
      draftMonthly.pro !== getMonthlyFromRows(rows, 'pro')
    );
  }, [rows, draftMonthly]);

  const mutation = useMutation({
    mutationFn: async (input: Array<{ plan: BillingPricePlan; cycle: BillingPriceCycle; amount: number }>) => {
      const client = await getAuthedSupabase(getAccessToken);
      await Promise.all(input.map((item) => upsertBillingPrice(client, item)));
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: BILLING_PRICES_QUERY_KEY });
      const previousRows = queryClient.getQueryData(BILLING_PRICES_QUERY_KEY);

      queryClient.setQueryData(BILLING_PRICES_QUERY_KEY, (oldRows: unknown) => {
        const old = Array.isArray(oldRows) ? (oldRows as BillingPriceRow[]) : undefined;
        return mergeBillingUpdatesIntoRows(old, input);
      });

      for (const item of input) {
        amountByKey.current.set(cellKey(item.plan, item.cycle), item.amount);
      }

      return { previousRows };
    },
    onSuccess: async () => {
      setUserEdited(false);
      await queryClient.invalidateQueries({ queryKey: BILLING_PRICES_QUERY_KEY });
      toast({
        title: 'Prices saved',
        description: 'Billing page, landing, and other views will refresh shortly.',
      });
    },
    onError: (e: Error, _input, context) => {
      if (context?.previousRows !== undefined) {
        queryClient.setQueryData(BILLING_PRICES_QUERY_KEY, context.previousRows);
      }
      amountByKey.current = new Map();
      const previousRows = context?.previousRows;
      if (Array.isArray(previousRows)) {
        for (const row of previousRows) {
          if (!row || typeof row !== 'object') continue;
          const record = row as Record<string, unknown>;
          const plan = record.plan;
          const cycle = record.cycle;
          const amount = Number(record.amount);
          if (
            (plan === 'basic' || plan === 'pro') &&
            (cycle === 'monthly' || cycle === 'seasonal' || cycle === 'annual') &&
            Number.isFinite(amount)
          ) {
            amountByKey.current.set(cellKey(plan, cycle), amount);
          }
        }
      }
      toast({
        variant: 'destructive',
        title: 'Could not save price',
        description: e.message ?? 'Try again.',
      });
    },
  });

  const handleDraftMonthly = useCallback((plan: BillingPricePlan, amount: number) => {
    setUserEdited(true);
    const monthly = Math.max(0, Math.round(amount));
    setDraftMonthly((prev) => ({ ...prev, [plan]: monthly }));
  }, []);

  const handleSave = useCallback(() => {
    const plans: BillingPricePlan[] = ['basic', 'pro'];
    const updates: Array<{ plan: BillingPricePlan; cycle: BillingPriceCycle; amount: number }> = [];
    for (const plan of plans) {
      const monthly = Math.max(0, Math.round(draftMonthly[plan]));
      updates.push(
        { plan, cycle: 'monthly', amount: monthly },
        { plan, cycle: 'seasonal', amount: computeSeasonalFromMonthly(monthly) },
        { plan, cycle: 'annual', amount: computeAnnualFromMonthly(monthly) },
      );
    }
    mutation.mutate(updates);
  }, [draftMonthly, mutation]);

  const plans: BillingPricePlan[] = ['basic', 'pro'];
  const cycles: BillingPriceCycle[] = ['monthly', 'seasonal', 'annual'];

  if (!enabled) return null;

  const saveDisabled =
    isLoading || mutation.isPending || !hasUnsavedChanges;

  const body = (
    <>
      {error ? (
        <p className="text-sm text-destructive">{(error as Error).message ?? 'Failed to load prices.'}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Edit monthly amounts, then save. Seasonal and annual are derived automatically. Updates apply everywhere
          prices are shown (billing, landing, checkout) via Supabase Realtime and cache refresh.
        </p>
        <Button type="button" size="sm" onClick={handleSave} disabled={saveDisabled} className="shrink-0">
          {mutation.isPending ? 'Saving…' : 'Save prices'}
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan} className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{plan === 'basic' ? 'Basic' : 'Pro'}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {cycles.map((cycle) => {
                if (cycle === 'monthly') {
                  return (
                    <MonthlyDraftCell
                      key={cycle}
                      plan={plan}
                      committedAmount={draftMonthly[plan]}
                      disabled={isLoading}
                      onDraftChange={handleDraftMonthly}
                    />
                  );
                }
                const derived =
                  cycle === 'seasonal'
                    ? computeSeasonalFromMonthly(draftMonthly[plan])
                    : computeAnnualFromMonthly(draftMonthly[plan]);
                return (
                  <ReadOnlyDerivedCell
                    key={cycle}
                    label={cycle === 'seasonal' ? 'Seasonal' : 'Annual'}
                    amount={derived}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isLoading ? <p className="text-xs text-muted-foreground">Loading prices…</p> : null}
    </>
  );

  if (embeddedInDialog) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <section className="fv-card space-y-4 border-dashed border-primary/25 bg-primary/[0.03]">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Pricing control</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Basic and Pro checkout amounts (KES). Saves when you click Save prices. Live-updates company billing modals
          via Supabase Realtime — no reload.
        </p>
      </div>
      {body}
    </section>
  );
}
