import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Employee } from '@/types';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireBrokerProps {
  children: React.ReactElement;
}

export function RequireBroker({ children }: RequireBrokerProps) {
  const { user, isAuthenticated, authReady } = useAuth();
  const location = useLocation();
  const { data: employees = [], isLoading: employeesLoading } = useCollection<Employee>('employees', 'employees');

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If user role is directly 'broker', allow access
  if (user?.role === 'broker') {
    return children;
  }

  // If user is employee, allow access if employeeRole is broker (avoids redirect loop while employees load)
  if (user?.role === 'employee') {
    const employeeRole = (user as any).employeeRole as string | undefined;
    if (employeeRole === 'sales-broker' || employeeRole === 'broker') {
      return children;
    }
    // Optional: also allow if employees collection confirms (for users without employeeRole set)
    if (!employeesLoading) {
      const isBrokerEmployee = employees.some(e => e.id === user.id && e.role === 'sales-broker');
      if (isBrokerEmployee) {
        return children;
      }
    } else {
      // Still loading employees: show loading so we don't redirect to /dashboard and cause glitch
      return <AuthLoadingScreen />;
    }
  }

  // Redirect non-brokers to their appropriate dashboard
  return <Navigate to="/dashboard" replace />;
}
