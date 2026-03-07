import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { User, UserRole, Employee, PermissionMap } from '@/types';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { getDefaultPermissions, getFullAccessPermissions, resolvePermissions } from '@/lib/permissions';
import { useToast } from '@/components/ui/use-toast';
import { isDevEmail } from '@/lib/devAccess';

/** Clerk state passed from ClerkAuthBridge so AuthProvider can run without Clerk when in emergency-only mode. */
export interface ClerkStateSnapshot {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  clerkUser: { primaryEmailAddress?: { emailAddress?: string }; fullName?: string; username?: string; imageUrl?: string } | null;
  signInLoaded: boolean;
  signIn: { create: (opts: { identifier: string; password: string }) => Promise<{ status?: string; createdSessionId?: string; errors?: Array<{ message?: string; longMessage?: string }> }> } | null;
  setActiveSignIn: ((opts: { session: string }) => Promise<void>) | null;
  signOut: () => Promise<void>;
}

interface AuthContextType {
  user: User | null;
  employeeProfile: Employee | null;
  permissions: PermissionMap;
  isAuthenticated: boolean;
  authReady: boolean;
  isDeveloper: boolean;
  /** True when user is signed in but users/{uid} is missing companyId/role (setup incomplete). */
  setupIncomplete: boolean;
  /** True when session is from emergency access (bypasses Clerk). Operational routes only. */
  isEmergencySession: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  /** Refetch profile avatar and update user.avatar (e.g. after avatar upload). */
  refreshUserAvatar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_USER_CACHE_KEY = 'farmvault:auth:user:v1';
const EMERGENCY_SESSION_KEY = 'farmvault:emergency-session:v1';
const CLERK_LOAD_TIMEOUT_MS = 4000;

function isEmergencyAccessEnabled(): boolean {
  return import.meta.env.VITE_EMERGENCY_ACCESS === 'true' || import.meta.env.VITE_EMERGENCY_ACCESS === '1';
}

function getEmergencyConfig(): { email: string; userId: string; companyId: string; role: string } | null {
  if (!isEmergencyAccessEnabled()) return null;
  const email = import.meta.env.VITE_EMERGENCY_EMAIL;
  const userId = import.meta.env.VITE_EMERGENCY_USER_ID;
  const companyId = import.meta.env.VITE_EMERGENCY_COMPANY_ID;
  const role = import.meta.env.VITE_EMERGENCY_ROLE || 'company_admin';
  if (!email || !userId || !companyId) return null;
  return { email: String(email).trim().toLowerCase(), userId: String(userId), companyId: String(companyId), role: String(role) };
}

function readEmergencySession(): User | null {
  if (typeof window === 'undefined') return null;
  const config = getEmergencyConfig();
  if (!config) return null;
  try {
    const raw = window.localStorage.getItem(EMERGENCY_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { email?: string; userId?: string; companyId?: string; role?: string };
    if (data.email?.toLowerCase() !== config.email || data.userId !== config.userId) return null;
    return {
      id: config.userId,
      email: config.email,
      name: data.name ?? 'Emergency Access',
      role: (config.role === 'company_admin' || config.role === 'company-admin' ? 'company-admin' : config.role) as UserRole,
      employeeRole: undefined,
      companyId: config.companyId,
      avatar: undefined,
      createdAt: new Date(),
    };
  } catch {
    return null;
  }
}

function writeEmergencySession(user: User | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      window.localStorage.removeItem(EMERGENCY_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(
      EMERGENCY_SESSION_KEY,
      JSON.stringify({ email: user.email, userId: user.id, companyId: user.companyId, role: user.role, name: user.name }),
    );
  } catch {
    // ignore
  }
}

/**
 * Called from Emergency Access page to create a local session. Only works when VITE_EMERGENCY_ACCESS is true
 * and email matches VITE_EMERGENCY_EMAIL. Returns true if session was created.
 */
export function createEmergencySession(email: string): boolean {
  const config = getEmergencyConfig();
  if (!config) return false;
  const normalized = String(email || '').trim().toLowerCase();
  if (normalized !== config.email) return false;
  const role = (config.role === 'company_admin' || config.role === 'company-admin' ? 'company-admin' : config.role) as UserRole;
  const user: User = {
    id: config.userId,
    email: config.email,
    name: 'Emergency Access',
    role,
    employeeRole: undefined,
    companyId: config.companyId,
    avatar: undefined,
    createdAt: new Date(),
  };
  writeEmergencySession(user);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('farmvault:emergency-session-created'));
  }
  return true;
}

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
    authUserId: row.clerk_user_id != null ? String(row.clerk_user_id) : (row.auth_user_id != null ? String(row.auth_user_id) : undefined),
  };
}

