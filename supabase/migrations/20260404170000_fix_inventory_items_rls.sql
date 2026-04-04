begin;

-- =============================================================
-- Fix: Enable RLS on inventory.items (the underlying table that
-- public.inventory_items VIEW reads from) and add SELECT policies
-- for company-scoped users and developer / admin access.
--
-- Root cause: inventory_items is a VIEW over inventory.items.
-- RLS on a VIEW is not enforced; it must live on the base table.
-- =============================================================

do $$
begin
  -- Skip gracefully in environments where inventory.items does not yet exist.
  if to_regclass('inventory.items') is null then
    raise notice 'inventory.items not found — skipping RLS setup';
    return;
  end if;

  -- Step 1: Enable RLS on the real underlying table
  execute 'alter table inventory.items enable row level security';

  -- Step 2: Company-scoped SELECT — each session sees only the company
  --         that matches their active_company_id in core.profiles.
  execute 'drop policy if exists "company read inventory" on inventory.items';
  execute $pol$
    create policy "company read inventory"
    on inventory.items
    for select
    using (
      company_id in (
        select p.active_company_id
        from public.profiles p
        where p.clerk_user_id = auth.jwt() ->> 'sub'
      )
    )
  $pol$;

  -- Step 3: Developer SELECT — can read any company's inventory.
  --         public.profiles has no role column; use admin.developers via is_developer().
  execute 'drop policy if exists "developer read inventory" on inventory.items';
  execute $pol$
    create policy "developer read inventory"
    on inventory.items
    for select
    using (
      public.is_developer()
    )
  $pol$;

end;
$$;

commit;
