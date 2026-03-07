import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireDeveloperProps {
  children: React.ReactElement;
}

export function RequireDeveloper({ children }: RequireDeveloperProps) {
  const { isAuthenticated, authReady, isDeveloper, user, isEmergencySession } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (isEmergencySession) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isAuthenticated) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Route] Redirecting to /dev/sign-in from RequireDeveloper (not authenticated)', {
        from: location.pathname,
      });
    }
    return <Navigate to="/dev/sign-in" replace state={{ from: location }} />;
  }

  if (!isDeveloper) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Route] Redirecting to /dashboard from RequireDeveloper (not developer)', {
        uid: user?.id,
        companyId: user?.companyId ?? null,
      });
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

