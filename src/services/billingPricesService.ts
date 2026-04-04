import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import { billingCycleDurationMonths } from '@/lib/billingPricing';

export const BILLING_PRICES_QUERY_KEY = ['billing-prices'] as const;

export type BillingPricePlan = 'basic' | 'pro';
export type BillingPriceCycle = 'monthly' | 'seasonal' | 'annual';

export interface BillingPriceRow {
  id: string;
  plan: BillingPricePlan;
  cycle: BillingPriceCycle;
  amount: number;
  currency: string;
  updated_at: string;
}

export type BillingPriceMatrix = Record<
  BillingPricePlan,
  Record<BillingPriceCycle, number | null>
>;

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePlan(raw: string): BillingPricePlan | null {
  const p = raw.trim().toLowerCase();
  if (p === 'basic' || p === 'pro') return p;
  return null;
}

function normalizeCycle(raw: string): BillingPriceCycle | null {
  const c = raw.trim().toLowerCase();
  if (c === 'monthly' || c === 'seasonal' || c === 'annual') return c;
  return null;
}

export function emptyBillingPriceMatrix(): BillingPriceMatrix {
  return {
    basic: { monthly: null, seasonal: null, annual: null },
    pro: { monthly: null, seasonal: null, annual: null },
  };
}

export function rowsToMatrix(rows: BillingPriceRow[] | null | undefined): BillingPriceMatrix {
  const m = emptyBillingPriceMatrix();
  if (!rows?.length) return m;
  for (const r of rows) {
    const plan = normalizePlan(String(r.plan));
    const cycle = normalizeCycle(String(r.cycle));
    if (!plan || !cycle) continue;
    m[plan][cycle] = toNum(r.amount);
  }
  return m;
}

export function getAmountFromMatrix(
  matrix: BillingPriceMatrix | null | undefined,
  plan: BillingSubmissionPlan,
  cycle: BillingSubmissionCycle,
): number | null {
  if (!matrix) return null;
  return matrix[plan][cycle];
}

/** Savings vs paying monthly for the same number of months (0 if unknown). */
export function computeBundleSavingsFromMatrix(
  matrix: BillingPriceMatrix,
  plan: BillingSubmissionPlan,
  cycle: BillingSubmissionCycle,
): number {
  if (cycle === 'monthly') return 0;
  const monthly = matrix[plan].monthly;
  const price = matrix[plan][cycle];
  if (monthly == null || price == null) return 0;
  const months = billingCycleDurationMonths(cycle);
  const baseline = monthly * months;
  return Math.max(0, Math.round(baseline - price));
}

function mapBillingPricesFetchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('permission denied') || m.includes('42501')) {
    return (
      'Could not load dynamic prices (database access). Using catalog prices until an admin applies billing_prices ' +
      'grants/RLS migrations. Details: ' +
      message
    );
  }
  return message;
}

/** Single row — returns null on error (caller may fall back to catalog). */
export async function getPlanPriceKes(
  client: SupabaseClient,
  plan: BillingSubmissionPlan,
  cycle: BillingSubmissionCycle,
): Promise<number | null> {
  const { data, error } = await client
    .schema('core')
    .from('billing_prices')
    .select('amount')
    .eq('plan', plan)
    .eq('cycle', cycle)
    .maybeSingle();
  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[getPlanPriceKes]', mapBillingPricesFetchError(error.message ?? ''));
    }
    return null;
  }
  return toNum((data as { amount?: unknown } | null)?.amount);
}

export async function fetchBillingPrices(client: SupabaseClient): Promise<BillingPriceRow[]> {
  const { data, error } = await client.schema('core').from('billing_prices').select('id, plan, cycle, amount, currency, updated_at');
  if (error) throw new Error(mapBillingPricesFetchError(error.message ?? 'Failed to load billing prices'));
  const out: BillingPriceRow[] = [];
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const plan = normalizePlan(String(row.plan ?? ''));
    const cycle = normalizeCycle(String(row.cycle ?? ''));
    if (!plan || !cycle) continue;
    const amount = toNum(row.amount);
    if (amount == null) continue;
    out.push({
      id: String(row.id ?? ''),
      plan,
      cycle,
      amount,
      currency: String(row.currency ?? 'KES'),
      updated_at: String(row.updated_at ?? ''),
    });
  }
  return out;
}

export async function upsertBillingPrice(
  client: SupabaseClient,
  input: { plan: BillingPricePlan; cycle: BillingPriceCycle; amount: number },
): Promise<void> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a non-negative number');
  }
  const { error } = await client
    .schema('core')
    .from('billing_prices')
    .upsert(
      {
        plan: input.plan,
        cycle: input.cycle,
        amount,
        currency: 'KES',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'plan,cycle' },
    );
  if (error) throw new Error(error.message ?? 'Failed to save price');
}
