-- Prevent auto-resurrection of deleted users:
-- If an active admin.reset_users tombstone exists for the current identity, block
-- resolve_or_ensure_platform_profile from creating/updating core.profiles.
--
-- Manual re-sign-up remains possible because onboarding flow should first call
-- public.consume_reset_user_for_signup(), which deactivates the tombstone.

begin;

create or replace function public.resolve_or_ensure_platform_profile(p_email text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = core, public, admin
as $$
declare
  v_me    text;
  v_norm  text;
  v_other text;
  v_email_claim text;
  v_has_reset boolean := false;
begin
  v_me := nullif(trim(core.current_user_id()), '');
  if v_me is null then
    raise exception 'resolve_or_ensure_platform_profile: unauthenticated' using errcode = '28000';
  end if;

  v_norm := public.normalize_email(p_email);

  begin
    v_email_claim := lower(nullif(trim((current_setting('request.jwt.claims', true)::jsonb ->> 'email')), ''));
  exception when others then
    v_email_claim := null;
  end;

  -- Block any implicit profile creation/updates when an active reset tombstone exists.
  if to_regclass('admin.reset_users') is not null then
    select exists(
      select 1
      from admin.reset_users r
      where r.is_active = true
        and (
          r.clerk_user_id = v_me
          or (v_norm is not null and lower(coalesce(r.email, '')) = v_norm)
          or (v_email_claim is not null and lower(coalesce(r.email, '')) = v_email_claim)
        )
    )
    into v_has_reset;
  end if;

  if coalesce(v_has_reset, false) = true then
    raise exception 'reset_required' using errcode = '42501';
  end if;

  -- Already have a row for this Clerk user
  if exists (select 1 from core.profiles p where p.clerk_user_id = v_me) then
    if v_norm is not null and length(v_norm) > 0 then
      update core.profiles
      set
        email = v_norm,
        updated_at = now()
      where clerk_user_id = v_me
        and (email is distinct from v_norm);
    end if;

    if to_regclass('public.profiles') is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'clerk_user_id'
       ) then
      update public.profiles pub
      set
        email = coalesce(v_norm, pub.email),
        updated_at = now()
      where pub.clerk_user_id = v_me;
    end if;

    return jsonb_build_object('clerk_user_id', v_me, 'action', 'existing');
  end if;

  -- No row for this Clerk id: attach to existing profile by normalized email (same human, new Clerk id)
  if v_norm is not null and length(v_norm) > 0 then
    select p.clerk_user_id
      into v_other
    from core.profiles p
    where public.normalize_email(p.email) = v_norm
    order by (p.active_company_id is not null) desc, p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1;

    if v_other is not null and v_other <> v_me then
      delete from core.profiles where clerk_user_id = v_me;

      delete from core.company_members cm1
      where cm1.clerk_user_id = v_other
        and exists (
          select 1 from core.company_members cm2
          where cm2.company_id = cm1.company_id and cm2.clerk_user_id = v_me
        );

      update core.company_members set clerk_user_id = v_me where clerk_user_id = v_other;

      update core.companies set created_by = v_me where created_by = v_other;

      if to_regclass('public.company_members') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'company_members' and column_name = 'clerk_user_id'
         ) then
        delete from public.company_members cm1
        where cm1.clerk_user_id = v_other
          and exists (
            select 1 from public.company_members cm2
            where cm2.company_id = cm1.company_id and cm2.clerk_user_id = v_me
          );
        update public.company_members set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('public.employees') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'employees' and column_name = 'clerk_user_id'
         ) then
        delete from public.employees e1
        where e1.clerk_user_id = v_other
          and exists (
            select 1 from public.employees e2
            where e2.company_id = e1.company_id and e2.clerk_user_id = v_me
          );
        update public.employees set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('public.alert_recipients') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'alert_recipients' and column_name = 'clerk_user_id'
         ) then
        delete from public.alert_recipients ar1
        where ar1.clerk_user_id = v_other
          and exists (
            select 1 from public.alert_recipients ar2
            where ar2.company_id = ar1.company_id and ar2.clerk_user_id = v_me
          );
        update public.alert_recipients set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('public.user_company_mappings') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'user_company_mappings' and column_name = 'clerk_user_id'
         ) then
        update public.user_company_mappings set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('admin.developers') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'admin' and table_name = 'developers' and column_name = 'clerk_user_id'
         ) then
        delete from admin.developers d1
        where d1.clerk_user_id = v_other
          and exists (select 1 from admin.developers d2 where d2.clerk_user_id = v_me);
        update admin.developers set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      update core.profiles
      set
        clerk_user_id = v_me,
        email = coalesce(v_norm, email),
        updated_at = now()
      where clerk_user_id = v_other;

      if to_regclass('public.profiles') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles' and column_name = 'clerk_user_id'
         ) then
        update public.profiles set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      return jsonb_build_object('clerk_user_id', v_me, 'action', 'merged_from_email');
    end if;
  end if;

  -- Brand new platform user (canonical row is core.profiles)
  insert into core.profiles (clerk_user_id, email, created_at, updated_at)
  values (v_me, v_norm, now(), now());

  return jsonb_build_object('clerk_user_id', v_me, 'action', 'created');
end;
$$;

grant execute on function public.resolve_or_ensure_platform_profile(text) to authenticated;

commit;

notify pgrst, 'reload schema';

