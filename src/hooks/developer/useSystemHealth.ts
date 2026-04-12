import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeSystemHealthCheck } from '@/lib/developer/invokeSystemHealthCheck';
import { fetchSystemHealthLogs, fetchSystemHealthSnapshot } from '@/services/systemHealthService';

const SNAPSHOT_KEY = ['developer', 'system-health', 'snapshot'] as const;
const LOGS_KEY = ['developer', 'system-health', 'logs'] as const;

export function useSystemHealthSnapshot(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchSystemHealthSnapshot,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    refetchInterval: options?.enabled ? 120_000 : false,
  });
}

export function useSystemHealthLogs(limit = 20, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...LOGS_KEY, limit],
    queryFn: () => fetchSystemHealthLogs(limit),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useRunSystemHealthCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invokeSystemHealthCheck,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
      void queryClient.invalidateQueries({ queryKey: LOGS_KEY });
    },
  });
}
