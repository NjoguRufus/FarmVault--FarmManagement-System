import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireAuthProps {
  children: React.ReactElement;
}

/**
 * Protects routes: only authenticated users can access. Redirects to /sign-in if not.
 * Does NOT check onboarding; use RequireOnboarding for app routes that need a company.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return children;
}

