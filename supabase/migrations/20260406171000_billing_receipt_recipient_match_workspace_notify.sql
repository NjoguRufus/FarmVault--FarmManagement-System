-- billing_receipt_load_context: same recipient priority as workspace/onboarding emails
-- (fetchCompanyWorkspaceNotifyPayload / get_company_workspace_notify_lookup):
--   1) creator (created_by) profile email
--   2) company row: core.companies.email, then owner_email
--   3) admin/owner members (by role, then created_at)
--   4) any other member
-- Reviewer (developer) is never used.

begin;

create or replace function public.billing_receipt_profile_email_for_uid(p_uid text)
returns text
language sql
stable
security definer
set search_path = core, public
as $$
  select coalesce(
    (select nullif(trim(p.email), '') from core.profiles p where p.clerk_user_id = p_uid limit 1),
    (select nullif(trim(p.email), '') from public.profiles p where p.clerk_user_id = p_uid limit 1)
  );
$$;

create or replace function public.billing_receipt_profile_full_name_for_uid(p_uid text)
returns text
language sql
stable
security definer
set search_path = core, public
as $$
  select coalesce(
    (select nullif(trim(p.full_name), '') from core.profiles p where p.clerk_user_id = p_uid limit 1),
    (select nullif(trim(p.full_name), '') from public.profiles p where p.clerk_user_id = p_uid limit 1)
  );
$$;

revoke all on function public.billing_receipt_profile_email_for_uid(text) from public;
grant execute on function public.billing_receipt_profile_email_for_uid(text) to service_role;

revoke all on function public.billing_receipt_profile_full_name_for_uid(text) from public;
grant execute on function public.billing_receipt_profile_full_name_for_uid(text) to service_role;

create or replace function public.billing_receipt_load_context(p_subscription_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, core
as $$
declare
  v_sp             public.subscription_payments%rowtype;
  v_cid            uuid;
  v_company_name   text;
  v_created_at     timestamptz;
  v_created_by     text;
  v_core_email     text;
  v_owner_email    text;
  v_pub_phone      text;
  v_period_start   timestamptz;
  v_period_end     timestamptz;
  v_billing_cycle  text;
  v_mpesa_name     text;
  v_mpesa_phone    text;
  v_admin_email    text;
  v_admin_name     text;
  v_admin_phone    text;
  v_fn             text;
  r                record;
  v_has_pub_cm     boolean;
  v_resolved_uid   text;
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

  v_mpesa_name  := nullif(trim(v_sp.mpesa_name), '');
  v_mpesa_phone := nullif(trim(v_sp.mpesa_phone), '');

  select
    coalesce(nullif(trim(c.name), ''), nullif(trim(pc.name), '')),
    coalesce(c.created_at, pc.created_at),
    coalesce(nullif(trim(c.created_by), ''), nullif(trim(pc.created_by), '')),
    nullif(trim(c.email), ''),
    nullif(trim(c.owner_email), ''),
    nullif(trim(pc.phone), '')
  into v_company_name, v_created_at, v_created_by, v_core_email, v_owner_email, v_pub_phone
  from core.companies c
  full outer join public.companies pc on pc.id = c.id
  where coalesce(c.id, pc.id) = v_cid;

  select cs.current_period_start, cs.current_period_end, cs.billing_cycle
  into v_period_start, v_period_end, v_billing_cycle
  from public.company_subscriptions cs
  where cs.company_id = v_cid
  limit 1;

  v_resolved_uid := null;

  -- 1) Creator / onboarding account
  v_admin_email := public.billing_receipt_profile_email_for_uid(v_created_by);
  if v_admin_email is not null and trim(v_admin_email) <> '' then
    v_resolved_uid := v_created_by;
  end if;

  -- 2) Company row (workspace uses c.email; owner_email is billing inbox fallback)
  if v_admin_email is null or trim(v_admin_email) = '' then
    v_admin_email := coalesce(
      nullif(trim(v_core_email), ''),
      nullif(trim(v_owner_email), ''),
      ''
    );
  end if;

  -- 3–4) Members: admins/owners first, then others (same ordering intent as workspace notify)
  v_has_pub_cm := to_regclass('public.company_members') is not null;

  if v_admin_email is null or trim(v_admin_email) = '' then
    for r in
      select uid, role_rank, created_at
      from (
        select
          coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) as uid,
          case
            when lower(replace(coalesce(cm.role::text, ''), '-', '_')) in ('company_admin', 'companyadmin', 'owner', 'admin')
              then 0 else 1
          end as role_rank,
          cm.created_at,
          1 as src
        from core.company_members cm
        where cm.company_id = v_cid
          and coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) is not null
        union all
        select
          coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) as uid,
          case
            when lower(replace(coalesce(cm.role::text, ''), '-', '_')) in ('company_admin', 'companyadmin', 'owner', 'admin')
              then 0 else 1
          end as role_rank,
          cm.created_at,
          2 as src
        from public.company_members cm
        where v_has_pub_cm
          and cm.company_id = v_cid
          and coalesce(nullif(trim(cm.clerk_user_id), ''), nullif(trim(cm.user_id::text), '')) is not null
      ) x
      order by role_rank asc, uid asc, src asc, created_at asc nulls last
    loop
      v_admin_email := public.billing_receipt_profile_email_for_uid(r.uid);
      if v_admin_email is not null and trim(v_admin_email) <> '' then
        v_resolved_uid := r.uid;
        exit;
      end if;
    end loop;
  end if;

  v_fn := null;
  if v_resolved_uid is not null then
    v_fn := public.billing_receipt_profile_full_name_for_uid(v_resolved_uid);
  end if;

  v_admin_name := coalesce(
    nullif(trim(v_mpesa_name), ''),
    nullif(trim(v_fn), ''),
    case when v_admin_email is not null and position('@' in v_admin_email) > 1 then
      split_part(v_admin_email, '@', 1)
    end,
    'Customer'
  );

  v_admin_phone := coalesce(nullif(trim(v_mpesa_phone), ''), nullif(trim(v_pub_phone), ''), '');

  return jsonb_build_object(
    'company_id',         v_cid::text,
    'company_name',       coalesce(nullif(trim(v_company_name), ''), 'Workspace'),
    'company_created_at', v_created_at,
    'created_by',         v_created_by,
    'admin_name',         v_admin_name,
    'admin_email',        coalesce(nullif(trim(v_admin_email), ''), ''),
    'admin_phone',        v_admin_phone,
    'period_start',       v_period_start,
    'period_end',         v_period_end,
    'billing_cycle',      v_billing_cycle
  );
end;
$$;

comment on function public.billing_receipt_load_context(uuid) is
  'Security definer: receipt contact resolution matches workspace/onboarding email priority (creator → company email/owner_email → admin members → members).';

comment on function public.billing_receipt_profile_email_for_uid(text) is
  'Internal: profile email for billing receipts (core + public profiles).';

revoke all on function public.billing_receipt_load_context(uuid) from public;
grant execute on function public.billing_receipt_load_context(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
