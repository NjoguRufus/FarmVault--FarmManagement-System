begin;

-- Close remaining public schema RLS gaps discovered by security scans.
-- This migration is idempotent and safe across environments.

do $$
begin
  if to_regclass('public.company_subscriptions') is not null then
    alter table public.company_subscriptions enable row level security;

    drop policy if exists company_subscriptions_select on public.company_subscriptions;
    create policy company_subscriptions_select
      on public.company_subscriptions
      for select
      to authenticated
      using (
        admin.is_developer()
        or company_id::text = core.current_company_id()::text
      );

    drop policy if exists company_subscriptions_insert on public.company_subscriptions;
    create policy company_subscriptions_insert
      on public.company_subscriptions
      for insert
      to authenticated
      with check (
        admin.is_developer()
        or company_id::text = core.current_company_id()::text
      );

    drop policy if exists company_subscriptions_update on public.company_subscriptions;
    create policy company_subscriptions_update
      on public.company_subscriptions
      for update
      to authenticated
      using (
        admin.is_developer()
        or company_id::text = core.current_company_id()::text
      )
      with check (
        admin.is_developer()
        or company_id::text = core.current_company_id()::text
      );

    drop policy if exists company_subscriptions_delete on public.company_subscriptions;
    create policy company_subscriptions_delete
      on public.company_subscriptions
      for delete
      to authenticated
      using (
        admin.is_developer()
        or company_id::text = core.current_company_id()::text
      );
  end if;
end
$$;

do $$
begin
  if to_regclass('public.harvest_collections') is not null then
    alter table public.harvest_collections enable row level security;

    drop policy if exists harvest_collections_policy on public.harvest_collections;
    create policy harvest_collections_policy
      on public.harvest_collections
      for all
      to authenticated
      using (
        admin.is_developer()
        or company_id = core.current_company_id()
      )
      with check (
        admin.is_developer()
        or company_id = core.current_company_id()
      );
  end if;
end
$$;

do $$
begin
  if to_regclass('public.harvest_pickers') is not null then
    alter table public.harvest_pickers enable row level security;

    drop policy if exists harvest_pickers_policy on public.harvest_pickers;
    create policy harvest_pickers_policy
      on public.harvest_pickers
      for all
      to authenticated
      using (
        admin.is_developer()
        or company_id = core.current_company_id()
      )
      with check (
        admin.is_developer()
        or company_id = core.current_company_id()
      );
  end if;
end
$$;

commit;
