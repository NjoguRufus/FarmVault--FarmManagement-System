-- Migration: 20260404150000_fix_billing_prices_grants
-- Ensure authenticated and anon roles can read core.billing_prices.
--
-- Why: The Supabase client queries core.billing_prices as the authenticated
-- (or anon) role. Without explicit USAGE on the core schema and SELECT on the
-- table, the query is rejected with "permission denied" even when RLS allows it.
-- This migration is idempotent and safe to re-run.

-- 1. RLS must be on before policies take effect
ALTER TABLE core.billing_prices ENABLE ROW LEVEL SECURITY;

-- 2. Drop any previously created SELECT policies under old names so we have
--    exactly one clean policy going forward
DROP POLICY IF EXISTS "billing_prices_select"              ON core.billing_prices;
DROP POLICY IF EXISTS "Anyone can read billing prices"     ON core.billing_prices;
DROP POLICY IF EXISTS "authenticated_read_billing_prices"  ON core.billing_prices;
DROP POLICY IF EXISTS "read pricing"                       ON core.billing_prices;
DROP POLICY IF EXISTS "billing_prices_public_read"         ON core.billing_prices;

-- 3. Recreate SELECT policy — all authenticated and anon users may read
CREATE POLICY "billing_prices_public_read"
  ON core.billing_prices
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 4. Schema-level access — required for any query against a non-public schema
GRANT USAGE ON SCHEMA core TO authenticated;
GRANT USAGE ON SCHEMA core TO anon;

-- 5. Table-level access
GRANT SELECT ON core.billing_prices TO authenticated;
GRANT SELECT ON core.billing_prices TO anon;

-- 6. Service role needs full access for edge functions and callbacks
GRANT ALL ON core.billing_prices TO service_role;
