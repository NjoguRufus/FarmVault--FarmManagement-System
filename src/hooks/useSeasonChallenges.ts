/**
 * Single source of truth for season challenges per project.
 * Use this hook everywhere challenges are shown: Project Details, Plan Season, Season Challenges page.
 * Invalidate with queryKey ['seasonChallenges'] (or the project-specific key) after create/update/delete
 * so all views stay in sync.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listSeasonChallenges } from '@/services/seasonChallengesService';
import type { SeasonChallenge } from '@/types';

export const SEASON_CHALLENGES_QUERY_KEY = 'seasonChallenges';

export function getSeasonChallengesQueryKey(companyId: string, projectId?: string | null) {
  return [SEASON_CHALLENGES_QUERY_KEY, companyId, projectId ?? 'all'] as const;
}

/**
 * Fetch season challenges for a company, optionally scoped to one project.
 * - projectId set: Project Details and Plan Season use this so they only see that project's challenges.
 * - projectId null/undefined: Season Challenges page can use this to get all company challenges (or pass activeProject.id to scope).
 */
export function useSeasonChallenges(
  companyId: string | null,
  projectId?: string | null
): {
  challenges: SeasonChallenge[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const queryClient = useQueryClient();
  const key = getSeasonChallengesQueryKey(companyId ?? '', projectId);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => listSeasonChallenges(companyId!, projectId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  if (import.meta.env?.DEV && companyId && !isLoading) {
    console.log('[useSeasonChallenges]', {
      companyId,
      projectId: projectId ?? 'all',
      count: data?.length ?? 0,
    });
  }

  return {
    challenges: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch: () => {
      if (import.meta.env?.DEV) {
        console.log('[useSeasonChallenges] refetch', { companyId, projectId });
      }
      queryClient.invalidateQueries({ queryKey: [SEASON_CHALLENGES_QUERY_KEY] });
    },
  };
}

/**
 * Call after create/update/delete so Project Details, Plan Season, and Season Challenges page all refetch.
 */
export function invalidateSeasonChallengesQuery(queryClient: ReturnType<typeof useQueryClient>) {
  if (import.meta.env?.DEV) {
    console.log('[useSeasonChallenges] invalidateSeasonChallengesQuery (post-mutation refetch)');
  }
  queryClient.invalidateQueries({ queryKey: [SEASON_CHALLENGES_QUERY_KEY] });
}