async function loadEmployeeProfile(uid: string): Promise<Employee | null> {
  try {
    const { data, error } = await db
      .public()
      .from('employees')
      .select('*')
      .eq('clerk_user_id', uid)
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

export function AuthProvider({
  children,
  clerkState = undefined,
}: {
  children: ReactNode;
  /** When null, emergency-only mode (no Clerk). When undefined, caller must be ClerkAuthBridge which passes state. */
  clerkState?: ClerkStateSnapshot | null;
}) {
  const toast = useToast();
  const clerkLoaded = clerkState === null ? true : clerkState?.isLoaded ?? false;
  const isSignedIn = clerkState === null ? false : clerkState?.isSignedIn ?? false;
  const userId = clerkState === null ? null : clerkState?.userId ?? null;
  const clerkUser = clerkState === null ? null : clerkState?.clerkUser ?? null;
  const signInLoaded = clerkState === null ? false : clerkState?.signInLoaded ?? false;
  const signIn = clerkState === null ? null : clerkState?.signIn ?? null;
  const setActiveSignIn = clerkState === null ? null : clerkState?.setActiveSignIn ?? null;
  const clerkSignOut = clerkState === null ? null : clerkState?.signOut ?? null;

  const [user, setUser] = useState<User | null>(() => {
    if (clerkState === null) return readEmergencySession();
    return readCachedUser();
  });
  const [employeeProfile, setEmployeeProfile] = useState<Employee | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>(() => getDefaultPermissions());
  const [authReady, setAuthReady] = useState(() => {
    if (clerkState === null) return true;
    return false;
  });
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState<boolean>(() => {
    if (typeof window === 'undefined' || clerkState === null) return false;
    return window.localStorage.getItem('fv:isDeveloper') === '1';
  });
  const [isEmergencySession, setIsEmergencySession] = useState<boolean>(() => clerkState === null && !!readEmergencySession());
  const clerkLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When emergency session is created from the Emergency Access page, pick it up so RequireAuth sees the user.
  useEffect(() => {
    const onEmergencySessionCreated = () => {
      const emergencyUser = readEmergencySession();
      if (emergencyUser) {
        setUser(emergencyUser);
        setEmployeeProfile(null);
        setPermissions(buildEffectivePermissions(emergencyUser, null));
        setSetupIncomplete(false);
        setIsEmergencySession(true);
      }
    };
    window.addEventListener('farmvault:emergency-session-created', onEmergencySessionCreated);
    return () => window.removeEventListener('farmvault:emergency-session-created', onEmergencySessionCreated);
  }, []);

  // When Clerk is present but not loaded yet, set authReady true after timeout so sign-in page and redirects are not blocked forever.
  useEffect(() => {
    if (clerkState === null) return;
    if (clerkLoaded) {
      if (clerkLoadTimeoutRef.current) {
        clearTimeout(clerkLoadTimeoutRef.current);
        clerkLoadTimeoutRef.current = null;
      }
      return;
    }
    if (import.meta.env.DEV) {
      console.warn("[AuthContext] Clerk still loading; will allow UI to proceed after timeout");
    }
    clerkLoadTimeoutRef.current = setTimeout(() => {
      clerkLoadTimeoutRef.current = null;
      if (import.meta.env.DEV) {
        console.warn("[AuthContext] Clerk load timeout reached; setting authReady true so sign-in does not freeze");
      }
      setAuthReady(true);
    }, CLERK_LOAD_TIMEOUT_MS);
    return () => {
      if (clerkLoadTimeoutRef.current) {
        clearTimeout(clerkLoadTimeoutRef.current);
      }
    };
  }, [clerkState === null, clerkLoaded]);

  useEffect(() => {
    if (clerkState === null) {
      const emergencyUser = readEmergencySession();
      setUser(emergencyUser);
      if (emergencyUser) {
        setPermissions(buildEffectivePermissions(emergencyUser, null));
        setSetupIncomplete(false);
        setIsEmergencySession(true);
      } else {
        setEmployeeProfile(null);
        setPermissions(getDefaultPermissions());
        setIsEmergencySession(false);
      }
      return;
    }

    if (!clerkLoaded) {
      if (import.meta.env.DEV) {
        console.warn("[AuthContext] Clerk still loading; skipping profile fetch until loaded");
      }
      return;
    }

    if (!isSignedIn) {
      const emergencyUser = readEmergencySession();
      if (emergencyUser) {
        setUser(emergencyUser);
        setEmployeeProfile(null);
        setPermissions(buildEffectivePermissions(emergencyUser, null));
        setSetupIncomplete(false);
        setIsEmergencySession(true);
        setAuthReady(true);
        return;
      }
      setUser(null);
      setEmployeeProfile(null);
      setPermissions(getDefaultPermissions());
      writeCachedUser(null);
      writeEmergencySession(null);
      setSetupIncomplete(false);
      setIsDeveloper(false);
      setIsEmergencySession(false);
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
          const clerkImageUrl = (clerkUser as { imageUrl?: string })?.imageUrl;
          const devProfileAvatar = await (async () => {
            try {
              const { data: r } = await db.core().from('profiles').select('avatar_url').eq('clerk_user_id', userId).maybeSingle();
              return r?.avatar_url ?? null;
            } catch {
              return null;
            }
          })();
          const devUser: User = {
            id: userId,
            email: fallbackEmail,
            name: fallbackName,
            role: 'developer',
            employeeRole: undefined,
            companyId: null,
            avatar: (devProfileAvatar || clerkImageUrl) ? String(devProfileAvatar || clerkImageUrl) : undefined,
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

        // 3b) Load profile avatar_url for avatar priority: custom upload > Clerk/Google imageUrl
        let profileAvatarUrl: string | null = null;
        try {
          const { data: profileRow } = await db
            .core()
            .from('profiles')
            .select('avatar_url')
            .eq('clerk_user_id', userId)
            .maybeSingle();
          profileAvatarUrl = profileRow?.avatar_url ?? null;
        } catch {
          // Non-blocking; fall back to Clerk image
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

        const clerkImageUrl = (clerkUser as { imageUrl?: string })?.imageUrl;
        // Avatar priority: 1) profile.avatar_url (custom upload), 2) Clerk/Google imageUrl, 3) UI shows initials
        const resolvedAvatar = profileAvatarUrl || clerkImageUrl || null;
        const mapped: User = {
          id: userId,
          email: fallbackEmail,
          name: fallbackName,
          role: normalizedRole,
          employeeRole: undefined,
          companyId: hasCompanyId && hasRole ? contextCompanyId : null,
          avatar: resolvedAvatar ? String(resolvedAvatar) : undefined,
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
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[Employees Query Fixed]', {
            clerkUserId: userId,
            companyId: mapped.companyId ?? null,
            queryEnabled: true,
            employeeFound: !!employee,
          });
        }
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
          const clerkImageUrl = (clerkUser as { imageUrl?: string })?.imageUrl;
          const fallbackUser: User = {
            id: userId,
            email: fallbackEmail,
            name: fallbackName,
            role: 'employee',
            employeeRole: undefined,
            companyId: null,
            avatar: clerkImageUrl ? String(clerkImageUrl) : undefined,
            createdAt: new Date(),
          };
          setUser(fallbackUser);
          setEmployeeProfile(null);
          setPermissions(getDefaultPermissions());
          setSetupIncomplete(true);
          writeCachedUser(null);
        }
        const errMsg = (error as Error)?.message ?? String(error);
        if (errMsg.includes('failed_to_load_clerk_js') || errMsg.includes('clerk') || errMsg.includes('CORS')) {
          console.error('[AuthContext] Clerk failed:', error);
        } else if (import.meta.env.DEV) {
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
  }, [clerkLoaded, isSignedIn, userId]);

  const login = async (email: string, password: string) => {
    if (clerkState === null) {
      const err: any = new Error('Sign in is not available in emergency-only mode. Use the emergency access page.');
      throw err;
    }
    if (!signInLoaded || !signIn || !setActiveSignIn) {
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
    if (isEmergencySession) {
      writeEmergencySession(null);
      setUser(null);
      setEmployeeProfile(null);
      setPermissions(getDefaultPermissions());
      setSetupIncomplete(false);
      setIsEmergencySession(false);
      return;
    }
    if (clerkSignOut) {
      clerkSignOut().finally(() => {
        setUser(null);
        setEmployeeProfile(null);
        setPermissions(getDefaultPermissions());
        setSetupIncomplete(false);
        setIsDeveloper(false);
        writeCachedUser(null);
      });
    } else {
      setUser(null);
      setEmployeeProfile(null);
      setPermissions(getDefaultPermissions());
      setSetupIncomplete(false);
      setIsDeveloper(false);
      writeCachedUser(null);
    }
  };

  const switchRole = (role: UserRole) => {
    if (user) {
      setUser({ ...user, role });
    }
  };

  const refreshUserAvatar = async () => {
    if (isEmergencySession || !userId || !user) return;
    try {
      const { data: profileRow } = await db
        .core()
        .from('profiles')
        .select('avatar_url')
        .eq('clerk_user_id', userId)
        .maybeSingle();
      const clerkImageUrl = (clerkUser as { imageUrl?: string })?.imageUrl;
      // Same priority: profile.avatar_url > Clerk imageUrl > (UI initials)
      const resolvedAvatar = profileRow?.avatar_url || clerkImageUrl || null;
      const next = { ...user, avatar: resolvedAvatar ? String(resolvedAvatar) : undefined };
      setUser(next);
      writeCachedUser(next);
    } catch {
      // Non-blocking
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
        isEmergencySession: !!isEmergencySession,
        login,
        logout,
        switchRole,
        refreshUserAvatar,
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
