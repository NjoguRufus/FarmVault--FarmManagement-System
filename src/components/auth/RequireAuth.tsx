import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireAuthProps {
  children: React.ReactElement;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, authReady, setupIncomplete } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (setupIncomplete) {
    return (
      <Navigate
        to="/setup-company"
        replace
        state={{ from: location, message: 'Your company setup is incomplete. Please finish setup.' }}
      />
    );
  }

  return children;
}

