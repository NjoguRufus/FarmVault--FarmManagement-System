-- KeyFarm: keyinvestmentfarm@gmail.com → Clerk user_3B4RzgrYhSkBFHC2ZltUogm99dC
-- RLS uses core.is_company_member which matches clerk_user_id first. A legacy row may exist with
-- unique (company_id, user_id) and user_id set but clerk_user_id null — INSERT then hits 23505.
-- Fix: UPDATE that row to set clerk_user_id; only INSERT if still missing.

begin;

do $body$
declare
  n int;
  v_company uuid := 'fa61d13d-3466-48db-a39c-4a474ccfed58';
  v_clerk text := 'user_3B4RzgrYhSkBFHC2ZltUogm99dC';
  v_has_user_id_col boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'core'
      and table_name = 'company_members'
      and column_name = 'user_id'
  )
  into v_has_user_id_col;

  if v_has_user_id_col then
    update core.company_members
    set
      clerk_user_id = v_clerk,
      role = case
        when role in ('company_admin', 'admin', 'owner') then role
        else 'company_admin'
      end
    where company_id = v_company
      and user_id = v_clerk;
    get diagnostics n = row_count;
  else
    n := 0;
  end if;

  if n = 0 then
    update core.company_members
    set
      role = case
        when role in ('company_admin', 'admin', 'owner') then role
        else 'company_admin'
      end
    where company_id = v_company
      and clerk_user_id = v_clerk;
    get diagnostics n = row_count;
  end if;

  if n = 0 then
    if v_has_user_id_col then
      insert into core.company_members (company_id, clerk_user_id, role)
      select v_company, v_clerk, 'company_admin'
      where not exists (
        select 1
        from core.company_members m
        where m.company_id = v_company
          and (m.clerk_user_id = v_clerk or m.user_id = v_clerk)
      );
    else
      insert into core.company_members (company_id, clerk_user_id, role)
      select v_company, v_clerk, 'company_admin'
      where not exists (
        select 1
        from core.company_members m
        where m.company_id = v_company
          and m.clerk_user_id = v_clerk
      );
    end if;
  end if;
end
$body$;

-- Legacy public.company_members: back-fill clerk_user_id when the table exists.
do $pub$
begin
  if to_regclass('public.company_members') is null then
    return;
  end if;
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'company_members'
      and c.column_name = 'clerk_user_id'
  ) then
    return;
  end if;
  update public.company_members
  set clerk_user_id = 'user_3B4RzgrYhSkBFHC2ZltUogm99dC'
  where company_id = 'fa61d13d-3466-48db-a39c-4a474ccfed58'::uuid
    and user_id = 'user_3B4RzgrYhSkBFHC2ZltUogm99dC'
    and (clerk_user_id is null or nullif(trim(clerk_user_id::text), '') is null);
end
$pub$;

update core.profiles
set
  active_company_id = 'fa61d13d-3466-48db-a39c-4a474ccfed58'::uuid,
  updated_at        = now()
where clerk_user_id = 'user_3B4RzgrYhSkBFHC2ZltUogm99dC';

commit;

notify pgrst, 'reload schema';
