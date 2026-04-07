import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';

export type FarmerSmartInboxRow = {
  id: string;
  company_id: string;
  clerk_user_id: string;
  slot: 'morning' | 'evening' | 'weekly';
  category: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  dismissed_at: string | null;
  created_at: string;
};

export function useFarmerSmartInbox(companyId: string | null, clerkUserId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['farmer_smart_inbox', companyId ?? '', clerkUserId ?? ''],
    queryFn: async (): Promise<FarmerSmartInboxRow[]> => {
      if (!companyId?.trim() || !clerkUserId?.trim()) return [];
      const { data, error } = await db
        .public()
        .from('farmer_smart_inbox')
        .select('id,company_id,clerk_user_id,slot,category,title,body,metadata,dismissed_at,created_at')
        .eq('company_id', companyId.trim())
        .eq('clerk_user_id', clerkUserId.trim())
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as FarmerSmartInboxRow[];
    },
    enabled: Boolean(companyId?.trim() && clerkUserId?.trim()),
    staleTime: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .public()
        .from('farmer_smart_inbox')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['farmer_smart_inbox', companyId ?? '', clerkUserId ?? ''],
      });
    },
  });

  const latest = q.data?.[0] ?? null;
  const maxAgeMs = 52 * 60 * 60 * 1000;
  const visible =
    latest && Date.now() - new Date(latest.created_at).getTime() <= maxAgeMs ? latest : null;

  return {
    ...q,
    latestVisible: visible,
    dismiss: dismiss.mutateAsync,
    dismissing: dismiss.isPending,
  };
}
