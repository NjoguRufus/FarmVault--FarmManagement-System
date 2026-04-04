-- Fix ambassador routing for brand-new signups who have user_type='ambassador' in
-- core.profiles but NO row yet in public.ambassadors (profile form not submitted yet).
--
-- Previously, dashboard_switcher_capabilities only checked public.ambassadors.
-- A user who signed up via ?type=ambassador would have user_type='ambassador' set by
-- set_my_ambassador_profile_role(), but hasAmbassador=false from the capabilities RPC.
-- This caused all ambassador routing guards (PostAuthContinuePage, RequireOnboarding,
-- OnboardingPage) to miss them and route them to company onboarding instead.
--
-- Fix: also accept user_type IN ('ambassador','both') on core.profiles as evidence of
-- ambassador intent, so routing guards fire correctly before the profile form is submitted.

begin;

create or replace function public.dashboard_switcher_capabilities()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk       text;
  v_ambassador  boolean := false;
  v_company     boolean := false;
  v_has_public  boolean;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('is_ambassador', false, 'has_company', false);
  end if;

  -- Primary: ambassador row exists in public.ambassadors.
  -- Fallback: user_type on core.profiles was set to 'ambassador' or 'both' via
  --           set_my_ambassador_profile_role() right after Clerk signup.
  select exists (
    select 1
    from public.ambassadors a
    where a.clerk_user_id = v_clerk
    limit 1
  )
  or exists (
    select 1
    from core.profiles p
    where p.clerk_user_id = v_clerk
      and p.user_type in ('ambassador', 'both')
    limit 1
  )
  into v_ambassador;

  -- Company: core.company_members (authoritative).
  select exists (
    select 1
    from core.company_members m
    inner join core.companies c on c.id = m.company_id
    where m.clerk_user_id = v_clerk
    limit 1
  )
  into v_company;

  -- Legacy fallback: public.company_members (some deployments use this table).
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'company_members'
  )
  into v_has_public;

  if not v_company and coalesce(v_has_public, false) then
    select exists (
      select 1
      from public.company_members pm
      inner join core.companies c on c.id = pm.company_id
      where cast(pm.user_id as text) = v_clerk
      limit 1
    )
    into v_company;
  end if;

  return jsonb_build_object(
    'is_ambassador', coalesce(v_ambassador, false),
    'has_company',   coalesce(v_company, false)
  );
end;
$$;

revoke all on function public.dashboard_switcher_capabilities() from public;
grant execute on function public.dashboard_switcher_capabilities() to authenticated;

commit;

notify pgrst, 'reload schema';
