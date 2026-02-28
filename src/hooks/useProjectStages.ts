import { useCallback } from 'react';
import { useCollection } from '@/hooks/useCollection';
import { CropStage } from '@/types';

export function useProjectStages(companyId: string | null | undefined, projectId: string | undefined) {
  const enabled = !!companyId && !!projectId;

  const snapshot = useCollection<CropStage>('project-stages', 'projectStages', {
    enabled,
    companyScoped: true,
    companyId: companyId ?? null,
    projectId: projectId ?? null,
  });

  const refetch = useCallback(async () => undefined, []);

  return { ...snapshot, refetch };
}

