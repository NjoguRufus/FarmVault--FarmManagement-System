/**
 * Legacy static checkout amounts (KES). Production STK validation uses `core.billing_prices` in `mpesa-stk-push`.
 * Kept for tooling / docs; prefer DB-backed prices.
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
