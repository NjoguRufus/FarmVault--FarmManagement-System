import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireDeveloperProps {
  children: React.ReactElement;
}

export function RequireDeveloper({ children }: RequireDeveloperProps) {
  const { user, isAuthenticated, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.role !== 'developer') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

