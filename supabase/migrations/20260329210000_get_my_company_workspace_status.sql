-- Dedicated RPC for tenant UI: core.companies.status (pending | active | suspended).
-- Separate from get_subscription_gate_state so approval pills stay correct even if the gate
-- return shape or PostgREST cache lags behind hybrid-approval migrations.

begin;

create or replace function public.get_my_company_workspace_status()
returns table (
  company_id uuid,
  workspace_status text
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
begin
  v_company_id := core.current_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  select
    c.id,
    lower(trim(c.status::text)) as workspace_status
  from core.companies c
  where c.id = v_company_id;
end;
$$;

comment on function public.get_my_company_workspace_status() is
  'Returns this session''s company workspace lifecycle status from core.companies.status (pending/active/suspended).';

grant execute on function public.get_my_company_workspace_status() to authenticated;

commit;

notify pgrst, 'reload schema';
