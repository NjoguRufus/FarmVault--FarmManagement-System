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
import { useAuth, useClerk } from '@clerk/react';
import { setClerkTokenGetter } from '@/lib/supabase';

export function ClerkSupabaseTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();

  useEffect(() => {
    // Log Clerk instance info for debugging live vs dev instance issues
    // eslint-disable-next-line no-console
    console.log('[ClerkBridge] Clerk loaded:', isLoaded, 'Signed in:', isSignedIn);
    
    if (isLoaded && clerk) {
      const frontendApi = (clerk as unknown as { frontendApi?: string }).frontendApi;
      const publishableKey = (clerk as unknown as { publishableKey?: string }).publishableKey;
      const keyPrefix = publishableKey?.substring(0, 7) || 'unknown';
      const isLive = publishableKey?.startsWith('pk_live_');
      // eslint-disable-next-line no-console
      console.log(`[ClerkBridge] Frontend API: ${frontendApi || 'not exposed'}, Key: ${keyPrefix}, Live: ${isLive}`);
    }

    // Wait for Clerk to load before setting up the token getter
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      // eslint-disable-next-line no-console
      console.log('[ClerkBridge] User not signed in, clearing token getter');
      setClerkTokenGetter(null);
      return;
    }

    // Set up the token getter - ONLY uses 'supabase' template, NO fallback
    setClerkTokenGetter(async () => {
      try {
        // ONLY request the 'supabase' template - do NOT fall back to default token
        const token = await getToken({ template: 'supabase' });

        // eslint-disable-next-line no-console
        console.log('[ClerkBridge] Token request result:', !!token ? 'success (token exists)' : 'null (no token)');
        
        if (!token) {
          // eslint-disable-next-line no-console
          console.warn('[ClerkBridge] No token returned. Ensure "supabase" JWT template exists in Clerk Dashboard for this instance (dev vs live).');
        }

        return token ?? null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ClerkBridge] Failed to get supabase token:', err);
        return null;
      }
    });

    return () => {
      setClerkTokenGetter(null);
    };
  }, [isLoaded, isSignedIn, getToken, clerk]);

  return null;
}
