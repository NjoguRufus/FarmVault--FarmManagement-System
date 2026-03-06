begin;

-- Fix and harden RLS policies on public.subscriptions so that:
-- - Company members (especially company_admin) can manage their own subscriptions
-- - Original company creators can create the first subscription row
-- - Platform developers (admin.is_developer()) can see and manage everything
-- - Policies are idempotent and safe to re-run

do $$
declare
  pol record;
begin
  -- Only apply if the legacy public.subscriptions table exists in this environment.
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'subscriptions'
  ) then
    -- Ensure RLS is enabled on public.subscriptions
    alter table public.subscriptions enable row level security;

    -- Drop all existing subscriptions policies (idempotent)
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename  = 'subscriptions'
    loop
      execute format('drop policy if exists %I on public.subscriptions', pol.policyname);
    end loop;

    -- READ: any member of the company can see its subscriptions, or any platform developer.
    create policy subscriptions_select_member
    on public.subscriptions
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.company_members m
        where m.company_id = public.subscriptions.company_id
          and m.user_id    = public.current_clerk_id()
      )
      or admin.is_developer()
    );

    -- INSERT: allow company admins or platform developers
    create policy subscriptions_insert_member
    on public.subscriptions
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.company_members m
        where m.company_id = public.subscriptions.company_id
          and m.user_id    = public.current_clerk_id()
          and m.role       = 'company_admin'
      )
      or admin.is_developer()
    );

    -- UPDATE: only company admins or developers can update subscriptions
    create policy subscriptions_update_member
    on public.subscriptions
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.company_members m
        where m.company_id = public.subscriptions.company_id
          and m.user_id    = public.current_clerk_id()
          and m.role       = 'company_admin'
      )
      or admin.is_developer()
    )
    with check (
      exists (
        select 1
        from public.company_members m
        where m.company_id = public.subscriptions.company_id
          and m.user_id    = public.current_clerk_id()
          and m.role       = 'company_admin'
      )
      or admin.is_developer()
    );
  end if;
end$$;

commit;

