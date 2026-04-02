begin;

-- Ambassadors, referrals, and commissions (public program).
-- uuid-ossp is created in the base schema; keep IF NOT EXISTS for fresh branches.
create extension if not exists "uuid-ossp";

-- =========================
-- Ambassadors
-- =========================
create table if not exists public.ambassadors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  email text,
  type text not null default 'agrovet'
    check (type in ('agrovet', 'farmer', 'company')),
  referral_code text unique,
  referred_by uuid references public.ambassadors (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================
-- Referrals
-- =========================
create table if not exists public.referrals (
  id uuid primary key default uuid_generate_v4(),
  referrer_id uuid references public.ambassadors (id) on delete cascade,
  referred_user_id uuid not null,
  referred_user_type text not null
    check (referred_user_type in ('farmer', 'company', 'ambassador')),
  level int not null default 1,
  created_at timestamptz not null default now()
);

-- =========================
-- Commissions
-- =========================
create table if not exists public.commissions (
  id uuid primary key default uuid_generate_v4(),
  referrer_id uuid references public.ambassadors (id),
  user_id uuid,
  amount numeric not null default 0,
  type text not null check (type in ('signup', 'monthly', 'ambassador_bonus')),
  status text not null default 'owed' check (status in ('owed', 'paid')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ambassadors_referral_code on public.ambassadors (referral_code);
create index if not exists idx_referrals_referrer on public.referrals (referrer_id);
create index if not exists idx_commissions_referrer on public.commissions (referrer_id);

-- =========================
-- Referral code generator
-- =========================
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  code := upper(substr(md5(random()::text), 1, 6));
  return code;
end;
$$;

-- =========================
-- Auto assign referral code on insert
-- =========================
create or replace function public.set_ambassador_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_set_referral_code on public.ambassadors;
create trigger trigger_set_referral_code
before insert on public.ambassadors
for each row
execute procedure public.set_ambassador_referral_code();

-- =========================
-- Resolve parent ambassador by code (for public signup; bypasses RLS)
-- =========================
create or replace function public.get_ambassador_id_by_referral_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;
  select a.id
  into v_id
  from public.ambassadors a
  where upper(trim(a.referral_code)) = upper(trim(p_code))
    and a.is_active = true
  limit 1;
  return v_id;
end;
$$;

revoke all on function public.get_ambassador_id_by_referral_code(text) from public;
grant execute on function public.get_ambassador_id_by_referral_code(text) to anon, authenticated;

-- =========================
-- RLS
-- =========================
alter table public.ambassadors enable row level security;
alter table public.referrals enable row level security;
alter table public.commissions enable row level security;

drop policy if exists ambassadors_insert_public on public.ambassadors;
create policy ambassadors_insert_public on public.ambassadors
  for insert
  to anon, authenticated
  with check (true);

-- Referrals / commissions: no client policies; use service role or future RPCs.

commit;
