import { useQuery } from '@tanstack/react-query';
import { getAuditLogsForWorkCard, type WorkCardAuditLog } from '@/services/operationsWorkCardService';

const QUERY_KEY_BASE = 'ops.workCards.auditLogs';

export function useWorkCardAuditLogs(workCardId: string | null | undefined) {
  const enabled = Boolean(workCardId);

  const query = useQuery<WorkCardAuditLog[]>({
    queryKey: [QUERY_KEY_BASE, workCardId ?? 'none'],
    enabled,
    queryFn: () => getAuditLogsForWorkCard(workCardId as string),
  });

  return {
    auditLogs: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

