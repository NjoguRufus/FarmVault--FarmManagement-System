-- Superseded by 20260403233000_core_profiles_rls_select_jwt_grants.sql (grants + profiles_select_own + insert/update).
-- Kept as a no-op so migration history stays linear if this revision was already applied.

begin;

do $do$
begin
  null;
end
$do$;

commit;
