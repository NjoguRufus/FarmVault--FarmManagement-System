begin;

-- Clerk user ids are text (e.g. user_xxx), not UUIDs.
-- Convert farms.user_id to text so inserts do not fail on default/auth context.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'projects'
      and table_name = 'farms'
      and column_name = 'user_id'
      and data_type = 'uuid'
  ) then
    alter table projects.farms
      alter column user_id drop default;

    alter table projects.farms
      alter column user_id type text using user_id::text;

    alter table projects.farms
      alter column user_id set default core.current_user_id();
  end if;
end
$$;

commit;
