-- Fix infinite recursion in RLS policies for public.employees.
-- Root cause: is_manager() previously joined against employees, while
-- employees RLS policies also referenced is_manager(), creating a
-- recursive dependency chain.
--
-- This migration redefines is_manager() so it depends only on profiles,
-- not employees. Policies can continue to call is_manager() safely.

CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_clerk_id()
      AND p.role = 'manager'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

