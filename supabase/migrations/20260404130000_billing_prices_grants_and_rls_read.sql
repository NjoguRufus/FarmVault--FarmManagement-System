-- Fix "permission denied for table billing_prices": ensure schema USAGE + SELECT grants, and RLS that allows
-- reads for any role with SELECT on the table while restricting writes to platform developers.

begin;

-- Schema: without USAGE on core, PostgREST returns permission denied even when RLS would allow.
grant usage on schema core to anon, authenticated;

-- Table: explicit SELECT for anon + authenticated (pricing is non-secret; anon read fixes mis-tagged JWTs).
grant select on table core.billing_prices to anon, authenticated;
grant insert, update on table core.billing_prices to authenticated;

alter table core.billing_prices enable row level security;

-- Drop legacy policy names from 20260404120000
drop policy if exists billing_prices_select_authenticated on core.billing_prices;
drop policy if exists billing_prices_insert_developer on core.billing_prices;
drop policy if exists billing_prices_update_developer on core.billing_prices;
drop policy if exists billing_prices_write_developer on core.billing_prices;

-- User-requested / doc names (idempotent)
drop policy if exists "read pricing" on core.billing_prices;
drop policy if exists "update pricing admin" on core.billing_prices;

-- SELECT: any role that holds SELECT on the table may read all rows (anon + authenticated).
create policy "read pricing"
  on core.billing_prices
  for select
  using (true);

-- core.profiles has no role column in FarmVault; use platform developer gate (admin.developers).
create policy "update pricing admin"
  on core.billing_prices
  for update
  to authenticated
  using (public.is_developer())
  with check (public.is_developer());

-- Upsert needs INSERT as well as UPDATE
create policy "insert pricing admin"
  on core.billing_prices
  for insert
  to authenticated
  with check (public.is_developer());

notify pgrst, 'reload schema';

commit;
