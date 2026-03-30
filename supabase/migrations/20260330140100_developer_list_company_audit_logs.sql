-- Company-scoped audit log read for developers (security definer + is_developer gate).
-- Matches tenant by normalized company_id text (UUID with/without dashes).

create or replace function public.developer_list_company_audit_logs(
  p_tenant_key text,
  p_limit int default 50,
  p_offset int default 0,
  p_module text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
as $$
declare
  v_key text;
  v_lim int;
  v_off int;
  v_mod text;
  v_fetch int;
  v_rows jsonb;
  v_has_more boolean;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_key := replace(lower(trim(coalesce(p_tenant_key, ''))), '-', '');
  if v_key = '' then
    return jsonb_build_object('rows', '[]'::jsonb, 'has_more', false);
  end if;

  v_lim := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 200));
  v_off := greatest(0, coalesce(p_offset, 0));
  v_mod := nullif(trim(lower(coalesce(p_module, ''))), '');
  v_fetch := v_lim + 1;

  if to_regclass('public.audit_logs') is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'has_more', false);
  end if;

  with page as (
    select
      al.id::text as id,
      al.created_at as logged_at,
      al.action,
      coalesce(nullif(trim(al.entity_type), ''), 'general') as module,
      nullif(
        trim(
          coalesce(
            al.metadata->>'actor_name',
            al.metadata->>'actorName',
            al.metadata->>'user_name',
            al.metadata->>'userName',
            al.metadata->>'actor_email',
            al.metadata->>'actorEmail',
            al.metadata->>'user_email',
            al.metadata->>'email',
            al.metadata->>'created_by_name',
            al.metadata->>'created_by',
            al.metadata->>'actor_id',
            al.metadata->>'user_id',
            ''
          )
        ),
        ''
      ) as actor_label,
      left(
        trim(
          coalesce(
            al.metadata->>'description',
            al.metadata->>'message',
            al.metadata->>'note',
            al.metadata->>'summary',
            al.action
          )
        ),
        2000
      ) as description,
      nullif(trim(al.entity_id), '') as affected_record
    from public.audit_logs al
    where replace(lower(trim(coalesce(al.company_id, ''))), '-', '') = v_key
      and (
        v_mod is null
        or lower(coalesce(nullif(trim(al.entity_type), ''), 'general')) = v_mod
      )
    order by al.created_at desc nulls last
    limit v_fetch offset v_off
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'logged_at', p.logged_at,
            'action', p.action,
            'module', p.module,
            'actor_label', p.actor_label,
            'description', p.description,
            'affected_record', p.affected_record
          )
          order by p.logged_at desc nulls last
        )
        from (select * from page limit v_lim) p
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_lim from page)
    into v_rows, v_has_more;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'has_more', v_has_more
  );
end;
$$;

grant execute on function public.developer_list_company_audit_logs(text, int, int, text) to authenticated;

notify pgrst, 'reload schema';
