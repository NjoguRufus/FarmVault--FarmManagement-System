import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { useIsDeveloper } from '@/hooks/useIsDeveloper';

interface DevRouteProps {
  children: React.ReactElement;
}

export function DevRoute({ children }: DevRouteProps) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const location = useLocation();
  const { isDeveloper, loading } = useIsDeveloper();

  if (!isLoaded) {
    return <AuthLoadingScreen />;
  }

  if (!isSignedIn || !userId) {
    return <Navigate to="/dev/sign-in" replace state={{ from: location }} />;
  }

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!isDeveloper) {
    return <Navigate to="/sign-in" replace />;
  }

  return children;
}

