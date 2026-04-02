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
import { useLayoutEffect, useEffect } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { setClerkTokenGetter } from '@/lib/supabase';

export function ClerkSupabaseTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();

  // Register token getter before paint so the first Supabase request after auth uses a Clerk token.
  useLayoutEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      if (import.meta.env.DEV) {
        console.log('[ClerkBridge] User not signed in, clearing token getter');
      }
      setClerkTokenGetter(null);
      return;
    }

    setClerkTokenGetter(async () => {
      try {
        const token = await getToken();
        if (import.meta.env.DEV) {
          console.log('[ClerkBridge] Token request result:', token ? 'success (token exists)' : 'null (no token)');
        }
        if (!token && import.meta.env.DEV) {
          console.warn('[ClerkBridge] No token returned. User may not be fully authenticated.');
        }
        return token ?? null;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[ClerkBridge] Failed to get session token:', err);
        }
        return null;
      }
    });

    return () => {
      setClerkTokenGetter(null);
    };
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isLoaded || !clerk) return;
    const frontendApi = (clerk as unknown as { frontendApi?: string }).frontendApi;
    const publishableKey = (clerk as unknown as { publishableKey?: string }).publishableKey;
    const keyPrefix = publishableKey?.substring(0, 7) || 'unknown';
    const isLive = publishableKey?.startsWith('pk_live_');
    console.log('[ClerkBridge] Clerk loaded:', isLoaded, 'Signed in:', isSignedIn);
    console.log(`[ClerkBridge] Frontend API: ${frontendApi || 'not exposed'}, Key: ${keyPrefix}, Live: ${isLive}`);
  }, [isLoaded, isSignedIn, clerk]);

  return null;
}
