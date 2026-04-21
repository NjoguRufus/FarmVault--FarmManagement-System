import { logger } from "@/lib/logger";
/**
 * Bridges Clerk authentication to Supabase.
 *
 * REQUIRED — Clerk Dashboard → JWT Templates → template name: `supabase`
 * Claims (minimum):
 *   { "sub": "{{user.id}}", "email": "{{user.primary_email_address.email_address}}" }
 *
 * REQUIRED — Supabase Dashboard → Auth → Third-party Auth: Clerk issuer / JWKS so JWTs verify.
 *
 * The `supabase` template ensures `auth.jwt()->>'sub'` is the Clerk user id (default session
 * tokens may not match what RLS and edge functions expect).
 */
import { useLayoutEffect, useEffect, useRef } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { CLERK_JWT_TEMPLATE_SUPABASE, setClerkTokenGetter } from '@/lib/supabase';

/** Match AuthContext transient sign-out grace — avoid dropping the token getter when Clerk flickers (mobile). */
const CLEAR_GETTER_DEBOUNCE_MS = 4500;

export function ClerkSupabaseTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const clearGetterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Register token getter before paint so the first Supabase request after auth uses a Clerk token.
  useLayoutEffect(() => {
    if (clearGetterTimerRef.current) {
      clearTimeout(clearGetterTimerRef.current);
      clearGetterTimerRef.current = null;
    }

    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      if (import.meta.env.DEV) {
        logger.log('[ClerkBridge] Signed out (or transient); debouncing token getter clear');
      }
      clearGetterTimerRef.current = setTimeout(() => {
        clearGetterTimerRef.current = null;
        setClerkTokenGetter(null);
        if (import.meta.env.DEV) {
          logger.log('[ClerkBridge] Token getter cleared after debounce');
        }
      }, CLEAR_GETTER_DEBOUNCE_MS);
      return () => {
        if (clearGetterTimerRef.current) {
          clearTimeout(clearGetterTimerRef.current);
          clearGetterTimerRef.current = null;
        }
      };
    }

    setClerkTokenGetter(async () => {
      try {
        const token = await getToken({ template: CLERK_JWT_TEMPLATE_SUPABASE });
        if (import.meta.env.DEV) {
          logger.log('[ClerkBridge] Token request result:', token ? 'success (token exists)' : 'null (no token)');
        }
        if (!token && import.meta.env.DEV) {
          console.warn(
            `[ClerkBridge] No JWT for template "${CLERK_JWT_TEMPLATE_SUPABASE}". Create it in Clerk Dashboard (JWT Templates) with sub = user id.`,
          );
        }
        return token ?? null;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[ClerkBridge] Failed to get session token:', err);
        }
        return null;
      }
    });

    // Do not clear the getter in cleanup when isSignedIn flips false — that runs before the debounced
    // signed-out branch and caused immediate Supabase → /sign-in redirects on mobile.
    return () => {};
  }, [isLoaded, isSignedIn, getToken]);

  useLayoutEffect(() => {
    return () => {
      if (clearGetterTimerRef.current) {
        clearTimeout(clearGetterTimerRef.current);
        clearGetterTimerRef.current = null;
      }
      setClerkTokenGetter(null);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !isLoaded || !clerk) return;
    const frontendApi = (clerk as unknown as { frontendApi?: string }).frontendApi;
    const publishableKey = (clerk as unknown as { publishableKey?: string }).publishableKey;
    const keyPrefix = publishableKey?.substring(0, 7) || 'unknown';
    const isLive = publishableKey?.startsWith('pk_live_');
    logger.log('[ClerkBridge] Clerk loaded:', isLoaded, 'Signed in:', isSignedIn);
    logger.log(`[ClerkBridge] Frontend API: ${frontendApi || 'not exposed'}, Key: ${keyPrefix}, Live: ${isLive}`);
  }, [isLoaded, isSignedIn, clerk]);

  return null;
}
