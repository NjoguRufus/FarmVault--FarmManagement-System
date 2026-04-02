-- Reports export: bypass legacy RLS on public.operations_work_cards that references
-- deprecated JWT GUCs (e.g. request.jwt.claim.company_id) which fail under Clerk tokens.

begin;

create or replace function public.list_operations_work_cards_for_export(p_company_id uuid)
returns setof public.operations_work_cards
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select w.*
  from public.operations_work_cards w
  -- Supports company_id stored as uuid or text
  where w.company_id::text = p_company_id::text;
$$;

grant execute on function public.list_operations_work_cards_for_export(uuid) to authenticated;

commit;
