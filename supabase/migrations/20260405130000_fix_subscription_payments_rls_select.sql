-- Fix: subscription_payments SELECT policy was created in 20240101000002 using
-- the legacy row_company_matches_user() + public.profiles-based current_company_id().
-- That policy is silently broken for Clerk-auth tenants whose sessions are not in
-- public.profiles. Replace it with a core-schema-aware version so company admins
-- can read their own payment history on the billing page.
--
-- 20260322120000 tried to fix this but used `if not exists`, so if the old broken
-- policy was already present it was never replaced. This migration force-drops and
-- recreates it unconditionally.
--
-- Developers continue to see all rows via public.is_developer() (SECURITY DEFINER wrapper
-- over admin.is_developer() — safest to use in RLS context since it handles search_path).
-- Tenants see only rows where company_id matches their active company from
-- core.company_members (resolved through public.current_company_id() which was
-- updated in 20260305000020 and 20260404240000 to use core.company_members).

begin;

-- Drop any existing variant of the select policy (created in 20240101000002 or 20260322120000)
drop policy if exists subscription_payments_select on public.subscription_payments;

-- New policy: developer sees all; tenant sees only their company's rows.
-- Uses public.current_company_id() (uuid) cast to text for the comparison because
-- subscription_payments.company_id is a text column storing uuid strings.
-- Uses public.is_developer() rather than admin.is_developer() directly — both are
-- SECURITY DEFINER and equivalent, but public.* is the safer schema to call from RLS.
create policy subscription_payments_select on public.subscription_payments
  for select
  using (
    public.is_developer()
    or (
      public.current_company_id() is not null
      and company_id = public.current_company_id()::text
    )
  );

commit;

notify pgrst, 'reload schema';
