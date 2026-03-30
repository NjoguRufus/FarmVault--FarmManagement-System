import { useQuery } from '@tanstack/react-query';
import { listCompanyProjectStages } from '@/services/projectsService';
import type { CropStage } from '@/types';

/**
 * All crop stages for the current company (`projects.project_stages`), for dashboards and multi-project views.
 */
export function useCompanyProjectStages(companyId: string | null | undefined) {
  const enabled = Boolean(companyId);

  const { data, isLoading, error, refetch } = useQuery<CropStage[]>({
    queryKey: ['projectStages', companyId ?? 'none'],
    queryFn: () => listCompanyProjectStages(companyId!),
    enabled,
    staleTime: 30_000,
  });

  return {
    data: data ?? [],
    isLoading,
    error,
    refetch,
  };
}
