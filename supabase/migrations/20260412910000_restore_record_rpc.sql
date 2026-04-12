-- Tenant-safe soft-delete restore for audited module tables (matches record_audit_log targets).
begin;

create or replace function public.restore_record(
  p_schema_name text,
  p_table_name text,
  p_record_id text
)
returns void
language plpgsql
security definer
set search_path = public, core, projects, finance, harvest
as $$
declare
  v_company uuid;
  v_id uuid;
  v_updated int;
  v_active boolean;
begin
  if p_schema_name is null or p_table_name is null or p_record_id is null then
    raise exception 'Missing parameters';
  end if;

  v_company := core.current_company_id();
  if v_company is null then
    raise exception 'No active company';
  end if;

  if not (public.is_developer() or core.is_company_member(v_company)) then
    raise exception 'Not authorized';
  end if;

  if not (
    (p_schema_name = 'projects' and p_table_name = 'projects')
    or (p_schema_name = 'finance' and p_table_name = 'expenses')
    or (p_schema_name = 'harvest' and p_table_name in ('harvests', 'harvest_collections'))
  ) then
    raise exception 'Invalid table for restore';
  end if;

  begin
    v_id := nullif(trim(p_record_id), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid record id';
  end;

  execute format(
    'update %I.%I set deleted_at = null where id = $1 and company_id = $2 and deleted_at is not null',
    p_schema_name,
    p_table_name
  ) using v_id, v_company;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    return;
  end if;

  execute format(
    'select exists(select 1 from %I.%I where id = $1 and company_id = $2 and deleted_at is null)',
    p_schema_name,
    p_table_name
  ) into v_active using v_id, v_company;

  if coalesce(v_active, false) then
    raise exception 'RECORD_ALREADY_ACTIVE';
  end if;

  raise exception 'Record not found or cannot be restored';
end;
$$;

comment on function public.restore_record(text, text, text) is
  'Clears deleted_at for a soft-deleted row in allowlisted audited tables; scoped to core.current_company_id().';

grant execute on function public.restore_record(text, text, text) to authenticated;

commit;
