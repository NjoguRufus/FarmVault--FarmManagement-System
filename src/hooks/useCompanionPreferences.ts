import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';

export type CompanionPreferences = {
  id?: string;
  clerk_user_id: string;
  morning_enabled: boolean;
  evening_enabled: boolean;
  inactivity_enabled: boolean;
  weekly_summary_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  preferred_time_zone: string;
};

const DEFAULTS: Omit<CompanionPreferences, 'clerk_user_id'> = {
  morning_enabled: true,
  evening_enabled: true,
  inactivity_enabled: true,
  weekly_summary_enabled: true,
  email_enabled: true,
  in_app_enabled: true,
  preferred_time_zone: 'Africa/Nairobi',
};

export function useCompanionPreferences(clerkUserId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['companion_preferences', clerkUserId ?? ''],
    queryFn: async (): Promise<CompanionPreferences> => {
      if (!clerkUserId?.trim()) {
        return { ...DEFAULTS, clerk_user_id: '' };
      }
      const { data, error } = await db
        .public()
        .from('notification_preferences')
        .select('*')
        .eq('clerk_user_id', clerkUserId.trim())
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...DEFAULTS, clerk_user_id: clerkUserId };
      return data as CompanionPreferences;
    },
    enabled: Boolean(clerkUserId?.trim()),
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<Omit<CompanionPreferences, 'clerk_user_id' | 'id'>>) => {
      if (!clerkUserId?.trim()) throw new Error('Not authenticated');
      const { error } = await db
        .public()
        .from('notification_preferences')
        .upsert(
          { clerk_user_id: clerkUserId.trim(), ...patch, updated_at: new Date().toISOString() },
          { onConflict: 'clerk_user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companion_preferences', clerkUserId ?? ''] });
    },
  });

  const prefs: CompanionPreferences = query.data ?? { ...DEFAULTS, clerk_user_id: clerkUserId ?? '' };

  function toggle(field: keyof Omit<CompanionPreferences, 'clerk_user_id' | 'id' | 'preferred_time_zone'>) {
    const current = prefs[field] as boolean;
    updateMutation.mutate({ [field]: !current });
  }

  return {
    prefs,
    isLoading: query.isLoading,
    isSaving: updateMutation.isPending,
    toggle,
    update: updateMutation.mutateAsync,
  };
}
