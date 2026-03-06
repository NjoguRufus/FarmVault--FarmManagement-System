import { useQuery } from '@tanstack/react-query';
import {
  fetchSubscriptionAnalyticsRpc,
  type AnalyticsRangePreset,
  type SubscriptionAnalyticsPayload,
} from '@/services/subscriptionAnalyticsService';

export function useSubscriptionAnalytics(range: AnalyticsRangePreset) {
  const query = useQuery<SubscriptionAnalyticsPayload>({
    queryKey: ['subscription-analytics', range],
    queryFn: () => fetchSubscriptionAnalyticsRpc(range),
    staleTime: 60_000,
  });

  return query;
}

