begin;

-- Relax legacy foreign key on public.subscriptions.company_id.
-- We now primarily rely on RLS + membership checks for multi-tenant safety.
-- This avoids hard failures when the referenced companies table/schema evolves.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'subscriptions'
      and table_type   = 'BASE TABLE'
  ) then
    -- Drop the FK if it exists; safe to run multiple times.
    alter table public.subscriptions
      drop constraint if exists subscriptions_company_id_fkey;
  end if;
end$$;

commit;

