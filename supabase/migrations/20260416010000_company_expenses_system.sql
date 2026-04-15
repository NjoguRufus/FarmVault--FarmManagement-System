begin;

create table if not exists public.company_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  name text not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text,
  date date not null default current_date,
  notes text,
  source text not null default 'manual',
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_expenses_date_desc
  on public.company_expenses (date desc);

create index if not exists idx_company_expenses_category
  on public.company_expenses (category);

create index if not exists idx_company_expenses_source
  on public.company_expenses (source);

create index if not exists idx_company_expenses_payment_method
  on public.company_expenses (payment_method);

create index if not exists idx_company_expenses_user_id
  on public.company_expenses (user_id);

create unique index if not exists uq_company_expenses_source_reference
  on public.company_expenses (source, reference_id)
  where reference_id is not null;

alter table public.company_expenses enable row level security;

drop policy if exists company_expenses_select_owner_or_developer on public.company_expenses;
create policy company_expenses_select_owner_or_developer
on public.company_expenses
for select
to authenticated
using (
  public.is_developer()
  or user_id = auth.uid()
);

drop policy if exists company_expenses_insert_owner_or_developer on public.company_expenses;
create policy company_expenses_insert_owner_or_developer
on public.company_expenses
for insert
to authenticated
with check (
  public.is_developer()
  or user_id = auth.uid()
);

drop policy if exists company_expenses_update_owner_or_developer on public.company_expenses;
create policy company_expenses_update_owner_or_developer
on public.company_expenses
for update
to authenticated
using (
  public.is_developer()
  or user_id = auth.uid()
)
with check (
  public.is_developer()
  or user_id = auth.uid()
);

drop policy if exists company_expenses_delete_owner_or_developer on public.company_expenses;
create policy company_expenses_delete_owner_or_developer
on public.company_expenses
for delete
to authenticated
using (
  public.is_developer()
  or user_id = auth.uid()
);

grant select, insert, update, delete on public.company_expenses to authenticated;

create or replace function public.record_company_expense(
  p_user_id uuid,
  p_name text,
  p_category text,
  p_amount numeric,
  p_payment_method text default null,
  p_date date default current_date,
  p_notes text default null,
  p_source text default 'manual',
  p_reference_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Expense name is required';
  end if;
  if coalesce(trim(p_category), '') = '' then
    raise exception 'Expense category is required';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Expense amount must be greater than zero';
  end if;

  insert into public.company_expenses (
    user_id,
    name,
    category,
    amount,
    payment_method,
    date,
    notes,
    source,
    reference_id
  )
  values (
    coalesce(p_user_id, auth.uid()),
    trim(p_name),
    trim(p_category),
    round(p_amount, 2),
    nullif(trim(coalesce(p_payment_method, '')), ''),
    coalesce(p_date, current_date),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(nullif(trim(p_source), ''), 'manual'),
    p_reference_id
  )
  on conflict (source, reference_id)
  where reference_id is not null
  do update set
    name = excluded.name,
    category = excluded.category,
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    date = excluded.date,
    notes = excluded.notes,
    created_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.tg_ambassador_payout_to_company_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ambassador_name text;
begin
  if new.status <> 'paid' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'paid' then
    return new;
  end if;

  select coalesce(nullif(trim(a.name), ''), 'Ambassador')
  into v_ambassador_name
  from public.ambassadors a
  where a.id = new.ambassador_id;

  perform public.record_company_expense(
    p_user_id := auth.uid(),
    p_name := format('Ambassador Commission - %s', coalesce(v_ambassador_name, 'Ambassador')),
    p_category := 'Staff',
    p_amount := coalesce(new.amount, 0),
    p_payment_method := 'M-Pesa',
    p_date := current_date,
    p_notes := 'Auto-created from ambassador payout',
    p_source := 'ambassador_payout',
    p_reference_id := new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_ambassador_payout_to_company_expense on public.ambassador_withdrawals;
create trigger trg_ambassador_payout_to_company_expense
after insert or update of status
on public.ambassador_withdrawals
for each row
execute function public.tg_ambassador_payout_to_company_expense();

commit;

notify pgrst, 'reload schema';
