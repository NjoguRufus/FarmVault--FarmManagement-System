import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * When `company_subscriptions` updates for this company (e.g. dev clicks Activate),
 * invalidate subscription queries so the tenant UI moves off pending approval without a full reload.
 */
export function useCompanySubscriptionRealtime(companyId: string | null | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId || !enabled) return;

    const filter = `company_id=eq.${companyId}`;
    const channelName = `company_subscriptions:${companyId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_subscriptions', filter },
        (payload) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[SubscriptionRealtime] company_subscriptions change', {
              companyId,
              event: payload.eventType,
            });
          }
          void queryClient.invalidateQueries({ queryKey: ['subscription-gate', companyId] });
          void queryClient.invalidateQueries({ queryKey: ['company-subscription', companyId] });
          void queryClient.invalidateQueries({ queryKey: ['company-subscription-row', companyId] });
          void queryClient.invalidateQueries({ queryKey: ['subscription-payments-supabase', companyId] });
          void queryClient.invalidateQueries({ queryKey: ['company-billing', companyId] });
        },
      )
      .subscribe((status) => {
        if (import.meta.env.DEV && status === 'SUBSCRIBED') {
          // eslint-disable-next-line no-console
          console.log('[SubscriptionRealtime] subscribed', { channelName });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, enabled, queryClient]);
}
