import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthedSupabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  BILLING_PRICES_QUERY_KEY,
  type BillingPriceCycle,
  type BillingPricePlan,
  fetchBillingPrices,
  upsertBillingPrice,
} from '@/services/billingPricesService';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 450;

type ClerkTokenFn = () => Promise<string | null>;

function cellKey(plan: BillingPricePlan, cycle: BillingPriceCycle): string {
  return `${plan}:${cycle}`;
}

function PriceCell({
  plan,
  cycle,
  committedAmount,
  disabled,
  onCommit,
  className,
}: {
  plan: BillingPricePlan;
  cycle: BillingPriceCycle;
  committedAmount: number;
  disabled: boolean;
  onCommit: (plan: BillingPricePlan, cycle: BillingPriceCycle, amount: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(committedAmount));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(String(committedAmount));
  }, [committedAmount]);

  const scheduleCommit = useCallback(
    (raw: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const n = Math.round(Number(raw.replace(/[^\d.-]/g, '')));
        if (!Number.isFinite(n) || n < 0) return;
        onCommit(plan, cycle, n);
      }, DEBOUNCE_MS);
    },
    [cycle, onCommit, plan],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const label =
    cycle === 'monthly' ? 'Monthly' : cycle === 'seasonal' ? 'Seasonal' : 'Annual';

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        className="h-9 font-mono text-sm"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          scheduleCommit(v);
        }}
        onBlur={() => {
          const n = Math.round(Number(String(text).replace(/[^\d.-]/g, '')));
          if (Number.isFinite(n) && n >= 0) {
            setText(String(n));
            onCommit(plan, cycle, n);
          } else {
            setText(String(committedAmount));
          }
        }}
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

  const amountByKey = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      m.set(cellKey(r.plan, r.cycle), r.amount);
    }
    amountByKey.current = m;
  }, [rows]);

  const mutation = useMutation({
    mutationFn: async (input: { plan: BillingPricePlan; cycle: BillingPriceCycle; amount: number }) => {
      const client = await getAuthedSupabase(getAccessToken);
      await upsertBillingPrice(client, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BILLING_PRICES_QUERY_KEY });
    },
    onError: (e: Error) => {
      toast({
        variant: 'destructive',
        title: 'Could not save price',
        description: e.message ?? 'Try again.',
      });
    },
  });

  const handleCommit = useCallback(
    (plan: BillingPricePlan, cycle: BillingPriceCycle, amount: number) => {
      const prev = amountByKey.current.get(cellKey(plan, cycle));
      if (prev === amount) return;
      mutation.mutate({ plan, cycle, amount });
    },
    [mutation],
  );

  const plans: BillingPricePlan[] = ['basic', 'pro'];
  const cycles: BillingPriceCycle[] = ['monthly', 'seasonal', 'annual'];

  if (!enabled) return null;

  const body = (
    <>
      {error ? (
        <p className="text-sm text-destructive">{(error as Error).message ?? 'Failed to load prices.'}</p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan} className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{plan === 'basic' ? 'Basic' : 'Pro'}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {cycles.map((cycle) => {
                const row = rows?.find((r) => r.plan === plan && r.cycle === cycle);
                const amt = row?.amount ?? 0;
                return (
                  <PriceCell
                    key={cycle}
                    plan={plan}
                    cycle={cycle}
                    committedAmount={amt}
                    disabled={isLoading}
                    onCommit={handleCommit}
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
          Basic and Pro checkout amounts (KES). Saves on edit (debounced). Live-updates company billing modals via
          Supabase Realtime — no reload.
        </p>
      </div>
      {body}
    </section>
  );
}
