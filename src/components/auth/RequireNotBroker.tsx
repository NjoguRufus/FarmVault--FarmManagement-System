import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Employee } from '@/types';

interface RequireNotBrokerProps {
  children: React.ReactElement;
  /** Where to redirect brokers. Defaults to /broker. Use /broker/harvest-sales for harvest-sales route. */
  redirectTo?: string;
}

export function RequireNotBroker({ children, redirectTo = '/broker' }: RequireNotBrokerProps) {
  const { user } = useAuth();
  const { data: employees = [] } = useCollection<Employee>('employees', 'employees');

  if (!user) {
    return children;
  }

  const to = redirectTo.replace(/\/+/g, '/');
  if (user.role === 'broker') {
    return <Navigate to={to} replace />;
  }

  if (user.role === 'employee') {
    const employeeRole = (user as any).employeeRole as string | undefined;
    // Check both user.employeeRole and employees collection
    const isBrokerEmployee = 
      employeeRole === 'sales-broker' || 
      employeeRole === 'broker' ||
      employees.some((e) => e.id === user.id && e.role === 'sales-broker');
    if (isBrokerEmployee) {
      return <Navigate to={to} replace />;
    }
  }

  return children;
}
