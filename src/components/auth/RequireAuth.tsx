import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { SignInRedirect } from '@/components/auth/SignInRedirect';

interface RequireAuthProps {
  children: React.ReactElement;
}

/**
 * Protects routes: only authenticated users can access. Redirects to /sign-in if not.
 * Does NOT check onboarding; use RequireOnboarding for app routes that need a company.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <SignInRedirect />;
  }

  return children;
}

