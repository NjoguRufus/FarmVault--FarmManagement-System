import { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { db } from '@/lib/db';
import { useToast } from '@/components/ui/use-toast';
import { isDevEmail } from '@/lib/devAccess';

interface UseIsDeveloperState {
  isDeveloper: boolean;
  loading: boolean;
}

export function useIsDeveloper(): UseIsDeveloperState {
  const { user } = useUser();
  const { toast } = useToast();
  const [state, setState] = useState<UseIsDeveloperState>({
    isDeveloper: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const clerkUserId = user?.id ?? null;
    const email = user?.primaryEmailAddress?.emailAddress ?? null;

    if (!clerkUserId) {
      setState({ isDeveloper: false, loading: false });
      return;
    }

    // If email is allowlisted, treat as developer immediately and ensure admin.developers row exists.
    if (isDevEmail(email)) {
      setState({ isDeveloper: true, loading: false });
      void db
        .admin()
        .from('developers')
        .upsert(
          {
            clerk_user_id: clerkUserId,
            email,
            role: 'super_admin',
          },
          { onConflict: 'clerk_user_id' },
        );
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    db
      .admin()
      .from('developers')
      .select('clerk_user_id')
      .eq('clerk_user_id', clerkUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error) {
          // Non-fatal: fall back to non-developer but notify user in dev mode.
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[useIsDeveloper] Failed to check developer status:', error);
          }
          toast({
            title: 'Developer access check failed',
            description: 'We could not verify your developer access. If this persists, contact support.',
            variant: 'destructive',
          });
          setState({ isDeveloper: false, loading: false });
          return;
        }

        setState({
          isDeveloper: Boolean(data?.clerk_user_id),
          loading: false,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[useIsDeveloper] Unexpected error:', error);
        }
        toast({
          title: 'Developer access check failed',
          description: 'We could not verify your developer access. If this persists, contact support.',
          variant: 'destructive',
        });
        setState({ isDeveloper: false, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, toast]);

  return state;
}

