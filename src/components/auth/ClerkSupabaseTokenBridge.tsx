/**
 * Bridges Clerk authentication to Supabase.
 * 
 * Uses the NATIVE Clerk-Supabase integration (no JWT template required).
 * This is the modern approach as of April 2025 - simpler and more reliable.
 *
 * REQUIRED: Register your Clerk domain in Supabase Dashboard → Auth → Third-party Auth
 * 
 * The native integration uses Clerk's standard session token which:
 * - Is signed with Clerk's JWKS (verifiable via Clerk's public keys)
 * - Automatically includes the "role": "authenticated" claim when the integration is enabled
 * - No need to share Supabase JWT secret with Clerk
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

    // Set up the token getter using NATIVE integration (no template)
    setClerkTokenGetter(async () => {
      try {
        // Use standard session token - no template needed with native Supabase integration
        // Clerk automatically adds "role": "authenticated" when Supabase integration is enabled
        const token = await getToken();

        // eslint-disable-next-line no-console
        console.log('[ClerkBridge] Token request result:', !!token ? 'success (token exists)' : 'null (no token)');
        
        if (!token) {
          // eslint-disable-next-line no-console
          console.warn('[ClerkBridge] No token returned. User may not be fully authenticated.');
        }

        return token ?? null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ClerkBridge] Failed to get session token:', err);
        return null;
      }
    });

    return () => {
      setClerkTokenGetter(null);
    };
  }, [isLoaded, isSignedIn, getToken, clerk]);

  return null;
}
