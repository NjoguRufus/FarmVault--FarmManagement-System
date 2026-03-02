import { useQuery } from '@tanstack/react-query';
import {
  fetchSubscriptionAnalytics,
  type AnalyticsRangePreset,
  type SubscriptionAnalyticsPayload,
} from '@/services/subscriptionAnalyticsService';

export function useSubscriptionAnalytics(range: AnalyticsRangePreset) {
  const query = useQuery<SubscriptionAnalyticsPayload>({
    queryKey: ['subscription-analytics', range],
    queryFn: () => fetchSubscriptionAnalytics(range),
    staleTime: 60_000,
  });

  return query;
}

