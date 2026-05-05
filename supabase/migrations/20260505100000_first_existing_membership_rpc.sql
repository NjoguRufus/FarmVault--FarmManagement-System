begin;

-- ===========================================================================
-- pick_first_existing_membership(p_clerk_user_id)
--
-- Replaces the N+1 client-side loop in tenantMembershipRecovery.ts.
-- Previously: client fetched all membership rows, then called company_exists()
-- once per row (up to N round-trips). Now: a single query with JOIN filters out
-- deleted companies in the DB and returns the newest valid membership.
--
-- Search order: core.company_members -> public.company_members -> legacy user_id.
-- ===========================================================================

create or replace function public.pick_first_existing_membership(
  p_clerk_user_id text
)
returns table (company_id text, role text)
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  -- 1) Core schema (preferred — post-migration users)
  return query
  select
    cm.company_id::text,
    coalesce(nullif(trim(cm.role), ''), 'employee')::text
  from core.company_members cm
  inner join core.companies c on c.id = cm.company_id
  where cm.clerk_user_id = p_clerk_user_id
  order by cm.created_at desc nulls last
  limit 1;

  if found then return; end if;

  -- 2) Public schema (clerk_user_id column)
  return query
  select
    cm.company_id::text,
    coalesce(nullif(trim(cm.role), ''), 'employee')::text
  from public.company_members cm
  inner join public.companies c on c.id = cm.company_id
  where cm.clerk_user_id = p_clerk_user_id
  order by cm.created_at desc nulls last
  limit 1;

  if found then return; end if;

  -- 3) Legacy fallback: user_id field (pre-Clerk migration rows)
  return query
  select
    cm.company_id::text,
    coalesce(nullif(trim(cm.role), ''), 'employee')::text
  from public.company_members cm
  inner join public.companies c on c.id = cm.company_id
  where cm.user_id = p_clerk_user_id
  order by cm.created_at desc nulls last
  limit 1;
end;
$$;

-- Allow authenticated users to call this from the client SDK
grant execute on function public.pick_first_existing_membership(text) to authenticated;

commit;
