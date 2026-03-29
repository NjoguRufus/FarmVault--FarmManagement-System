import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getMyCompanyWorkspaceStatus } from '@/services/companyWorkspaceStatusService';

const QUERY_KEY = 'my-company-workspace-status' as const;

/**
 * core.companies.status for the signed-in tenant (pending vs active vs suspended).
 * Not derived from get_subscription_gate_state — uses get_my_company_workspace_status only.
 */
export function useCompanyWorkspaceApprovalStatus() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: [QUERY_KEY, companyId],
    queryFn: () => getMyCompanyWorkspaceStatus(),
    enabled: Boolean(companyId) && !isDeveloper,
    staleTime: 15_000,
  });

  const norm = (data?.workspace_status ?? '').toLowerCase().trim();

  return {
    companyId,
    workspaceStatus: norm || null,
    isWorkspacePending: norm === 'pending',
    isWorkspaceActive: norm === 'active',
    isWorkspaceSuspended: norm === 'suspended',
    isLoading: Boolean(companyId) && !isDeveloper && isLoading,
    isFetching: Boolean(companyId) && !isDeveloper && isFetching,
    error,
  };
}

export function companyWorkspaceStatusQueryKey(companyId: string | null | undefined) {
  return [QUERY_KEY, companyId ?? null] as const;
}
