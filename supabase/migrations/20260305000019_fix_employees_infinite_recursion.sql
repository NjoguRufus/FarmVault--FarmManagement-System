-- Fix infinite recursion in RLS policy for employees.
-- Root cause: original is_manager() joined against public.employees,
-- which is itself protected by RLS and referenced from employees policies.
-- When PostgREST evaluates employees policies, calling is_manager() would
-- recursively re-enter the same policies via the employees table read.
--
-- Solution: redefine is_manager() so it only inspects public.profiles,
-- keyed by profiles.id = current_clerk_id() (TEXT Clerk user id).

CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = current_clerk_id()
      AND p.role IN ('manager', 'operations-manager')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

