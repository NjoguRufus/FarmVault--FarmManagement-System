-- Phase 5: align core.companies.plan with billing vocabulary (basic | pro | enterprise).

begin;

update core.companies c
set plan = case lower(btrim(coalesce(c.plan, '')))
  when 'starter' then 'basic'
  when 'professional' then 'pro'
  else c.plan
end
where lower(btrim(coalesce(c.plan, ''))) in ('starter', 'professional');

comment on column core.companies.plan is
  'Tier shown in admin/settings: basic | pro | enterprise (legacy starter/professional normalized).';

commit;

notify pgrst, 'reload schema';
