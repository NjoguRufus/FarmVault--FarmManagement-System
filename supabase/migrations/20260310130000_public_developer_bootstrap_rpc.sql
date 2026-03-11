-- Public RPC wrappers for developer bootstrap and check.
-- Use these from the client so we never hit admin schema directly (avoids 406 when admin is not exposed).

-- 1) Bootstrap: ensure current user is in admin.developers (allowlisted emails).
create or replace function public.bootstrap_developer(_email text)
returns void
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
begin
  perform admin.bootstrap_developer(_email);
end;
$$;

grant execute on function public.bootstrap_developer(text) to authenticated;

-- 2) Check: is the current user a developer? (reads admin.developers via admin.is_developer())
create or replace function public.is_developer()
returns boolean
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
begin
  return admin.is_developer();
end;
$$;

grant execute on function public.is_developer() to authenticated;
