import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { useUserRole } from '@/hooks/useUserRole';

interface RequireNotBrokerProps {
  children: React.ReactElement;
  /** Where to redirect brokers. Defaults to /broker. */
  redirectTo?: string;
}

export function RequireNotBroker({ children, redirectTo = '/broker' }: RequireNotBrokerProps) {
  const { user, authReady } = useAuth();
  const { loading, role } = useUserRole();

  if (!authReady || loading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return children;
  }

  const to = redirectTo.replace(/\/+/g, '/');
  if (role === 'BROKER') {
    return <Navigate to={to} replace />;
  }

  return children;
}
