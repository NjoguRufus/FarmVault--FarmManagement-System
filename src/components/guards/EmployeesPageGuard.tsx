/**
 * Guards the Employees page: requires employees.view permission and active employee status.
 * Identity from Clerk; employee from useCurrentEmployee (Supabase data only).
 */
import React, { ReactNode } from 'react';
import { useCurrentEmployee } from '@/hooks/useCurrentEmployee';
import { can } from '@/lib/employees/can';
import { useAuth } from '@clerk/react';

interface EmployeesPageGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function EmployeesPageGuard({ children, fallback = null }: EmployeesPageGuardProps) {
  const { userId } = useAuth();
  const { employee, isLoading } = useCurrentEmployee();

  if (!userId) {
    return <>{fallback}</>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading…
      </div>
    );
  }

  const hasView = employee ? can(employee.permissions, 'employees.view') : false;
  const isBlocked = employee && employee.status === 'suspended';
  const allowed = hasView && !isBlocked;

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="p-6 text-center text-muted-foreground">
        You don’t have access to the Employees section or your account is suspended.
      </div>
    );
  }

  return <>{children}</>;
}
