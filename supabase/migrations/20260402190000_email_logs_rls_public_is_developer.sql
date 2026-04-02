-- Email Center: RLS used admin.is_developer(auth.uid()). Clerk third-party auth sets
-- JWT sub to a text Clerk id (user_...); coercing it for auth.uid() causes:
-- invalid input syntax for type uuid: "user_..."
-- Use public.is_developer() → admin.is_developer() (core.current_user_id()) instead.

begin;

drop policy if exists email_logs_select_developer on public.email_logs;

create policy email_logs_select_developer
  on public.email_logs
  for select
  to authenticated
  using (public.is_developer());

commit;

notify pgrst, 'reload schema';
