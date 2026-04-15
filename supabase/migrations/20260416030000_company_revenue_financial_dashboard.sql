begin;

create table if not exists public.company_revenue (
  id uuid primary key default gen_random_uuid(),
  user_id text default core.current_user_id(),
  source text not null,
  amount numeric(12,2) not null check (amount > 0),
  plan text,
  customer_id uuid,
  receipt_number text not null,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint company_revenue_receipt_number_key unique (receipt_number)
);

create index if not exists idx_company_revenue_date_desc
  on public.company_revenue (date desc);

create index if not exists idx_company_revenue_source
  on public.company_revenue (source);

create index if not exists idx_company_revenue_plan
  on public.company_revenue (plan);

create index if not exists idx_company_revenue_user_id
  on public.company_revenue (user_id);

create index if not exists idx_company_revenue_created_at_desc
  on public.company_revenue (created_at desc);

alter table public.company_revenue enable row level security;

drop policy if exists company_revenue_select_owner on public.company_revenue;
create policy company_revenue_select_owner
on public.company_revenue
for select
to authenticated
using (public.is_developer() or coalesce(user_id::text, '') = core.current_user_id());

drop policy if exists company_revenue_insert_owner on public.company_revenue;
create policy company_revenue_insert_owner
on public.company_revenue
for insert
to authenticated
with check (public.is_developer() or coalesce(user_id::text, '') = core.current_user_id());

drop policy if exists company_revenue_update_owner on public.company_revenue;
create policy company_revenue_update_owner
on public.company_revenue
for update
to authenticated
using (public.is_developer() or coalesce(user_id::text, '') = core.current_user_id())
with check (public.is_developer() or coalesce(user_id::text, '') = core.current_user_id());

drop policy if exists company_revenue_delete_owner on public.company_revenue;
create policy company_revenue_delete_owner
on public.company_revenue
for delete
to authenticated
using (public.is_developer() or coalesce(user_id::text, '') = core.current_user_id());

grant select, insert, update, delete on public.company_revenue to authenticated;

create or replace function public.record_company_revenue(
  p_user_id text,
  p_source text,
  p_amount numeric,
  p_plan text default null,
  p_customer_id uuid default null,
  p_receipt_number text default null,
  p_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt text;
  v_id uuid;
begin
  if coalesce(trim(p_source), '') = '' then
    raise exception 'Revenue source is required';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Revenue amount must be greater than zero';
  end if;

  v_receipt := nullif(trim(coalesce(p_receipt_number, '')), '');
  if v_receipt is null then
    v_receipt := format('auto:%s:%s', lower(trim(p_source)), gen_random_uuid()::text);
  end if;

  insert into public.company_revenue (
    user_id,
    source,
    amount,
    plan,
    customer_id,
    receipt_number,
    date
  )
  values (
    coalesce(nullif(trim(p_user_id), ''), core.current_user_id()),
    lower(trim(p_source)),
    round(p_amount, 2),
    nullif(trim(coalesce(p_plan, '')), ''),
    p_customer_id,
    v_receipt,
    coalesce(p_date, current_date)
  )
  on conflict (receipt_number)
  do update set
    amount = excluded.amount,
    source = excluded.source,
    plan = excluded.plan,
    customer_id = excluded.customer_id,
    date = excluded.date
  returning id into v_id;

  return v_id;
end;
$$;

commit;

notify pgrst, 'reload schema';
