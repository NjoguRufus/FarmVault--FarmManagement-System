import { supabase } from '@/lib/supabase';

/**
 * Strict Supabase DB wrapper: always use schema-qualified access.
 * NEVER use supabase.from('table') — it hits public schema and causes RLS/404 issues.
 */
export const db = {
  core: () => supabase.schema('core'),
  projects: () => supabase.schema('projects'),
  harvest: () => supabase.schema('harvest'),
  finance: () => supabase.schema('finance'),
  inventory: () => supabase.schema('inventory'),
  ops: () => supabase.schema('ops'),
  billing: () => supabase.schema('billing'),
  admin: () => supabase.schema('admin'),
  /** Use only for legacy tables that still live in public (e.g. employees). */
  public: () => supabase.schema('public'),
};

/**
 * Tenant guard: throws if companyId is missing so tenant-scoped writes/reads never run without it.
 */
export function requireCompanyId(companyId: string | null | undefined): string {
  if (companyId == null || String(companyId).trim() === '') {
    throw new Error('Missing companyId (tenant not resolved)');
  }
  return companyId;
}
