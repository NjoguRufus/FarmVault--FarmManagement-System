-- Resolve workspace billing/contact email (same rules as billing_receipt_load_context) for Edge Functions
-- that send company copies (e.g. notify-developer-transactional).

begin;

create or replace function public.company_billing_contact_email(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, core
as $$
declare
  v_cid            uuid := p_company_id;
  v_created_by     text;
  v_core_email     text;
  v_owner_email    text;
  v_admin_email    text;
  r                record;
  v_has_pub_cm     boolean;
begin
  select
    coalesce(nullif(trim(c.created_by), ''), nullif(trim(pc.created_by), '')),
    nullif(trim(c.email), ''),
    nullif(trim(c.owner_email), '')
  into v_created_by, v_core_email, v_owner_email
  from core.companies c
  full outer join public.companies pc on pc.id = c.id
  where coalesce(c.id, pc.id) = v_cid;

  v_admin_email := public.billing_receipt_profile_email_for_uid(v_created_by);

  if v_admin_email is null or trim(v_admin_email) = '' then
    v_admin_email := coalesce(
      nullif(trim(v_core_email), ''),
      nullif(trim(v_owner_email), ''),
      ''
    );
  end if;

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
        exit;
      end if;
    end loop;
  end if;

  return coalesce(nullif(trim(v_admin_email), ''), '');
end;
$$;

comment on function public.company_billing_contact_email(uuid) is
  'Returns workspace contact email (creator → company email/owner_email → members). Service role only.';

revoke all on function public.company_billing_contact_email(uuid) from public;
grant execute on function public.company_billing_contact_email(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
