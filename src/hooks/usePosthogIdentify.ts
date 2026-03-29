import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePostHog } from '@posthog/react';
import { useAuth } from '@/contexts/AuthContext';
import { getCompany } from '@/services/companyService';

/**
 * Identify signed-in user (`user.id` = Clerk id, aligns with Supabase `profiles.clerk_user_id`) and attach `company` group.
 * Must run under `PostHogProvider` (use `PosthogAnalyticsInner` only when PostHog is enabled).
 */
export function usePosthogIdentify(): void {
  const posthog = usePostHog();
  const { user, authReady } = useAuth();
  const lastKey = useRef<string>('');

  const companyId = user?.companyId ?? null;

  const { data: companyDoc } = useQuery({
    queryKey: ['posthog-company', companyId],
    queryFn: () => getCompany(companyId!),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });

  const companyName = companyDoc?.name ?? null;
  const plan =
    companyDoc?.subscriptionPlan ?? companyDoc?.subscription?.plan ?? companyDoc?.plan ?? null;

  useEffect(() => {
    if (!posthog?.identify) return;
    if (!authReady || !user?.id) return;

    const fingerprint = [
      user.id,
      user.email ?? '',
      user.role ?? '',
      companyId ?? '',
      companyName ?? '',
      plan ?? '',
    ].join('|');

    if (fingerprint === lastKey.current) return;
    lastKey.current = fingerprint;

    posthog.identify(user.id, {
      email: user.email,
      role: user.role,
      company_id: companyId ?? undefined,
      company_name: companyName ?? undefined,
      plan: plan ?? undefined,
    });

    if (companyId) {
      posthog.group('company', companyId, {
        company_name: companyName ?? undefined,
        plan: plan ?? undefined,
      });
    }
  }, [posthog, authReady, user, companyId, companyName, plan]);
}
