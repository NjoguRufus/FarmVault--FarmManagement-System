import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWorkCardsForCompany,
  getWorkCardsForManager,
  getWorkCardById,
  type WorkCard,
} from '@/services/operationsWorkCardService';

const QUERY_KEY_BASE = 'ops.workCards';

export function useWorkCardsForCompany(
  companyId: string | null | undefined,
  options?: { farmId?: string | null; projectId?: string | null; enabled?: boolean }
) {
  const enabled = Boolean(companyId) && (options?.enabled ?? true);
  const farmId = options?.farmId ?? null;
  const projectId = options?.projectId ?? null;

  const queryKey = [QUERY_KEY_BASE, 'company', companyId ?? 'none', farmId ?? 'all-farms', projectId ?? 'all-projects'];

  const query = useQuery<WorkCard[]>({
    queryKey,
    enabled,
    queryFn: () =>
      getWorkCardsForCompany({
        companyId: companyId as string,
        farmId,
        projectId,
      }),
  });

  return {
    workCards: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useWorkCardsForManager(
  companyId: string | null | undefined,
  managerId: string | null | undefined,
  options?: { farmId?: string | null; projectId?: string | null; enabled?: boolean }
) {
  const enabled =
    Boolean(companyId) && Boolean(managerId) && (options?.enabled ?? true);
  const farmId = options?.farmId ?? null;
  const projectId = options?.projectId ?? null;

  const queryKey = [
    QUERY_KEY_BASE,
    'manager',
    companyId ?? 'none',
    managerId ?? 'none',
    farmId ?? 'all-farms',
    projectId ?? 'all',
  ];

  const query = useQuery<WorkCard[]>({
    queryKey,
    enabled,
    queryFn: () =>
      getWorkCardsForManager({
        companyId: companyId as string,
        managerId: managerId as string,
        farmId,
        projectId,
      }),
  });

  return {
    workCards: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useWorkCard(id: string | null | undefined) {
  const enabled = Boolean(id);
  const queryKey = [QUERY_KEY_BASE, 'single', id ?? 'none'];

  const query = useQuery<WorkCard | null>({
    queryKey,
    enabled,
    queryFn: () => getWorkCardById(id as string),
  });

  return {
    workCard: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Convenience hook for fetching work cards for a single project in a company.
 * Used by dashboards that only care about one active project context.
 */
export function useWorkCardsForProject(
  projectId: string | null | undefined,
  companyId: string | null | undefined
) {
  const enabled = Boolean(companyId) && Boolean(projectId);
  const queryKey = [QUERY_KEY_BASE, 'project', companyId ?? 'none', projectId ?? 'none'];

  const query = useQuery<WorkCard[]>({
    queryKey,
    enabled,
    queryFn: () =>
      getWorkCardsForCompany({
        companyId: companyId as string,
        projectId: projectId ?? null,
      }),
  });

  return {
    workCards: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Helper hook to invalidate all work card queries after a mutation
 * (create/update/approve/reject/pay). Use this so dashboards and lists stay in sync.
 */
export function useInvalidateWorkCards() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY_BASE] });
  };
}



