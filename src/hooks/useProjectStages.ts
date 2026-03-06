import { useQuery } from '@tanstack/react-query';
import { listProjectStages } from '@/services/projectsService';
import type { CropStage } from '@/types';

export function useProjectStages(companyId: string | null | undefined, projectId: string | undefined) {
  const enabled = !!companyId && !!projectId;

  const { data, isLoading, error, refetch } = useQuery<CropStage[]>({
    queryKey: ['projectStages', companyId, projectId],
    queryFn: () => listProjectStages(projectId!),
    enabled,
    staleTime: 60_000,
  });

  return {
    data: data ?? [],
    isLoading,
    error,
    fromCache: false,
    hasPendingWrites: false,
    refetch,
  };
}

