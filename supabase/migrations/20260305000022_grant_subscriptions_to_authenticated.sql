begin;

-- Ensure the Supabase "authenticated" role has privileges on public.subscriptions.
-- This works together with the RLS policies defined in 20260305000021_fix_subscriptions_rls.sql.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'subscriptions'
  ) then
    grant select, insert, update
      on table public.subscriptions
      to authenticated;
  end if;
end$$;

commit;

