import { useQuery } from '@tanstack/react-query';
import { fetchLaunchMonitoringMetrics } from '@/services/launchMonitoringService';

const REFETCH_MS = 45_000;

export function useLaunchMetrics(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: ['developer', 'launch-monitoring-metrics'],
    queryFn: fetchLaunchMonitoringMetrics,
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? REFETCH_MS : false,
    refetchOnWindowFocus: true,
  });
}
