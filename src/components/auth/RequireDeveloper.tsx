import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { logger } from "@/lib/logger";

interface RequireDeveloperProps {
  children: React.ReactElement;
}

export function RequireDeveloper({ children }: RequireDeveloperProps) {
  const { isAuthenticated, authReady, isDeveloper, user, isEmergencySession, effectiveAccess } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (isEmergencySession) {
    return <Navigate to="/home" replace />;
  }

  if (!isAuthenticated) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.log('[Route] Redirecting to /dev/sign-in from RequireDeveloper (not authenticated)', {
        from: location.pathname,
      });
    }
    return <Navigate to="/dev/sign-in" replace state={{ from: location }} />;
  }

  if (!isDeveloper) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.log('[Route] Redirecting to /home from RequireDeveloper (not developer)', {
        uid: user?.id,
        companyId: user?.companyId ?? null,
      });
    }
    const dest = effectiveAccess.landingPage;
    if (dest && dest !== '/developer') {
      return <Navigate to={dest} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
}

