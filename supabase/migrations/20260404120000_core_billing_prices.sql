-- Canonical checkout amounts for Basic/Pro × billing cycle. Editable by platform developers; consumed by
-- tenant billing UI, STK edge function, and public.expected_subscription_amount_kes().

begin;

create table if not exists core.billing_prices (
  id uuid primary key default gen_random_uuid(),
  plan text not null,
  cycle text not null,
  amount numeric not null,
  currency text not null default 'KES',
  updated_at timestamptz not null default now(),
  constraint billing_prices_plan_check check (plan in ('basic', 'pro')),
  constraint billing_prices_cycle_check check (cycle in ('monthly', 'seasonal', 'annual')),
  constraint billing_prices_amount_non_negative check (amount >= 0),
  unique (plan, cycle)
);

comment on table core.billing_prices is 'Subscription checkout prices (KES) per plan/cycle; source of truth for UI + STK + manual payment validation.';

grant usage on schema core to authenticated;
grant select, insert, update on table core.billing_prices to authenticated;

alter table core.billing_prices enable row level security;

drop policy if exists billing_prices_select_authenticated on core.billing_prices;
create policy billing_prices_select_authenticated
  on core.billing_prices
  for select
  to authenticated
  using (true);

drop policy if exists billing_prices_write_developer on core.billing_prices;
drop policy if exists billing_prices_insert_developer on core.billing_prices;
drop policy if exists billing_prices_update_developer on core.billing_prices;

create policy billing_prices_insert_developer
  on core.billing_prices
  for insert
  to authenticated
  with check (public.is_developer());

create policy billing_prices_update_developer
  on core.billing_prices
  for update
  to authenticated
  using (public.is_developer())
  with check (public.is_developer());

-- Seed: legacy catalog (Basic 2500/8500/24000, Pro 5000/14000/48000 per product spec).
insert into core.billing_prices (plan, cycle, amount, currency) values
  ('basic', 'monthly', 2500, 'KES'),
  ('basic', 'seasonal', 8500, 'KES'),
  ('basic', 'annual', 24000, 'KES'),
  ('pro', 'monthly', 5000, 'KES'),
  ('pro', 'seasonal', 14000, 'KES'),
  ('pro', 'annual', 48000, 'KES')
on conflict (plan, cycle) do nothing;

-- Realtime: tenant billing modal + dev console react without reload.
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table core.billing_prices;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$do$;

-- Manual payment RPC: read expected amount from this table (was hard-coded).
create or replace function public.expected_subscription_amount_kes(_plan_code text, _billing_cycle text)
returns numeric
language sql
stable
set search_path = core, public
as $$
  select bp.amount::numeric
  from core.billing_prices bp
  where bp.plan = lower(trim(coalesce(_plan_code, '')))
    and bp.cycle = lower(trim(coalesce(_billing_cycle, '')))
  limit 1;
$$;

commit;
