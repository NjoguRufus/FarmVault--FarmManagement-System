import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { getTomatoSessionSummary, type TomatoSessionComputedSummary } from '@/services/tomatoHarvestService';

export function useTomatoSessionSummary(companyId: string | null | undefined, sessionId: string | null | undefined) {
  const cid = (companyId ?? '').trim();
  const sid = (sessionId ?? '').trim();

  return useQuery({
    queryKey: ['tomato-session-summary', cid, sid],
    queryFn: () => getTomatoSessionSummary({ companyId: cid, sessionId: sid }),
    enabled: Boolean(cid && sid),
    staleTime: 15_000,
  });
}

export function useTomatoSessionSummaries(companyId: string | null | undefined, sessionIds: string[]) {
  const cid = (companyId ?? '').trim();
  const ids = useMemo(() => [...new Set(sessionIds.filter(Boolean))], [sessionIds]);

  const results = useQueries({
    queries: ids.map((sid) => ({
      queryKey: ['tomato-session-summary', cid, sid],
      queryFn: () => getTomatoSessionSummary({ companyId: cid, sessionId: sid }),
      enabled: Boolean(cid && sid),
      staleTime: 15_000,
    })),
  });

  const bySessionId = useMemo(() => {
    const map = new Map<string, TomatoSessionComputedSummary>();
    for (let i = 0; i < ids.length; i++) {
      const sid = ids[i];
      const data = results[i]?.data;
      if (sid && data) map.set(sid, data);
    }
    return map;
  }, [ids, results]);

  return { results, bySessionId };
}

