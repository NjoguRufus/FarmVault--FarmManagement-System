-- billing_receipt_load_context v2: scalar subqueries (avoid join edge cases),
-- text-safe public.companies id match, core.companies.email in billing contact chain,
-- single-shot member/profile pick if the ordered loop finds nothing.

begin;

create or replace function public.billing_receipt_load_context(p_subscription_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, core
as $$
declare
  v_sp           public.subscription_payments%rowtype;
  v_cid          uuid;
  v_cid_text     text;
  v_company_name text;
  v_created_at   timestamptz;
  v_created_by   text;
  v_owner_email  text;
  v_core_email   text;
  v_pub_phone    text;
  v_period_start timestamptz;
  v_period_end   timestamptz;
  v_billing_cycle text;
  v_reviewer_email text;
  v_reviewer_name  text;
  v_member_email   text;
  v_member_name    text;
  v_mpesa_name     text;
  v_mpesa_phone    text;
  v_rb             text;
  v_admin_email    text;
  v_admin_name     text;
  v_admin_phone    text;
  r                record;
  v_has_pub_cm     boolean;
begin
  select * into v_sp from public.subscription_payments where id = p_subscription_payment_id;
  if not found then
    return null;
  end if;
  if v_sp.status::text <> 'approved' then
    return null;
  end if;

  v_cid_text := trim(v_sp.company_id);

  begin
    v_cid := v_cid_text::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;

  v_mpesa_name := nullif(trim(v_sp.mpesa_name), '');
  v_mpesa_phone := nullif(trim(v_sp.mpesa_phone), '');
  v_rb := nullif(trim(v_sp.reviewed_by), '');

  v_company_name := coalesce(
    (select nullif(trim(c.name), '') from core.companies c where c.id = v_cid limit 1),
    (select nullif(trim(pc.name), '') from public.companies pc where pc.id = v_cid limit 1),
    (select nullif(trim(pc.name), '') from public.companies pc where pc.id::text = v_cid_text limit 1),
    (select nullif(trim(c.name), '') from core.companies c where c.id::text = v_cid_text limit 1)
  );

  v_created_at := coalesce(
    (select c.created_at from core.companies c where c.id = v_cid limit 1),
    (select pc.created_at from public.companies pc where pc.id = v_cid limit 1)
  );

  v_created_by := coalesce(
    (select nullif(trim(c.created_by), '') from core.companies c where c.id = v_cid limit 1),
    (select nullif(trim(pc.created_by), '') from public.companies pc where pc.id = v_cid limit 1)
  );

  v_owner_email := (select nullif(trim(c.owner_email), '') from core.companies c where c.id = v_cid limit 1);
  v_core_email := (select nullif(trim(c.email), '') from core.companies c where c.id = v_cid limit 1);
  v_pub_phone := (select nullif(trim(pc.phone), '') from public.companies pc where pc.id = v_cid limit 1);

  select cs.current_period_start, cs.current_period_end, cs.billing_cycle
  into v_period_start, v_period_end, v_billing_cycle
  from public.company_subscriptions cs
  where cs.company_id = v_cid
  limit 1;

  if v_rb is not null and lower(v_rb) <> 'mpesa_stk' then
    select p.email, p.full_name into v_reviewer_email, v_reviewer_name
    from core.profiles p
    where p.clerk_user_id = v_rb
    limit 1;
    if v_reviewer_email is null and v_reviewer_name is null then
      select p.email, p.full_name into v_reviewer_email, v_reviewer_name
      from public.profiles p
      where p.clerk_user_id = v_rb
      limit 1;
    end if;
    if v_reviewer_email is null and v_reviewer_name is null then
      select p.email, p.full_name into v_reviewer_email, v_reviewer_name
      from public.profiles p
      where p.id = v_rb
      limit 1;
    end if;
  end if;

  v_has_pub_cm := to_regclass('public.company_members') is not null;

  v_member_email := null;
  v_member_name := null;
  for r in
    select distinct on (uid) uid, role, created_at
    from (
      select
        coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) as uid,
        cm.role::text as role,
        cm.created_at,
        1 as src
      from core.company_members cm
      where cm.company_id = v_cid
        and coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) is not null
      union all
      select
        coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) as uid,
        cm.role::text as role,
        cm.created_at,
        2 as src
      from public.company_members cm
      where v_has_pub_cm
        and cm.company_id = v_cid
        and coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) is not null
    ) x
    order by uid,
      case when lower(coalesce(role, '')) like '%admin%' then 0 else 1 end,
      src asc,
      created_at asc nulls last
  loop
    select p.email, p.full_name into v_member_email, v_member_name
    from core.profiles p
    where p.clerk_user_id = r.uid
    limit 1;
    if v_member_email is not null or v_member_name is not null then
      exit;
    end if;
    select p.email, p.full_name into v_member_email, v_member_name
    from public.profiles p
    where p.clerk_user_id = r.uid
    limit 1;
    if v_member_email is not null or v_member_name is not null then
      exit;
    end if;
    select p.email, p.full_name into v_member_email, v_member_name
    from public.profiles p
    where p.id = r.uid
    limit 1;
    if v_member_email is not null or v_member_name is not null then
      exit;
    end if;
  end loop;

  if v_member_email is null and v_member_name is null then
    select p.email, p.full_name into v_member_email, v_member_name
    from core.company_members cm
    join core.profiles p on p.clerk_user_id = cm.clerk_user_id
    where cm.company_id = v_cid
      and (nullif(trim(p.email), '') is not null or nullif(trim(p.full_name), '') is not null)
    order by
      case when lower(coalesce(cm.role::text, '')) like '%admin%' then 0 else 1 end,
      cm.created_at asc nulls last
    limit 1;
  end if;

  if v_member_email is null and v_member_name is null and v_has_pub_cm then
    select p.email, p.full_name into v_member_email, v_member_name
    from public.company_members cm
    join public.profiles p
      on p.clerk_user_id = coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), ''))
      or p.id = coalesce(nullif(trim(cm.user_id::text), ''), nullif(trim(cm.clerk_user_id), ''))
    where cm.company_id = v_cid
      and coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) is not null
      and (nullif(trim(p.email), '') is not null or nullif(trim(p.full_name), '') is not null)
    order by
      case when lower(coalesce(cm.role::text, '')) like '%admin%' then 0 else 1 end,
      cm.created_at asc nulls last
    limit 1;
  end if;

  v_admin_email := coalesce(
    nullif(trim(v_owner_email), ''),
    nullif(trim(v_core_email), ''),
    nullif(trim(v_reviewer_email), ''),
    nullif(trim(v_member_email), ''),
    ''
  );

  v_admin_name := coalesce(
    nullif(trim(v_reviewer_name), ''),
    nullif(trim(v_mpesa_name), ''),
    nullif(trim(v_member_name), ''),
    case when v_member_email is not null and position('@' in v_member_email) > 1 then
      split_part(v_member_email, '@', 1)
    end,
    case when v_admin_email is not null and position('@' in v_admin_email) > 1 then
      split_part(v_admin_email, '@', 1)
    end,
    'Customer'
  );

  v_admin_phone := coalesce(nullif(trim(v_mpesa_phone), ''), nullif(trim(v_pub_phone), ''), '');

  return jsonb_build_object(
    'company_id', v_cid::text,
    'company_name', coalesce(nullif(trim(v_company_name), ''), 'Workspace'),
    'company_created_at', v_created_at,
    'created_by', v_created_by,
    'admin_name', v_admin_name,
    'admin_email', v_admin_email,
    'admin_phone', v_admin_phone,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'billing_cycle', v_billing_cycle
  );
end;
$$;

commit;

notify pgrst, 'reload schema';
