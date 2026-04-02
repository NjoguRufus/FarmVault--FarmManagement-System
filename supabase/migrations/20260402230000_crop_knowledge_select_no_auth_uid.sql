-- rpc_farmvault_notebook_list_crops / fv_notebook_list_crops scan public.crop_knowledge_profiles (and unions).
-- SELECT policies still used `auth.uid() is not null` (20260401120000). Clerk third-party JWT makes
-- auth.uid() cast `sub` to uuid → 22P02 invalid uuid "" (or user_…).
-- Writes were fixed in 20260401160000; replace read policies to use Clerk session id only.

begin;

create or replace function public.fv_has_clerk_session()
returns boolean
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v text;
begin
  begin
    v := nullif(trim(coalesce(core.current_user_id(), '')), '');
  exception
    when others then
      v := null;
  end;
  return v is not null;
end;
$$;

revoke all on function public.fv_has_clerk_session() from public;
grant execute on function public.fv_has_clerk_session() to anon, authenticated;

drop policy if exists crop_knowledge_profiles_select on public.crop_knowledge_profiles;
create policy crop_knowledge_profiles_select on public.crop_knowledge_profiles
for select
using (public.fv_has_clerk_session());

drop policy if exists crop_knowledge_challenges_select on public.crop_knowledge_challenges;
create policy crop_knowledge_challenges_select on public.crop_knowledge_challenges
for select
using (public.fv_has_clerk_session());

drop policy if exists crop_knowledge_practices_select on public.crop_knowledge_practices;
create policy crop_knowledge_practices_select on public.crop_knowledge_practices
for select
using (public.fv_has_clerk_session());

drop policy if exists crop_knowledge_chemicals_select on public.crop_knowledge_chemicals;
create policy crop_knowledge_chemicals_select on public.crop_knowledge_chemicals
for select
using (public.fv_has_clerk_session());

drop policy if exists crop_knowledge_timing_windows_select on public.crop_knowledge_timing_windows;
create policy crop_knowledge_timing_windows_select on public.crop_knowledge_timing_windows
for select
using (public.fv_has_clerk_session());

commit;

notify pgrst, 'reload schema';
