import { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { isDevEmail } from '@/lib/devAccess';
import { getClerkUserEmail } from '@/lib/clerkUserEmail';

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
    const email = getClerkUserEmail(user);

    if (!clerkUserId) {
      setState({ isDeveloper: false, loading: false });
      return;
    }

    // If email is allowlisted, treat as developer immediately and ensure developer record via public RPC.
    if (isDevEmail(email)) {
      setState({ isDeveloper: true, loading: false });
      void supabase.rpc('bootstrap_developer', { _email: email ?? null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    supabase
      .rpc('is_developer')
      .then(({ data: isDev, error }) => {
        if (cancelled) return;

        if (error) {
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
          isDeveloper: isDev === true,
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
  }, [user?.id, user?.primaryEmailAddress?.emailAddress, user?.email, toast]);

  return state;
}

