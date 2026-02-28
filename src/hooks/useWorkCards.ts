import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { where, type QueryConstraint } from 'firebase/firestore';
import type { OperationsWorkCard } from '@/types';
import { useCollection } from '@/hooks/useCollection';

const WORK_CARDS_PATH = 'operationsWorkCards';
const WORK_CARDS_KEY = 'operationsWorkCards';

function useWorkCardsCollection(
  key: string,
  options: {
    enabled: boolean;
    companyId: string | null;
    projectId?: string | null;
    constraints?: QueryConstraint[];
  }
) {
  const result = useCollection<OperationsWorkCard>(key, WORK_CARDS_PATH, {
    enabled: options.enabled,
    companyScoped: true,
    companyId: options.companyId,
    projectId: options.projectId ?? undefined,
    constraints: options.constraints ?? [],
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error,
    fromCache: result.fromCache,
    hasPendingWrites: result.hasPendingWrites,
  };
}

export function useWorkCardsForManager(
  managerIds: string[],
  companyId?: string | null
) {
  const dedupedManagerIds = useMemo(
    () => [...new Set(managerIds)].filter(Boolean).slice(0, 30),
    [managerIds]
  );

  const constraints = useMemo<QueryConstraint[]>(() => {
    if (dedupedManagerIds.length === 0) return [];
    return [where('allocatedManagerId', 'in', dedupedManagerIds)];
  }, [dedupedManagerIds]);

  const enabled = dedupedManagerIds.length > 0 && (companyId !== undefined ? Boolean(companyId) : true);

  return useWorkCardsCollection(
    `${WORK_CARDS_KEY}-manager-${companyId ?? 'all'}-${dedupedManagerIds.join(',')}`,
    {
      enabled,
      companyId: companyId ?? null,
      constraints,
    }
  );
}

export function useWorkCardsForCompany(
  companyId: string | null,
  _options?: { refetchInterval?: number }
) {
  return useWorkCardsCollection(
    `${WORK_CARDS_KEY}-company-${companyId ?? 'none'}`,
    {
      enabled: Boolean(companyId),
      companyId,
    }
  );
}

export function useWorkCardsForProject(
  projectId: string | null,
  companyId?: string | null
) {
  const enabled = Boolean(projectId && companyId);

  return useWorkCardsCollection(
    `${WORK_CARDS_KEY}-project-${projectId ?? 'none'}-${companyId ?? 'all'}`,
    {
      enabled,
      companyId: companyId ?? null,
      projectId: projectId ?? null,
    }
  );
}

export function useInvalidateWorkCards() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [WORK_CARDS_KEY] });
}
