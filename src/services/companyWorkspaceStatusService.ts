import { supabase } from '@/lib/supabase';

export type CompanyWorkspaceLifecycleStatus = 'pending' | 'active' | 'suspended';

export type MyCompanyWorkspaceStatusRow = {
  company_id: string;
  workspace_status: CompanyWorkspaceLifecycleStatus | string;
};

/**
 * Reads core.companies.status for the current JWT context only (via get_my_company_workspace_status).
 */
export async function getMyCompanyWorkspaceStatus(): Promise<MyCompanyWorkspaceStatusRow | null> {
  const { data, error } = await supabase.rpc('get_my_company_workspace_status');
  if (error) {
    throw new Error(error.message ?? 'Failed to load workspace status');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const rec = row as { company_id?: string; workspace_status?: string };
  const cid = rec.company_id != null ? String(rec.company_id) : '';
  if (!cid) return null;
  const ws = String(rec.workspace_status ?? '')
    .toLowerCase()
    .trim();
  return {
    company_id: cid,
    workspace_status: ws,
  };
}
