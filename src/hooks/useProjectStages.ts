import { useCallback, useMemo } from 'react';
import { where } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { CropStage } from '@/types';

export function useProjectStages(companyId: string | null | undefined, projectId: string | undefined) {
  const enabled = !!companyId && !!projectId;
  const constraints = useMemo(
    () =>
      enabled
        ? [where('companyId', '==', companyId), where('projectId', '==', projectId)]
        : [],
    [enabled, companyId, projectId],
  );

  const snapshot = useCollection<CropStage>('project-stages', 'projectStages', {
    enabled,
    constraints,
  });

  // Keep the same surface expected by callers that previously used React Query.
  const refetch = useCallback(async () => undefined, []);

  return { ...snapshot, refetch };
}

