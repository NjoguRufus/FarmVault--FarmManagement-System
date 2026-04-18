import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { resolveStaffShellEntryOrHome } from '@/lib/access/effectiveAccess';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { useUserRole } from '@/hooks/useUserRole';

interface RequireBrokerProps {
  children: React.ReactElement;
}

export function RequireBroker({ children }: RequireBrokerProps) {
  const { isAuthenticated, authReady, effectiveAccess } = useAuth();
  const { loading, role } = useUserRole();
  const location = useLocation();

  if (!authReady || loading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (role === 'BROKER') {
    return children;
  }

  return <Navigate to={resolveStaffShellEntryOrHome(effectiveAccess.landingPage)} replace />;
}
