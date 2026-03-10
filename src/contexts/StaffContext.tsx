import React, { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/hooks/useCompanyScope';
import { getCompany } from '@/services/companyService';
import { db } from '@/lib/db';
import { EMPLOYEE_ROLE_LABELS, type EmployeeRoleKey } from '@/config/accessControl';
import type { PermissionMap } from '@/types';

interface StaffContextValue {
  employeeId: string | null;
  fullName: string | null;
  roleKey: string | null;
  roleLabel: string | null;
  avatarUrl: string | null;
  permissions: PermissionMap;
  companyId: string | null;
  companyName: string | null;
}

const StaffContext = createContext<StaffContextValue | undefined>(undefined);

export function StaffProvider({ children }: { children: ReactNode }) {
  const { user, employeeProfile, permissions } = useAuth();
  const scope = useCompanyScope();

  const companyId =
    (employeeProfile?.companyId as string | null) ??
    (user?.companyId as string | null) ??
    scope.companyId ??
    null;

  const { data: company } = useQuery({
    queryKey: ['staffCompany', companyId],
    queryFn: () => (companyId ? getCompany(companyId) : Promise.resolve(null)),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const { data: profileName } = useQuery({
    queryKey: ['staffProfileName', user?.id],
    queryFn: async () => {
      if (!user?.id) return null as string | null;
      const { data } = await db
        .core()
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('clerk_user_id', user.id)
        .maybeSingle();
      const raw = (data as { full_name?: string; avatar_url?: string } | null)?.full_name;
      return raw && String(raw).trim().length > 0 ? String(raw) : null;
    },
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const { data: profileAvatar } = useQuery({
    queryKey: ['staffProfileAvatar', user?.id],
    queryFn: async () => {
      if (!user?.id) return null as string | null;
      const { data } = await db
        .core()
        .from('profiles')
        .select('avatar_url')
        .eq('clerk_user_id', user.id)
        .maybeSingle();
      const raw = (data as { avatar_url?: string } | null)?.avatar_url;
      return raw && String(raw).trim().length > 0 ? String(raw) : null;
    },
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const { data: employeeRow } = useQuery({
    queryKey: ['staffEmployeeRow', companyId, employeeProfile?.id],
    queryFn: async () => {
      if (!companyId || !employeeProfile?.id) return null as { full_name?: string; avatar_url?: string } | null;
      const { data, error } = await db
        .public()
        .from('employees')
        .select('full_name, avatar_url')
        .eq('id', employeeProfile.id)
        .eq('company_id', companyId)
        .limit(1);

      const row =
        (Array.isArray(data) && data.length > 0
          ? (data[0] as { full_name?: string; avatar_url?: string } | null)
          : null) ?? null;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[StaffProfile] staffEmployeeRow fetch', {
          table: 'public.employees',
          companyId,
          employeeId: employeeProfile.id,
          row,
          error,
        });
      }

      return row;
    },
    enabled: Boolean(companyId && employeeProfile?.id),
    staleTime: 60_000,
  });

  const employeeFullName =
    employeeRow?.full_name && String(employeeRow.full_name).trim().length > 0
      ? String(employeeRow.full_name)
      : null;

  const fullName: string | null =
    employeeFullName ??
    profileName ??
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
    avatarUrl:
      (employeeRow?.avatar_url && String(employeeRow.avatar_url).trim().length > 0
        ? String(employeeRow.avatar_url)
        : null) ??
      profileAvatar ??
      (user?.avatar as string | null) ??
      null,
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

