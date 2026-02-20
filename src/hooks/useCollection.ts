import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type UseCollectionOptions = {
  /** Refetch interval in ms (e.g. 3000 for near real-time). */
  refetchInterval?: number;
};

export function useCollection<T = any>(
  key: string,
  path: string,
  options?: UseCollectionOptions & { enabled?: boolean }
) {
  return useQuery({
    queryKey: [key, path],
    queryFn: async () => {
      try {
        const snap = await getDocs(collection(db, path));
        return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
      } catch (err) {
        console.error(`[useCollection] Error fetching ${path}:`, err);
        return [] as T[];
      }
    },
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

