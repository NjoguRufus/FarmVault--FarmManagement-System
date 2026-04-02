begin;

-- Developer-facing referral analytics (views + RLS for is_developer + realtime).

-- =========================
-- Views
-- =========================

create or replace view public.dev_global_referral_stats as
select
  (select count(*)::bigint from public.ambassadors) as total_ambassadors,
  (select count(*)::bigint from public.ambassadors a where a.is_active) as active_ambassadors,
  (select count(*)::bigint from public.ambassadors a where not a.is_active) as inactive_ambassadors;

comment on view public.dev_global_referral_stats is 'Single-row ambassador counts for developer referral dashboard.';

create or replace view public.dev_referral_conversion as
select
  a.id,
  a.name,
  a.type,
  a.referral_code,
  coalesce(rstats.total_referrals, 0)::bigint as total_referrals,
  coalesce(rstats.active_referrals, 0)::bigint as active_referrals,
  coalesce(rstats.inactive_referrals, 0)::bigint as inactive_referrals,
  case
    when coalesce(rstats.total_referrals, 0) = 0 then 0::numeric
    else round(
      (coalesce(rstats.active_referrals, 0)::numeric / rstats.total_referrals::numeric) * 100,
      2
    )
  end as conversion_rate,
  coalesce(cstats.total_volume, 0)::numeric as total_earned,
  coalesce(cstats.owed, 0)::numeric as owed,
  coalesce(cstats.paid, 0)::numeric as paid
from public.ambassadors a
left join lateral (
  select
    count(*)::bigint as total_referrals,
    count(*) filter (where coalesce(r.is_active, true))::bigint as active_referrals,
    count(*) filter (where not coalesce(r.is_active, true))::bigint as inactive_referrals
  from public.referrals r
  where r.referrer_id = a.id
) rstats on true
left join lateral (
  select
    coalesce(sum(c.amount), 0) as total_volume,
    coalesce(sum(c.amount) filter (where c.status = 'owed'), 0) as owed,
    coalesce(sum(c.amount) filter (where c.status = 'paid'), 0) as paid
  from public.commissions c
  where c.referrer_id = a.id
) cstats on true;

comment on view public.dev_referral_conversion is 'Per-ambassador referral funnel + commission totals for developer dashboard.';

create or replace view public.dev_referrer_details as
select
  r.referrer_id,
  r.id as referral_id,
  r.referred_user_id,
  r.referred_user_type,
  r.level,
  coalesce(r.is_active, true) as is_active,
  r.created_at,
  case
    when r.referred_user_type = 'ambassador' then ref_a.name
    else null::text
  end as referred_name
from public.referrals r
left join public.ambassadors ref_a
  on ref_a.id = r.referred_user_id
 and r.referred_user_type = 'ambassador';

comment on view public.dev_referrer_details is 'Referred users per referrer (for developer detail page).';

create or replace view public.dev_commission_breakdown as
select
  c.id as commission_id,
  c.referrer_id,
  c.user_id,
  c.amount,
  c.type as commission_type,
  c.status,
  c.created_at
from public.commissions c;

comment on view public.dev_commission_breakdown is 'Line-level commissions for developer detail page.';

grant select on public.dev_global_referral_stats to authenticated;
grant select on public.dev_referral_conversion to authenticated;
grant select on public.dev_referrer_details to authenticated;
grant select on public.dev_commission_breakdown to authenticated;

-- =========================
-- RLS: developers read/write program tables
-- =========================

drop policy if exists ambassadors_developer_select on public.ambassadors;
create policy ambassadors_developer_select on public.ambassadors
  for select to authenticated
  using (public.is_developer());

drop policy if exists referrals_developer_select on public.referrals;
create policy referrals_developer_select on public.referrals
  for select to authenticated
  using (public.is_developer());

drop policy if exists commissions_developer_select on public.commissions;
create policy commissions_developer_select on public.commissions
  for select to authenticated
  using (public.is_developer());

drop policy if exists commissions_developer_update on public.commissions;
create policy commissions_developer_update on public.commissions
  for update to authenticated
  using (public.is_developer())
  with check (public.is_developer());

-- =========================
-- Realtime (refetch on ambassador / referral / commission changes)
-- =========================

do $pub$
begin
  begin
    alter publication supabase_realtime add table public.ambassadors;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.referrals;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.commissions;
  exception
    when duplicate_object then null;
  end;
end
$pub$;

alter table public.ambassadors replica identity full;
alter table public.referrals replica identity full;
alter table public.commissions replica identity full;

commit;
