-- Workspace owner email for transactional mail (receipts, trial notices).

begin;

alter table core.companies
  add column if not exists owner_email text;

comment on column core.companies.owner_email is 'Primary billing/owner inbox for the workspace (usually the creator''s email).';

update core.companies c
set owner_email = nullif(trim(p.email), '')
from core.profiles p
where p.clerk_user_id = c.created_by
  and (c.owner_email is null or trim(c.owner_email) = '')
  and p.email is not null
  and trim(p.email) <> '';

-- create_company_with_admin — same as 20260405100000 plus owner_email on insert
create or replace function core.create_company_with_admin(
  _name text,
  _referral_code text default null,
  _referral_device_id text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_norm_name  text;
  v_company_id uuid;
  v_inserted   boolean := false;
  v_owner_email text;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_with_admin: unauthenticated' using errcode = '28000';
  end if;

  v_norm_name := lower(trim(_name));
  if v_norm_name is null or v_norm_name = '' then
    raise exception 'create_company_with_admin: empty company name' using errcode = '22023';
  end if;

  select nullif(trim(email), '') into v_owner_email
  from core.profiles
  where clerk_user_id = v_user_id
  limit 1;

  select c.id
  into v_company_id
  from core.companies c
  left join core.company_members m
    on m.company_id = c.id
   and m.clerk_user_id = v_user_id
  where lower(trim(c.name)) = v_norm_name
    and (c.created_by = v_user_id or m.clerk_user_id is not null)
  order by c.created_at desc
  limit 1;

  if v_company_id is null then
    insert into core.companies (
      name,
      created_by,
      plan,
      subscription_status,
      access_level,
      onboarding_completed,
      status,
      owner_email
    )
    values (
      _name,
      v_user_id,
      'basic',
      'pending',
      'basic',
      false,
      'pending',
      v_owner_email
    )
    returning id into v_company_id;
    v_inserted := true;
  end if;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at, user_type)
  values (v_user_id, v_company_id, now(), now(), 'company_admin')
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now(),
        user_type         = case
                              when core.profiles.user_type = 'ambassador' then 'both'
                              else core.profiles.user_type
                            end;

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  if v_inserted then
    perform public.apply_farmer_referral_attribution(
      v_company_id,
      v_user_id,
      _referral_code,
      _referral_device_id
    );
  end if;

  return v_company_id;
end;
$$;

grant execute on function core.create_company_with_admin(text, text, text) to authenticated;

create or replace function public.complete_company_onboarding(_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_uid text := core.current_user_id();
  v_ok boolean := false;
  v_profile_email text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _company_id is null then
    raise exception 'company id is required';
  end if;

  select exists (
    select 1
    from core.company_members m
    where m.company_id = _company_id
      and m.clerk_user_id = v_uid
      and lower(trim(m.role)) in ('company_admin', 'company-admin', 'owner', 'admin')
  )
  into v_ok;

  if not v_ok then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select nullif(trim(email), '') into v_profile_email
  from core.profiles
  where clerk_user_id = v_uid
  limit 1;

  update core.companies c
  set
    onboarding_completed = true,
    owner_email = coalesce(nullif(trim(c.owner_email), ''), v_profile_email),
    updated_at = now()
  where c.id = _company_id;

  return jsonb_build_object('success', true, 'company_id', _company_id::text);
end;
$$;

revoke all on function public.complete_company_onboarding(uuid) from public;
grant execute on function public.complete_company_onboarding(uuid) to authenticated;

commit;
