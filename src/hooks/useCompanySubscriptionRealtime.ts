import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { companyWorkspaceStatusQueryKey } from '@/hooks/useCompanyWorkspaceApprovalStatus';
import { logger } from "@/lib/logger";

/** Force in-flight network refetch so plan/status update on screen immediately (not next stale window). */
function refetchWorkspaceBillingQueries(queryClient: QueryClient, companyId: string) {
  void Promise.all([
    queryClient.refetchQueries({ queryKey: ['subscription-gate', companyId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['company-mpesa-stk-confirmed', companyId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['company-subscription-row', companyId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['subscription-payment-pending', companyId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['subscription-payments-supabase', companyId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['company-billing', companyId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['billing-receipts', 'company', companyId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: companyWorkspaceStatusQueryKey(companyId), type: 'active' }),
  ]);
}

/**
 * When `company_subscriptions`, `subscription_payments`, or `mpesa_payments` change (dev approval, STK, manual verify),
 * refetch gate + billing queries immediately.
 */
export function useCompanySubscriptionRealtime(companyId: string | null | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId || !enabled) return;

    const cid = companyId.trim().toLowerCase();
    const subFilter = `company_id=eq.${cid}`;
    const payFilter = `company_id=eq.${cid}`;
    const mpesaFilter = `company_id=eq.${companyId.trim()}`;
    const channelName = `workspace_subscription_billing:${companyId}`;

    const companyCoreFilter = `id=eq.${companyId.trim()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'core', table: 'companies', filter: companyCoreFilter },
        (payload) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            logger.log('[SubscriptionRealtime] core.companies change', {
              companyId,
              event: payload.eventType,
            });
          }
          refetchWorkspaceBillingQueries(queryClient, companyId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_subscriptions', filter: subFilter },
        (payload) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            logger.log('[SubscriptionRealtime] company_subscriptions change', {
              companyId,
              event: payload.eventType,
            });
          }
          refetchWorkspaceBillingQueries(queryClient, companyId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscription_payments', filter: payFilter },
        (payload) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            logger.log('[SubscriptionRealtime] subscription_payments change', {
              companyId,
              event: payload.eventType,
            });
          }
          refetchWorkspaceBillingQueries(queryClient, companyId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mpesa_payments', filter: mpesaFilter },
        (payload) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            logger.log('[SubscriptionRealtime] mpesa_payments change', {
              companyId,
              event: payload.eventType,
            });
          }
          refetchWorkspaceBillingQueries(queryClient, companyId);
        },
      )
      .subscribe((status) => {
        if (import.meta.env.DEV && status === 'SUBSCRIBED') {
          // eslint-disable-next-line no-console
          logger.log('[SubscriptionRealtime] subscribed', { channelName });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, enabled, queryClient]);
}
