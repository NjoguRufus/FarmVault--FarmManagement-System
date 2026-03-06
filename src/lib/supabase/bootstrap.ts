import { supabase } from '@/lib/supabase';

export interface DeveloperBootstrapResult {
  companyId: string;
  alreadyExists: boolean;
}

export async function developerBootstrapCompany(params: {
  clerkUserId: string;
  clerkOrgId: string | null;
  companyName: string;
  logoUrl?: string | null;
}): Promise<DeveloperBootstrapResult> {
  const { clerkUserId, clerkOrgId, companyName, logoUrl } = params;

  const { data, error } = await supabase.rpc('developer_bootstrap_company', {
    in_clerk_user_id: clerkUserId,
    in_clerk_org_id: clerkOrgId,
    in_name: companyName,
    in_logo_url: logoUrl ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to bootstrap developer company');
  }

  const payload = (data || {}) as { company_id?: unknown; already_exists?: unknown };
  const companyId = String(payload.company_id ?? '');
  const alreadyExists = Boolean(payload.already_exists);

  if (!companyId) {
    throw new Error('Developer bootstrap did not return a company id');
  }

  return { companyId, alreadyExists };
}

