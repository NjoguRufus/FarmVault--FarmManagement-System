-- Resolve company + billing contact for receipt PDF/email in one security-definer call.
-- Fixes empty customer blocks when core.companies.name is blank but public.companies has it,
-- or when profiles live only in public.profiles / public.company_members (user_id).

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
  v_company_name text;
  v_created_at   timestamptz;
  v_created_by   text;
  v_owner_email  text;
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

  begin
    v_cid := trim(v_sp.company_id)::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;

  v_mpesa_name := nullif(trim(v_sp.mpesa_name), '');
  v_mpesa_phone := nullif(trim(v_sp.mpesa_phone), '');
  v_rb := nullif(trim(v_sp.reviewed_by), '');

  select
    coalesce(nullif(trim(c.name), ''), nullif(trim(pc.name), '')),
    coalesce(c.created_at, pc.created_at),
    coalesce(nullif(trim(c.created_by), ''), nullif(trim(pc.created_by), '')),
    nullif(trim(c.owner_email), ''),
    nullif(trim(pc.phone), '')
  into v_company_name, v_created_at, v_created_by, v_owner_email, v_pub_phone
  from core.companies c
  full outer join public.companies pc on pc.id = c.id
  where coalesce(c.id, pc.id) = v_cid;

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

  v_admin_email := coalesce(
    nullif(trim(v_owner_email), ''),
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

comment on function public.billing_receipt_load_context(uuid) is
  'Security definer: company + contact resolution for billing-receipt-issue (core/public coalesce).';

revoke all on function public.billing_receipt_load_context(uuid) from public;
grant execute on function public.billing_receipt_load_context(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
