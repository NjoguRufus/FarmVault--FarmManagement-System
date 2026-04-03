-- STK push payment tracking for real-time billing UI (written by mpesa-stk-push / mpesa-stk-callback).

begin;

create table if not exists public.mpesa_payments (
  id uuid primary key default gen_random_uuid(),
  checkout_request_id text unique,
  company_id uuid references core.companies (id) on delete set null,
  mpesa_receipt text,
  amount numeric,
  phone text,
  status text not null default 'PENDING',
  result_desc text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Table may already exist from an older script without company_id; CREATE TABLE IF NOT EXISTS skips columns.
alter table public.mpesa_payments
  add column if not exists company_id uuid references core.companies (id) on delete set null;

create index if not exists mpesa_payments_checkout_request_id_idx
  on public.mpesa_payments (checkout_request_id);

create index if not exists mpesa_payments_company_id_idx
  on public.mpesa_payments (company_id);

create index if not exists mpesa_payments_created_at_idx
  on public.mpesa_payments (created_at desc);

alter table public.mpesa_payments enable row level security;

alter table public.mpesa_payments replica identity full;

comment on table public.mpesa_payments is 'M-Pesa STK lifecycle for checkout_request_id (service_role writes; members read own company).';

-- Authenticated members (and developers) can read rows for realtime confirmation UI.
drop policy if exists mpesa_payments_select_member on public.mpesa_payments;

create policy mpesa_payments_select_member
  on public.mpesa_payments
  for select
  to authenticated
  using (
    public.is_developer()
    or (
      company_id is not null
      and public.row_company_matches_user(company_id::text)
    )
  );

grant select on table public.mpesa_payments to authenticated;
grant select, insert, update, delete on table public.mpesa_payments to service_role;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.mpesa_payments;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end
$pub$;

commit;
