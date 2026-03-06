import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useAuth as useClerkAuth, useUser, useSignIn } from '@clerk/react';
import { User, UserRole, Employee, PermissionMap } from '@/types';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { getDefaultPermissions, getFullAccessPermissions, resolvePermissions } from '@/lib/permissions';
import { getCompany } from '@/services/companyService';
import { useToast } from '@/components/ui/use-toast';
import { isDevEmail } from '@/lib/devAccess';

interface AuthContextType {
  user: User | null;
  employeeProfile: Employee | null;
  permissions: PermissionMap;
  isAuthenticated: boolean;
  authReady: boolean;
  isDeveloper: boolean;
  /** True when user is signed in but users/{uid} is missing companyId/role (setup incomplete). */
  setupIncomplete: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_USER_CACHE_KEY = 'farmvault:auth:user:v1';

function isCurrentRouteDev(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.location.pathname.startsWith('/dev');
  } catch {
    return false;
  }
}

function hydrateCachedUser(raw: any): User | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.email) return null;
  const createdAt = raw.createdAt ? new Date(raw.createdAt) : new Date();
  return {
    id: String(raw.id),
    email: String(raw.email),
    name: String(raw.name || 'User'),
    role: (raw.role || 'employee') as UserRole,
    employeeRole: raw.employeeRole ? String(raw.employeeRole) : undefined,
    companyId: raw.companyId ?? null,
    avatar: raw.avatar ? String(raw.avatar) : undefined,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
  };
}

function readCachedUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    return hydrateCachedUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
      return;
    }
    window.localStorage.setItem(
      AUTH_USER_CACHE_KEY,
      JSON.stringify({
        ...user,
        createdAt: user.createdAt?.toISOString?.() ?? new Date().toISOString(),
      }),
    );
  } catch {
    // Ignore storage failures (private mode/quota).
  }
}

function mapEmployeeRow(row: any): Employee {
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    name: String(row.name ?? row.full_name ?? 'User'),
    fullName: row.full_name != null ? String(row.full_name) : row.name != null ? String(row.name) : undefined,
    email: row.email != null ? String(row.email) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    contact: row.contact != null ? String(row.contact) : undefined,
    role: row.role ?? null,
    employeeRole: row.employee_role ?? row.role ?? null,
    department: row.department != null ? String(row.department) : undefined,
    status: (row.status as Employee['status']) ?? 'active',
    permissions: row.permissions as PermissionMap | undefined,
    joinDate: row.join_date ?? undefined,
    createdAt: row.created_at ?? undefined,
    createdBy: row.created_by != null ? String(row.created_by) : undefined,
    authUserId: row.auth_user_id != null ? String(row.auth_user_id) : undefined,
  };
}

