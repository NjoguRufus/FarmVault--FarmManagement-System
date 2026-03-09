import React, { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/hooks/useCompanyScope';
import { getCompany } from '@/services/companyService';
import { EMPLOYEE_ROLE_LABELS, type EmployeeRoleKey } from '@/config/accessControl';
import type { PermissionMap } from '@/types';

interface StaffContextValue {
  employeeId: string | null;
  fullName: string | null;
  roleKey: string | null;
  roleLabel: string | null;
  permissions: PermissionMap;
  companyId: string | null;
  companyName: string | null;
}

const StaffContext = createContext<StaffContextValue | undefined>(undefined);

export function StaffProvider({ children }: { children: ReactNode }) {
  const { user, employeeProfile, permissions } = useAuth();
  const scope = useCompanyScope();

  const companyId = (employeeProfile?.companyId as string | null) ?? (user?.companyId as string | null) ?? scope.companyId ?? null;

  const { data: company } = useQuery({
    queryKey: ['staffCompany', companyId],
    queryFn: () => (companyId ? getCompany(companyId) : Promise.resolve(null)),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const fullName: string | null =
    employeeProfile?.fullName ??
    employeeProfile?.name ??
    user?.email ??
    null;

  const rawRole: string | null =
    (employeeProfile?.employeeRole as string | null) ??
    (employeeProfile?.role as string | null) ??
    null;

  const normalizedRoleKey = rawRole ? (rawRole.toLowerCase() as EmployeeRoleKey | string) : null;
  const knownRoleKey = (normalizedRoleKey && (EMPLOYEE_ROLE_LABELS as Record<string, string>)[normalizedRoleKey])
    ? (normalizedRoleKey as EmployeeRoleKey)
    : null;

  const roleLabel =
    (knownRoleKey ? EMPLOYEE_ROLE_LABELS[knownRoleKey as EmployeeRoleKey] : null) ??
    (rawRole ? rawRole.replace(/_/g, ' ') : null);

  const value: StaffContextValue = {
    employeeId: employeeProfile?.id ?? null,
    fullName,
    roleKey: normalizedRoleKey,
    roleLabel,
    permissions,
    companyId,
    companyName: company?.name ?? null,
  };

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffContextValue {
  const ctx = useContext(StaffContext);
  if (!ctx) {
    throw new Error('useStaff must be used within a StaffProvider');
  }
  return ctx;
}

