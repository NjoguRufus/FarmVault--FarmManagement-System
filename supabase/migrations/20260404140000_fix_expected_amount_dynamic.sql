-- Migration: 20260404140000_fix_expected_amount_dynamic
-- Replace hardcoded CASE statement in expected_subscription_amount_kes()
-- with a live query against core.billing_prices.
--
-- Why: The previous implementation validated manual PayBill submission amounts
-- against hardcoded values, meaning any price update via the developer UI would
-- silently break manual payment validation (STK already used the live table).
-- Now both paths share a single source of truth.

CREATE OR REPLACE FUNCTION public.expected_subscription_amount_kes(
  _plan_code text,
  _billing_cycle text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT amount
  FROM core.billing_prices
  WHERE plan  = lower(coalesce(_plan_code, ''))
    AND cycle = lower(coalesce(_billing_cycle, ''))
  LIMIT 1;
$$;
