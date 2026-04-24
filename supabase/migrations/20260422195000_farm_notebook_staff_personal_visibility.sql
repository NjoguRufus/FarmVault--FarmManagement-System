-- Staff-private notebook entries: same table as company notes, scoped by visibility + owner.
-- RLS: company-scoped rows unchanged; staff_personal visible to owner + company admins (+ developers).

begin;

alter table public.farm_notebook_entries
  add column if not exists visibility_scope text not null default 'company';

alter table public.farm_notebook_entries
  add column if not exists staff_owner_user_id text null;

comment on column public.farm_notebook_entries.visibility_scope is
  'company: shared company notebook; staff_personal: visible to owner and company admins only.';

comment on column public.farm_notebook_entries.staff_owner_user_id is
  'Clerk user id of the staff member when visibility_scope = staff_personal.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'farm_notebook_entries_visibility_scope_ck'
      and conrelid = 'public.farm_notebook_entries'::regclass
  ) then
    alter table public.farm_notebook_entries
      add constraint farm_notebook_entries_visibility_scope_ck
      check (visibility_scope in ('company', 'staff_personal'));
  end if;
end $$;

alter table public.farm_notebook_entries
  drop constraint if exists farm_notebook_entries_staff_personal_owner_ck;

alter table public.farm_notebook_entries
  add constraint farm_notebook_entries_staff_personal_owner_ck
  check (
    visibility_scope <> 'staff_personal'
    or (
      staff_owner_user_id is not null
      and nullif(trim(staff_owner_user_id), '') is not null
    )
  );

alter table public.farm_notebook_entries
  drop constraint if exists farm_notebook_entries_staff_personal_note_only_ck;

alter table public.farm_notebook_entries
  add constraint farm_notebook_entries_staff_personal_note_only_ck
  check (
    visibility_scope <> 'staff_personal'
    or coalesce(entry_kind, 'note') = 'note'
  );

create index if not exists farm_notebook_entries_company_visibility_updated_idx
  on public.farm_notebook_entries (company_id, visibility_scope, updated_at desc);

drop policy if exists "farm_notebook_entries_select_company" on public.farm_notebook_entries;
drop policy if exists "farm_notebook_entries_insert_company" on public.farm_notebook_entries;
drop policy if exists "farm_notebook_entries_update_company" on public.farm_notebook_entries;
drop policy if exists "farm_notebook_entries_delete_company" on public.farm_notebook_entries;

create policy "farm_notebook_entries_select_company"
on public.farm_notebook_entries
for select
to authenticated
using (
  public.fv_is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
    and (
      visibility_scope = 'company'
      or (
        visibility_scope = 'staff_personal'
        and (
          staff_owner_user_id = core.current_user_id()
          or core.is_company_admin(company_id)
        )
      )
    )
  )
);

create policy "farm_notebook_entries_insert_company"
on public.farm_notebook_entries
for insert
to authenticated
with check (
  public.fv_is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
    and (
      visibility_scope = 'company'
      or (
        visibility_scope = 'staff_personal'
        and staff_owner_user_id = core.current_user_id()
      )
    )
  )
);

create policy "farm_notebook_entries_update_company"
on public.farm_notebook_entries
for update
to authenticated
using (
  public.fv_is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
    and (
      visibility_scope = 'company'
      or (
        visibility_scope = 'staff_personal'
        and (
          staff_owner_user_id = core.current_user_id()
          or core.is_company_admin(company_id)
        )
      )
    )
  )
)
with check (
  public.fv_is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
    and (
      visibility_scope = 'company'
      or (
        visibility_scope = 'staff_personal'
        and (
          staff_owner_user_id = core.current_user_id()
          or core.is_company_admin(company_id)
        )
      )
    )
  )
);

create policy "farm_notebook_entries_delete_company"
on public.farm_notebook_entries
for delete
to authenticated
using (
  public.fv_is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
    and (
      visibility_scope = 'company'
      or (
        visibility_scope = 'staff_personal'
        and (
          staff_owner_user_id = core.current_user_id()
          or core.is_company_admin(company_id)
        )
      )
    )
  )
);

commit;

notify pgrst, 'reload schema';
