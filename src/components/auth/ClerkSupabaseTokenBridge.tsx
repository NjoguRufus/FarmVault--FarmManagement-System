/**
 * Bridges Clerk authentication to Supabase.
 * 
 * ONLY uses the 'supabase' JWT template - NO fallback to default Clerk tokens.
 * This ensures Supabase receives a properly formatted JWT with the required claims.
 *
 * REQUIRED: Create a JWT Template named "supabase" in Clerk Dashboard with these claims:
 * {
 *   "aud": "authenticated",
 *   "role": "authenticated",
 *   "email": "{{user.primary_email_address}}",
 *   "user_id": "{{user.id}}"
 * }
 *
 * Then register your Clerk domain in Supabase: Dashboard → Auth → Third-party Auth
 */
import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setClerkTokenGetter } from '@/lib/supabase';

export function ClerkSupabaseTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    // Wait for Clerk to load before setting up the token getter
    if (!isLoaded) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[ClerkBridge] Waiting for Clerk to load...');
      }
      return;
    }

    if (!isSignedIn) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[ClerkBridge] User not signed in, clearing token getter');
      }
      setClerkTokenGetter(null);
      return;
    }

    // Set up the token getter - ONLY uses 'supabase' template, NO fallback
    setClerkTokenGetter(async () => {
      try {
        // ONLY request the 'supabase' template - do NOT fall back to default token
        const token = await getToken({ template: 'supabase' });

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[ClerkBridge] Token request result:', !!token ? 'success' : 'null');
          
          if (!token) {
            // eslint-disable-next-line no-console
            console.warn('[ClerkBridge] No token returned. Ensure "supabase" JWT template exists in Clerk Dashboard.');
          }
        }

        return token ?? null;
      } catch (err) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[ClerkBridge] Failed to get supabase token:', err);
        }
        return null;
      }
    });

    return () => {
      setClerkTokenGetter(null);
    };
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
