-- Read-only: developer console — rows where multiple core.profiles share the same normalized email.

begin;

create or replace function developer.list_duplicate_profile_emails()
returns table (
  normalized_email text,
  profile_count bigint,
  clerk_user_ids text[]
)
language plpgsql
stable
security definer
set search_path = core, public, developer
as $$
begin
  perform developer.assert_developer();
  return query
  select
    public.normalize_email(p.email) as normalized_email,
    count(*)::bigint as profile_count,
    array_agg(p.clerk_user_id order by p.created_at nulls last) as clerk_user_ids
  from core.profiles p
  where nullif(public.normalize_email(p.email), '') is not null
  group by 1
  having count(*) > 1
  order by 1;
end;
$$;

grant execute on function developer.list_duplicate_profile_emails() to authenticated;

commit;

notify pgrst, 'reload schema';
