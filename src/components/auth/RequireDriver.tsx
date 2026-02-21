import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Employee } from '@/types';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireDriverProps {
  children: React.ReactElement;
}

export function RequireDriver({ children }: RequireDriverProps) {
  const { user, isAuthenticated, authReady } = useAuth();
  const location = useLocation();
  const { data: employees = [] } = useCollection<Employee>('employees', 'employees');

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Only check employee role if user is an employee
  if (user?.role === 'employee') {
    const isDriver = employees.some(e => e.id === user.id && e.role === 'logistics-driver');
    if (isDriver) {
      return children;
    }
  }

  return <Navigate to="/dashboard" replace />;
}
