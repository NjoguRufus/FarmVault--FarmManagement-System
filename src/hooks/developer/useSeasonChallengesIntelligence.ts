import { useQuery } from '@tanstack/react-query';
import { getSeasonChallengesIntelligence, type SeasonChallengesIntelligence } from '@/services/developerService';

export function useSeasonChallengesIntelligence() {
  return useQuery<SeasonChallengesIntelligence>({
    queryKey: ['developer', 'season-challenges-intel'],
    queryFn: getSeasonChallengesIntelligence,
  });
}

