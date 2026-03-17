/**
 * Ensures the Supabase client gets the Clerk session token from React (useAuth),
 * so auth.jwt() is set in Supabase and RLS policies like current_clerk_id() work.
 * Must be mounted inside ClerkProvider.
 *
 * IMPORTANT: You must create a JWT Template in Clerk Dashboard:
 * 1. Go to Clerk Dashboard → JWT Templates
 * 2. Create a new template named "supabase"
 * 3. Use this template:
 *    {
 *      "aud": "authenticated",
 *      "role": "authenticated",
 *      "email": "{{user.primary_email_address}}",
 *      "user_id": "{{user.id}}"
 *    }
 * 4. Set the signing key to your Supabase JWT secret (from Supabase Dashboard → Settings → API → JWT Secret)
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';
import { setClerkTokenGetter } from '@/lib/supabase';

export function ClerkSupabaseTokenBridge() {
  const { getToken, isSignedIn } = useAuth();
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!getToken) {
      setClerkTokenGetter(null);
      return;
    }

    setClerkTokenGetter(async () => {
      try {
        // Try the 'supabase' JWT template first (required for proper Supabase integration)
        // Fall back to default token if template doesn't exist
        let token: string | null = null;

        try {
          token = await getToken({ template: 'supabase' });
        } catch (templateErr) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[ClerkSupabaseTokenBridge] "supabase" JWT template not found, falling back to default token. Create a JWT template in Clerk Dashboard for proper Supabase integration.');
          }
          // Fall back to default session token
          token = await getToken();
        }

        if (token && token !== lastTokenRef.current) {
          lastTokenRef.current = token;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[ClerkSupabaseTokenBridge] Token acquired', {
              hasToken: !!token,
              tokenLength: token?.length,
              isSignedIn,
            });
          }
        }

        return token ?? null;
      } catch (err) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[ClerkSupabaseTokenBridge] Failed to get token:', err);
        }
        return null;
      }
    });

    return () => {
      setClerkTokenGetter(null);
      lastTokenRef.current = null;
    };
  }, [getToken, isSignedIn]);

  return null;
}
