import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { where, type QueryConstraint } from 'firebase/firestore';
import type { OperationsWorkCard } from '@/types';
import { useCollection } from '@/hooks/useCollection';

const WORK_CARDS_PATH = 'operationsWorkCards';
const WORK_CARDS_KEY = 'operationsWorkCards';

function useWorkCardsCollection(
  key: string,
  constraints: QueryConstraint[],
  enabled: boolean
) {
  const result = useCollection<OperationsWorkCard>(key, WORK_CARDS_PATH, {
    enabled,
    constraints,
  });

  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error,
    fromCache: result.fromCache,
    hasPendingWrites: result.hasPendingWrites,
  };
}

export function useWorkCardsForManager(managerIds: string[]) {
  const dedupedManagerIds = useMemo(
    () => [...new Set(managerIds)].filter(Boolean).slice(0, 30),
    [managerIds]
  );

  const constraints = useMemo<QueryConstraint[]>(() => {
    if (dedupedManagerIds.length === 0) return [];
    return [where('allocatedManagerId', 'in', dedupedManagerIds)];
  }, [dedupedManagerIds]);

  return useWorkCardsCollection(
    `${WORK_CARDS_KEY}-manager-${dedupedManagerIds.join(',')}`,
    constraints,
    dedupedManagerIds.length > 0
  );
}

export function useWorkCardsForCompany(
  companyId: string | null,
  _options?: { refetchInterval?: number }
) {
  const constraints = useMemo<QueryConstraint[]>(() => {
    if (!companyId) return [];
    return [where('companyId', '==', companyId)];
  }, [companyId]);

  return useWorkCardsCollection(
    `${WORK_CARDS_KEY}-company-${companyId ?? 'none'}`,
    constraints,
    Boolean(companyId)
  );
}

export function useWorkCardsForProject(projectId: string | null) {
  const constraints = useMemo<QueryConstraint[]>(() => {
    if (!projectId) return [];
    return [where('projectId', '==', projectId)];
  }, [projectId]);

  return useWorkCardsCollection(
    `${WORK_CARDS_KEY}-project-${projectId ?? 'none'}`,
    constraints,
    Boolean(projectId)
  );
}

export function useInvalidateWorkCards() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [WORK_CARDS_KEY] });
}
