begin;

-- =====================================================
-- System-wide membership repair & auto-heal
-- =====================================================

-- 1) Idempotent backfill: ensure every profile with an active_company_id
--    has a matching membership row in core.company_members.
-- Note: core.company_members does not have a status column; only id, company_id,
--       clerk_user_id, role, and created_at (plus any existing columns).
insert into core.company_members (id, company_id, clerk_user_id, role, created_at)
select
  gen_random_uuid(),
  p.active_company_id,
  p.clerk_user_id,
  'company_admin'::text,
  now()
from core.profiles p
where p.active_company_id is not null
  and p.clerk_user_id is not null
  and not exists (
    select 1
    from core.company_members m
    where m.company_id = p.active_company_id
      and m.clerk_user_id = p.clerk_user_id
  );

-- 2) Runtime helper: ensure the current user has membership
--    for their current_context().company_id.
create or replace function core.ensure_current_membership()
returns void
language plpgsql
security definer
as $$
declare
  ctx record;
  v_clerk_id text;
begin
  select * into ctx from public.current_context() limit 1;

  if ctx.company_id is null then
    return;
  end if;

  -- Use the same identity that employees RLS uses.
  select core.current_user_id() into v_clerk_id;

  if v_clerk_id is null then
    return;
  end if;

  if not exists (
    select 1
    from core.company_members m
    where m.company_id = ctx.company_id
      and m.clerk_user_id = v_clerk_id
  ) then
    insert into core.company_members (id, company_id, clerk_user_id, role, created_at)
    values (
      gen_random_uuid(),
      ctx.company_id,
      v_clerk_id,
      coalesce(nullif(ctx.role, ''), 'company_admin')::text,
      now()
    );
  end if;
end;
$$;

-- 3) Public wrapper so browser RPC calls (supabase.rpc) can access it.
create or replace function public.ensure_current_membership()
returns void
language sql
security definer
as $$
  select core.ensure_current_membership();
$$;

grant execute on function public.ensure_current_membership() to authenticated;

commit;

