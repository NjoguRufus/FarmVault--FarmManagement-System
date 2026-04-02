/**
 * Uses Clerk hooks and passes snapshot to AuthProvider so auth works when Clerk is available.
 * Must be mounted inside ClerkProvider. Renders AuthProvider + App so AuthProvider never
 * runs without Clerk when this component is used.
 * Snapshot is memoized on primitive values only to avoid AuthContext effect loops.
 */
import React, { useMemo, useCallback } from 'react';
import { useAuth as useClerkAuth, useUser, useSignIn } from '@clerk/react';
import { AuthProvider } from '@/contexts/AuthContext';
import type { ClerkStateSnapshot } from '@/contexts/AuthContext';
import App from '@/App';
import { ClerkSupabaseTokenBridge } from '@/components/auth/ClerkSupabaseTokenBridge';

export function ClerkAuthBridge() {
  const clerk = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();

  const signOut = useCallback(() => {
    void clerk.signOut();
  }, [clerk]);

  const clerkState: ClerkStateSnapshot = useMemo(
    () => ({
      isLoaded: clerk.isLoaded,
      isSignedIn: clerk.isSignedIn ?? false,
      userId: clerk.userId ?? null,
      clerkUser: clerkUser ?? null,
      signInLoaded: signInLoaded ?? false,
      signIn: signIn ?? null,
      setActiveSignIn: setActiveSignIn ?? null,
      signOut,
    }),
    [
      clerk.isLoaded,
      clerk.isSignedIn,
      clerk.userId,
      clerkUser,
      signInLoaded,
      signIn,
      setActiveSignIn,
      signOut,
    ]
  );

  return (
    <AuthProvider clerkState={clerkState}>
      <ClerkSupabaseTokenBridge />
      <App />
    </AuthProvider>
  );
}
