import { QueryClient } from '@tanstack/react-query';

function queryShouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const status = (error as { status?: number; code?: string })?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  const code = (error as { code?: string })?.code;
  if (code === 'PGRST116') return false;
  return true;
}

/**
 * Global React Query defaults tuned to reduce Supabase reads (Disk IO):
 * - No refetch on every tab focus (major source of duplicate RPCs).
 * - Sensible stale window so navigations reuse cache.
 * - Bounded retries to avoid hammering Postgres on errors.
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: queryShouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
