import { useCollection } from '@/hooks/useCollection';
import type { ProjectBlock } from '@/types';

export function useProjectBlocks(companyId: string | null, projectId: string | null) {
  return useCollection<ProjectBlock>(
    `project-blocks-${companyId ?? ''}-${projectId ?? ''}`,
    'projectBlocks',
    {
      companyId,
      projectId,
      orderByField: 'createdAt',
      orderByDirection: 'asc',
      enabled: Boolean(companyId && projectId),
    }
  );
}