async function loadEmployeeProfile(uid: string): Promise<Employee | null> {
  try {
    const { data, error } = await db
      .public()
      .from('employees')
      .select('*')
      .eq('auth_user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }
    return mapEmployeeRow(data[0]);
  } catch {
    return null;
  }
}

function getAppRoleFromEmployeeRole(employeeRole?: string | null): UserRole {
  const role = (employeeRole || '').toLowerCase();
  if (role === 'operations-manager' || role === 'manager') return 'manager';
  if (role === 'sales-broker' || role === 'broker') return 'broker';
  return 'employee';
}

function getPermissionRole(user: User | null, employeeProfile: Employee | null): string | null {
  if (employeeProfile?.employeeRole) return employeeProfile.employeeRole;
  if (employeeProfile?.role) return employeeProfile.role;
  if (user?.employeeRole) return user.employeeRole;
  if (!user) return null;
  if (user.role === 'manager') return 'operations-manager';
  if (user.role === 'broker') return 'sales-broker';
  if ((user.role as any) === 'driver') return 'logistics-driver';
  return null;
}

function buildEffectivePermissions(user: User | null, employeeProfile: Employee | null): PermissionMap {
  if (!user) return getDefaultPermissions();
  if (user.role === 'developer' || user.role === 'company-admin' || (user as any).role === 'company_admin') {
    return getFullAccessPermissions();
  }
  const permissionRole = getPermissionRole(user, employeeProfile);
  const permissionOverrides = employeeProfile?.permissions ?? (user as any)?.permissions ?? null;
  return resolvePermissions(permissionRole, permissionOverrides);
}

/** Maps DB role (core.company_members.role) to app UserRole. company_admin/admin → company-admin; do not default to employee when membership has a role. */
function normalizeRole(role: string | null | undefined): UserRole {
  if (!role) return 'employee';
  const r = role.toString().trim().toLowerCase();
  if (r === 'company_admin' || r === 'company-admin' || r === 'admin') return 'company-admin';
  if (r === 'developer' || r === 'manager' || r === 'broker' || r === 'employee') return r as UserRole;
  return 'employee';
}

/** Builds a User from a profile-like row. Role must NOT come from profiles (no role column); use RPC current_member_role for session role. */
function mapUserFromProfileRow(uid: string, row: { id?: string; company_id?: string; name?: string; email?: string; avatar?: string; created_at?: string; permissions?: unknown } | null, fallbackEmail: string, fallbackName: string): User {
  const createdAt =
    row?.created_at != null ? new Date(row.created_at) : new Date();
  return {
    id: uid,
    email: row?.email || fallbackEmail || '',
    name: row?.name || fallbackName || 'User',
    role: 'employee',
    employeeRole: undefined,
    companyId: row?.company_id ?? null,
    avatar: row?.avatar ?? undefined,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    ...(row?.permissions ? { permissions: row.permissions } : {}),
  } as User;
}

/** User doc is complete when it has role and companyId (or user is developer). company-admin with active company is valid. */
function isUserSetupComplete(data: { role?: string | null; companyId?: string | null } | null): boolean {
  if (!data) return false;
  const role = normalizeRole(data.role);
  if (role === 'developer') return true;
  if (role === 'company-admin' && data.companyId) return true;
  return Boolean(data.companyId && role);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const clerk = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { toast } = useToast();

  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [employeeProfile, setEmployeeProfile] = useState<Employee | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>(() => getDefaultPermissions());
  const [authReady, setAuthReady] = useState(false);
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('fv:isDeveloper') === '1';
  });

  const { isLoaded: clerkLoaded, isSignedIn, userId } = clerk;

  useEffect(() => {
    if (!clerkLoaded) {
      return;
    }

    if (!isSignedIn) {
      setUser(null);
      setEmployeeProfile(null);
      setPermissions(getDefaultPermissions());
      writeCachedUser(null);
      setSetupIncomplete(false);
      setIsDeveloper(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('fv:isDeveloper', '0');
      }
      setAuthReady(true);
      return;
    }

    if (!userId) {
      return;
    }

    let cancelled = false;
    setAuthReady(false);
    setSetupIncomplete(false);

    (async () => {
      try {
        const fallbackEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? '';
        const fallbackName = clerkUser?.fullName ?? clerkUser?.username ?? 'User';

        // 1) Determine developer status as early as possible.
        const devRoute = isCurrentRouteDev();
        const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
        let dev = false;

        try {
          // Allow-listed emails are always treated as developers, regardless of route.
          if (isDevEmail(email || undefined)) {
            dev = true;
            // Ensure developer record exists in admin schema; non-blocking.
            void (async () => {
              try {
                await db
                  .admin()
                  .from('developers')
                  .upsert(
                    {
                      clerk_user_id: userId,
                      email,
                      role: 'super_admin',
                    },
                    { onConflict: 'clerk_user_id' },
                  );
              } catch (devUpsertError) {
                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.warn('[Auth] Developer upsert failed:', devUpsertError);
                }
              }
            })();
          } else if (devRoute) {
            // Non-allowlisted users can still be developers if present in admin.developers,
            // but we only check this on /dev routes.
            const { data: devRow, error: devError } = await db
              .admin()
              .from('developers')
              .select('clerk_user_id')
              .eq('clerk_user_id', userId)
              .maybeSingle();
            if (devError) {
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.warn('[Auth] Developer check failed:', devError);
              }
            }
            dev = Boolean(devRow?.clerk_user_id);
          }
        } catch (devUnexpectedError) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.error('[Auth] Unexpected developer check error:', devUnexpectedError);
          }
        }

        setIsDeveloper(dev);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('fv:isDeveloper', dev ? '1' : '0');
        }

        // 2) If this is a platform developer, short-circuit tenant onboarding entirely
        // and treat them as a global developer user (role = 'developer').
        if (dev) {
          const devUser: User = {
            id: userId,
            email: fallbackEmail,
            name: fallbackName,
            role: 'developer',
            employeeRole: undefined,
            companyId: null,
            avatar: undefined,
            createdAt: new Date(),
          };
          setUser(devUser);
          setEmployeeProfile(null);
          setPermissions(getFullAccessPermissions());
          setSetupIncomplete(false);
          writeCachedUser(devUser);

          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[Auth] Developer session', {
              uid: devUser.id,
              email: devUser.email,
              isDeveloper: true,
              companyId: devUser.companyId,
            });
          }

          setAuthReady(true);
          return;
        }

        // 3) Ensure profiles row exists so current_context can read active_company_id.
        const { error: upsertError } = await db
          .core()
          .from('profiles')
          .upsert({ clerk_user_id: userId }, { onConflict: 'clerk_user_id' });

        if (upsertError && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[Auth] Profile upsert warning:', upsertError);
        }

        // 4) Single source of truth: current_context() returns { company_id, role } from core.profiles + core.company_members.
        // Never read role from profiles; set user.companyId and user.role only from this RPC.
        const { data: contextRows, error: contextError } = await supabase.rpc('current_context');

        if (cancelled) return;

        if (contextError && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[Auth] current_context RPC error:', contextError);
        }

        const contextRow = Array.isArray(contextRows) ? contextRows[0] : contextRows;
        const contextCompanyId = contextRow?.company_id != null ? String(contextRow.company_id) : null;
        const contextRole = contextRow?.role != null ? String(contextRow.role).trim() : null;

        const normalizedRole = normalizeRole(contextRole) as UserRole;
        const hasCompanyId = contextCompanyId != null && contextCompanyId !== '';
        const hasRole = contextRole != null && contextRole !== '';
        const setupIncompleteFlag = !hasCompanyId || !hasRole;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[Auth] current_context', {
            uid: userId,
            company_id: contextCompanyId,
            role: contextRole,
            normalizedRole,
            setupIncomplete: setupIncompleteFlag,
          });
        }

        const mapped: User = {
          id: userId,
          email: fallbackEmail,
          name: fallbackName,
          role: normalizedRole,
          employeeRole: undefined,
          companyId: hasCompanyId && hasRole ? contextCompanyId : null,
          avatar: undefined,
          createdAt: new Date(),
        };

        if (setupIncompleteFlag) {
          setUser({ ...mapped, companyId: null });
          setEmployeeProfile(null);
          setPermissions(getDefaultPermissions());
          setSetupIncomplete(true);
          writeCachedUser(null);
          setAuthReady(true);
          return;
        }

        const employee = await loadEmployeeProfile(userId);
        if (cancelled) return;
        const effectivePermissions = buildEffectivePermissions(mapped, employee);
        setUser(mapped);
        setEmployeeProfile(employee);
        setPermissions(effectivePermissions);
        writeCachedUser(mapped);
        setSetupIncomplete(false);
        setAuthReady(true);
      } catch (error) {
        const cached = readCachedUser();
        if (cached && cached.id === userId && cached.companyId) {
          setUser(cached);
          setEmployeeProfile(null);
          setPermissions(buildEffectivePermissions(cached, null));
          writeCachedUser(cached);
          setSetupIncomplete(false);
        } else {
          const fallbackEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? '';
          const fallbackName = clerkUser?.fullName ?? 'User';
          const fallbackUser: User = {
            id: userId,
            email: fallbackEmail,
            name: fallbackName,
            role: 'employee',
            employeeRole: undefined,
            companyId: null,
            avatar: undefined,
            createdAt: new Date(),
          };
          setUser(fallbackUser);
          setEmployeeProfile(null);
          setPermissions(getDefaultPermissions());
          setSetupIncomplete(true);
          writeCachedUser(null);
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[Auth] Profile load failed:', error);
        }
        toast({
          title: 'Unable to load account',
          description:
            'We could not fully load your FarmVault account. You can continue, but some data may be missing.',
          variant: 'destructive',
        });
        setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, isSignedIn, userId, clerkUser, toast, isDeveloper]);

  const login = async (email: string, password: string) => {
    if (!signInLoaded || !signIn || !setActiveSignIn) {
      // Give Clerk a brief moment to finish initializing before failing.
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!signInLoaded || !signIn || !setActiveSignIn) {
        const err: any = new Error('Sign in is temporarily unavailable. Please refresh the page and try again.');
        throw err;
      }
    }

    const result = await signIn.create({
      identifier: email,
      password,
    });

    if ((result as any)?.status === 'complete') {
      await setActiveSignIn({ session: (result as any).createdSessionId });
      setSetupIncomplete(false);
      return;
    }

    const firstError = (result as any)?.errors?.[0];
    const message =
      firstError?.longMessage ||
      firstError?.message ||
      'Unable to sign in. Check your email and password, then try again.';
    const err: any = new Error(message);
    throw err;
  };

  const logout = () => {
    clerk
      .signOut()
      .finally(() => {
        setUser(null);
        setEmployeeProfile(null);
        setPermissions(getDefaultPermissions());
        setSetupIncomplete(false);
        setIsDeveloper(false);
        writeCachedUser(null);
      });
  };

  const switchRole = (role: UserRole) => {
    if (user) {
      setUser({ ...user, role });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        employeeProfile,
        permissions,
        isAuthenticated: !!user,
        authReady,
        isDeveloper,
        setupIncomplete,
        login,
        logout,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
