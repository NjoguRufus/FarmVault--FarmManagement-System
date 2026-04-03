/**
 * Server-side checkout amounts (KES) — must stay aligned with `src/config/plans.ts`.
 */

export type CheckoutPlanCode = "basic" | "pro";
export type CheckoutBillingCycle = "monthly" | "seasonal" | "annual";

const AMOUNTS: Record<CheckoutPlanCode, Record<CheckoutBillingCycle, number>> = {
  basic: {
    monthly: 2500,
    seasonal: 8500,
    annual: 24000,
  },
  pro: {
    monthly: 5000,
    seasonal: 15000,
    annual: 48000,
  },
};

export function resolveCheckoutAmountKes(
  plan: CheckoutPlanCode,
  cycle: CheckoutBillingCycle,
): number | null {
  return AMOUNTS[plan]?.[cycle] ?? null;
}
