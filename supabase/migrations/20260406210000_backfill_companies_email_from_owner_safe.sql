-- Safe backfill: core.companies.email from owner_email without violating
-- uq_core_companies_email_global (normalize_email(email) unique globally).
--
-- Fixes two cases the simple UPDATE missed:
-- (1) Another row already has that normalized email.
-- (2) Multiple rows with empty email share the same owner_email — only ONE row
--     per normalized address is updated in this batch (smallest id wins).

with
  candidates as (
    select
      c.id,
      nullif(trim(c.owner_email), '') as new_email
    from core.companies c
    where (c.email is null or trim(c.email) = '')
      and c.owner_email is not null
      and trim(c.owner_email) <> ''
  ),
  already_taken as (
    select public.normalize_email(c.email) as norm
    from core.companies c
    where nullif(public.normalize_email(c.email), '') is not null
  ),
  pick_one as (
    select distinct on (public.normalize_email(c.new_email))
      c.id,
      c.new_email
    from candidates c
    where c.new_email is not null
      and not exists (
        select 1
        from already_taken t
        where t.norm = public.normalize_email(c.new_email)
      )
    order by public.normalize_email(c.new_email), c.id
  )
update core.companies c
set
  email = p.new_email,
  updated_at = now()
from pick_one p
where c.id = p.id;

-- Optional: list companies still missing email (for manual follow-up)
-- select id, name, owner_email, email from core.companies
-- where nullif(trim(email), '') is null;
