import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { User, UserRole, Employee, PermissionMap } from '@/types';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { getDefaultPermissions, getFullAccessPermissions, resolvePermissions, expandFlatPermissions } from '@/lib/permissions';
import { resolveEffectiveAccess, type EffectiveAccess } from '@/lib/access';
import { useToast } from '@/components/ui/use-toast';
import { isDevEmail } from '@/lib/devAccess';
import { linkCurrentUserToInvitedEmployee } from '@/lib/employees/linkCurrentUserToInvitedEmployee';
import { EMPLOYEES_SELECT } from '@/lib/employees/employeesColumns';

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
  /** Resolved access (landing page, allowed modules, etc.). Use this for nav, routes, and landing—not raw role. */
  effectiveAccess: EffectiveAccess;
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
  /** Refetch profile name + avatar and update user.name/user.avatar. */
  refreshUserProfile: () => Promise<void>;
  /** Refetch employee profile + context and recompute role/permissions. Returns new landingPage for redirect. */
  refreshAuthState: () => Promise<{ landingPage: string } | null>;
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
    const data = JSON.parse(raw) as { email?: string; userId?: string; companyId?: string; role?: string; name?: string };
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
    name: raw.name != null && String(raw.name).trim().length > 0 ? String(raw.name) : String(raw.email || ''),
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
  const fullName = row.full_name != null ? String(row.full_name) : undefined;
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    // `employees` table uses `full_name` (no `name` column). Keep UI `name` derived.
    name: fullName ?? 'User',
    fullName,
    email: row.email != null ? String(row.email) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    // UI legacy: keep `contact` derived from phone for display/search.
    contact: row.phone != null ? String(row.phone) : undefined,
    role: row.role ?? null,
    // `employees` table has only `role` (no `employee_role` column)
    employeeRole: row.role ?? null,
    department: row.department != null ? String(row.department) : undefined,
    status: (row.status as Employee['status']) ?? 'active',
    permissions: row.permissions as PermissionMap | undefined,
    // UI legacy: treat join date as created_at for Supabase-backed employees
    joinDate: row.created_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    authUserId: row.clerk_user_id != null ? String(row.clerk_user_id) : undefined,
  };
}

async function loadEmployeeProfile(uid: string): Promise<Employee | null> {
  try {
    const { data, error } = await db
      .public()
      .from('employees')
      .select(EMPLOYEES_SELECT)
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

/**
 * Build effective permissions with proper role priority:
 * 1. Developer → full access
 * 2. Company admin (from current_context) → full access (even if employee profile exists)
 * 3. Employee → role-based permissions
 *
 * The key fix: company admins always get full access regardless of employee profile.
 * This prevents owners/admins from being downgraded to staff permissions.
 */
function buildEffectivePermissions(
  user: User | null,
  employeeProfile: Employee | null,
  options?: { forceCompanyAdmin?: boolean }
): PermissionMap {
  if (!user) return getDefaultPermissions();

  // Priority 1: Developer always gets full access
  if (user.role === 'developer') {
    return getFullAccessPermissions();
  }

  // Priority 2: Company admin gets full access even if employee profile exists
  // This is the key fix - company admins should NOT be downgraded by employee profiles
  const isCompanyAdmin =
    user.role === 'company-admin' ||
    (user as { role?: string }).role === 'company_admin' ||
    options?.forceCompanyAdmin === true;

  if (isCompanyAdmin) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Auth] buildEffectivePermissions: company-admin → full access', {
        uid: user.id,
        role: user.role,
        hasEmployeeProfile: !!employeeProfile,
        forceCompanyAdmin: options?.forceCompanyAdmin,
      });
    }
    return getFullAccessPermissions();
  }

  // Priority 3: Employee permissions from role/overrides
  const permissionRole = getPermissionRole(user, employeeProfile);
  const rawOverrides = employeeProfile?.permissions ?? (user as any)?.permissions ?? null;

  // employees.permissions is stored as flat keys (e.g. "harvest.view").
  // Convert flat JSON into nested PermissionMap overrides before resolving.
  let permissionOverrides: PermissionMap | null = null;
  if (rawOverrides && typeof rawOverrides === 'object') {
    const asRecord = rawOverrides as Record<string, boolean>;
    if (Object.keys(asRecord).some((k) => k.includes('.'))) {
      permissionOverrides = expandFlatPermissions(asRecord);
    } else {
      permissionOverrides = rawOverrides as PermissionMap;
    }
  }

  return resolvePermissions(permissionRole, permissionOverrides);
}

const DEFAULT_EFFECTIVE_ACCESS: EffectiveAccess = {
  employeeId: null,
  companyId: null,
  rolePreset: 'custom',
  permissions: {},
  allowedModules: [],
  landingPage: '/staff',
  canSeeDashboard: false,
  isBroker: false,
  isDriver: false,
};

/**
 * Build effective access with proper role priority for landing page determination.
 * Priority: developer → company-admin → employee role
 *
 * Company admins should NEVER land on staff dashboard.
 */
function buildEffectiveAccess(
  user: User | null,
  employeeProfile: Employee | null,
  permissions: PermissionMap,
  options?: { forceCompanyAdmin?: boolean }
): EffectiveAccess {
  if (!user) return DEFAULT_EFFECTIVE_ACCESS;

  const isDeveloper = user.role === 'developer';
  const isCompanyAdmin =
    user.role === 'company-admin' ||
    (user as { role?: string }).role === 'company_admin' ||
    options?.forceCompanyAdmin === true;

  // For company admins, don't use employee role for routing - they should get admin landing
  const legacyRole = isCompanyAdmin ? null : getPermissionRole(user, employeeProfile);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Auth] buildEffectiveAccess', {
      uid: user.id,
      role: user.role,
      isDeveloper,
      isCompanyAdmin,
      legacyRole,
      hasEmployeeProfile: !!employeeProfile,
      forceCompanyAdmin: options?.forceCompanyAdmin,
    });
  }

  return resolveEffectiveAccess({
    permissions,
    employeeId: employeeProfile?.id ?? null,
    companyId: user.companyId ?? null,
    legacyRole: legacyRole ?? undefined,
    isCompanyAdmin,
    isDeveloper,
  });
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
  const { toast } = useToast();
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
  
  // Compute effectiveAccess with proper role priority
  // Company admins should NOT be routed based on employee profile
  const effectiveAccess = React.useMemo(() => {
    const isCompanyAdmin =
      user?.role === 'company-admin' ||
      (user as { role?: string } | null)?.role === 'company_admin';

    // For company admins, don't use employee profile for access computation
    return buildEffectiveAccess(
      user,
      isCompanyAdmin ? null : employeeProfile,
      permissions,
      { forceCompanyAdmin: isCompanyAdmin }
    );
  }, [user, employeeProfile, permissions]);
  const [authReady, setAuthReady] = useState(() => {
    if (clerkState === null) return true;
    return false;
  });
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [activationResolved, setActivationResolved] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState<boolean>(() => {
    if (typeof window === 'undefined' || clerkState === null) return false;
    return window.localStorage.getItem('fv:isDeveloper') === '1';
  });
  const [isEmergencySession, setIsEmergencySession] = useState<boolean>(() => clerkState === null && !!readEmergencySession());
  const clerkLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Track whether we've ever confirmed the user was signed in during this session.
   * This prevents clearing the cached user during Clerk's initial hydration phase,
   * which can briefly report isSignedIn=false before the session token is restored.
   * Only clear cache when transitioning from confirmed-signed-in to signed-out.
   */
  const confirmedSignedInRef = useRef<boolean>(false);

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
        setActivationResolved(true);
        setIsEmergencySession(true);
      } else {
        setEmployeeProfile(null);
        setPermissions(getDefaultPermissions());
        setIsEmergencySession(false);
        setActivationResolved(true);
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
        setActivationResolved(true);
        setAuthReady(true);
        return;
      }
      
      // Check if we have a cached user. If Clerk hasn't confirmed sign-in yet (initial load),
      // keep the cached user to avoid logging out the user during hydration.
      // Only clear the cache if we previously confirmed the user was signed in (explicit logout).
      const cachedUser = readCachedUser();
      if (cachedUser && !confirmedSignedInRef.current) {
        // Clerk loaded but says not signed in, and we haven't confirmed sign-in yet.
        // This could be Clerk hydrating - keep the cached user briefly.
        // Set authReady so the app can render, but don't clear the cache yet.
        // If this is a real logged-out state, Clerk will stay isSignedIn=false
        // and the user can proceed to sign-in page.
        if (import.meta.env.DEV) {
          console.warn('[AuthContext] Clerk says not signed in, but cached user exists and no prior confirmation. Preserving session.');
        }
        setUser(cachedUser);
        setPermissions(buildEffectivePermissions(cachedUser, null));
        setAuthReady(true);
        setActivationResolved(true);
        return;
      }
      
      // Confirmed logout: either we never had a cached user, or we previously confirmed sign-in
      // and now Clerk says signed out (explicit logout action).
      setUser(null);
      setEmployeeProfile(null);
      setPermissions(getDefaultPermissions());
      writeCachedUser(null);
      writeEmergencySession(null);
      setSetupIncomplete(false);
      setIsDeveloper(false);
      setIsEmergencySession(false);
      setActivationResolved(true);
      confirmedSignedInRef.current = false;
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
    setActivationResolved(false);

    (async () => {
      try {
        const fallbackEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? '';
        const fallbackName =
          (clerkUser?.fullName && clerkUser.fullName.trim().length > 0
            ? clerkUser.fullName
            : undefined) ??
          (clerkUser?.username && clerkUser.username.trim().length > 0
            ? clerkUser.username
            : undefined) ??
          '';

        // 1) Determine developer status as early as possible.
        const devRoute = isCurrentRouteDev();
        const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
        let dev = false;

        try {
          // Allow-listed emails are always treated as developers, regardless of route.
          if (isDevEmail(email || undefined)) {
            dev = true;
            // Ensure developer record exists via public RPC (avoids 406 when admin schema is not exposed).
            void (async () => {
              try {
                await supabase.rpc('bootstrap_developer', { _email: email ?? null });
              } catch (devUpsertError) {
                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.warn('[Auth] Developer bootstrap failed:', devUpsertError);
                }
              }
            })();
          } else if (devRoute) {
            // Non-allowlisted users can still be developers; check via public RPC.
            const { data: isDev, error: devError } = await supabase.rpc('is_developer');
            if (devError && import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.warn('[Auth] Developer check failed:', devError);
            }
            dev = isDev === true;
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
          confirmedSignedInRef.current = true;

          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[Auth] Developer session', {
              uid: devUser.id,
              email: devUser.email,
              isDeveloper: true,
              companyId: devUser.companyId,
            });
          }

          setActivationResolved(true);
          setAuthReady(true);
          return;
        }

        // 3) Ensure profiles row exists so current_context can read active_company_id.
        const { error: upsertError } = await db
          .core()
          .from('profiles')
          .upsert(
            {
              clerk_user_id: userId,
              email: fallbackEmail || null,
              full_name: fallbackName || null,
            },
            { onConflict: 'clerk_user_id' },
          );

        if (upsertError && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[Auth] Profile upsert warning:', upsertError);
        }

        // 3b) Load profile full_name + avatar_url (user display + avatar priority)
        let profileAvatarUrl: string | null = null;
        let profileFullName: string | null = null;
        try {
          const { data: profileRow } = await db
            .core()
            .from('profiles')
            .select('avatar_url, full_name')
            .eq('clerk_user_id', userId)
            .maybeSingle();
          profileAvatarUrl = profileRow?.avatar_url ?? null;
          profileFullName =
            profileRow?.full_name != null && String(profileRow.full_name).trim().length > 0
              ? String(profileRow.full_name)
              : null;
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

        // Ensure membership exists for this user + company so employees RLS can pass.
        try {
          const { data: ensureData, error: ensureError } = await supabase.rpc('ensure_current_membership');
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[Auth] Membership ensure result (pre-link)', {
              error: ensureError,
              data: ensureData,
            });
          }
        } catch (membershipError) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[Auth] ensure_current_membership (pre-link) failed (non-blocking):', membershipError);
          }
        }

        const clerkImageUrl = (clerkUser as { imageUrl?: string })?.imageUrl;
        // Avatar priority: 1) profile.avatar_url (custom upload), 2) Clerk/Google imageUrl, 3) UI shows initials
        const resolvedAvatar = profileAvatarUrl || clerkImageUrl || null;
        const mapped: User = {
          id: userId,
          email: fallbackEmail,
          name: profileFullName || fallbackName,
          role: normalizedRole,
          employeeRole: undefined,
          companyId: hasCompanyId && hasRole ? contextCompanyId : null,
          avatar: resolvedAvatar ? String(resolvedAvatar) : undefined,
          createdAt: new Date(),
        };

        // 5) CRITICAL FIX: Role priority for routing
        // Priority: (1) developer, (2) company-admin/owner, (3) employee/staff
        //
        // Company admins should NEVER go through employee linking or be routed to staff dashboard.
        // Only run employee activation when user has NO valid company context.
        const isContextCompanyAdmin =
          normalizedRole === 'company-admin' ||
          contextRole === 'company_admin' ||
          contextRole === 'company-admin' ||
          contextRole === 'admin';

        let effectiveCompanyId = contextCompanyId;
        let employeeFromRpc: Employee | null = null;
        let employeeLinkingSkipped = false;

        // Only attempt employee invite activation if user does NOT already have a valid company admin context
        if (!isContextCompanyAdmin && (!hasCompanyId || !hasRole)) {
          try {
            const linkResult = await linkCurrentUserToInvitedEmployee({
              clerk_user_id: userId,
              email: fallbackEmail,
            });
            if (linkResult.matched) {
              effectiveCompanyId = linkResult.company_id ?? effectiveCompanyId;
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[Auth] Employee invite activation matched', {
                  company_id: linkResult.company_id,
                  employee_id: linkResult.employee_id,
                  role: linkResult.role,
                });
              }
              // Build minimal employee from RPC so we never depend on client-side employees query for invite matching.
              if (linkResult.employee_id && linkResult.company_id) {
                employeeFromRpc = {
                  id: linkResult.employee_id,
                  companyId: linkResult.company_id,
                  name: null as any,
                  fullName: null as any,
                  email: fallbackEmail,
                  role: linkResult.role ?? null,
                  employeeRole: linkResult.role ?? null,
                  status: (linkResult.status as Employee['status']) ?? 'active',
                };
              }
              const nowIso = new Date().toISOString();
              if (effectiveCompanyId) {
                const { error: profileUpdateError } = await db
                  .core()
                  .from('profiles')
                  .update({ active_company_id: effectiveCompanyId, updated_at: nowIso })
                  .eq('clerk_user_id', userId);
                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.log('[Auth] Active company set from RPC-activated employee', {
                    clerk_user_id: userId,
                    companyId: effectiveCompanyId,
                    error: profileUpdateError ?? null,
                  });
                }
                try {
                  const { data: ensureAfterData, error: ensureAfterError } = await supabase.rpc('ensure_current_membership');
                  if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.log('[Auth] Membership ensure result (post-activation)', {
                      error: ensureAfterError,
                      data: ensureAfterData,
                      companyId: effectiveCompanyId,
                    });
                  }
                } catch (membershipError) {
                  if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.warn('[Auth] ensure_current_membership (post-activation) failed (non-blocking):', membershipError);
                  }
                }
              }
            }
          } catch {
            // Non-blocking; activation is best-effort but must not crash auth.
          }
        } else {
          employeeLinkingSkipped = true;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[Auth] SKIPPED employee invite activation (user is company admin)', {
              uid: userId,
              contextRole,
              normalizedRole,
              isContextCompanyAdmin,
              hasCompanyId,
              hasRole,
            });
          }
        }
        if (cancelled) return;

        const hasEffectiveCompany = effectiveCompanyId != null && effectiveCompanyId !== '';
        if (setupIncompleteFlag && !hasEffectiveCompany) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[Auth] Owner onboarding path (no company, no invite/membership match)', {
              uid: userId,
              email: fallbackEmail,
              contextCompanyId,
              contextRole,
              setupIncompleteFlag,
            });
          }
          setUser({ ...mapped, companyId: null });
          setEmployeeProfile(null);
          setPermissions(getDefaultPermissions());
          setSetupIncomplete(true);
          writeCachedUser(null);
          setActivationResolved(true);
          confirmedSignedInRef.current = true;
          setAuthReady(true);
          return;
        }
        const mappedWithCompany = hasEffectiveCompany ? { ...mapped, companyId: effectiveCompanyId } : mapped;

        // Load employee profile, but for company admins it should NOT override their permissions/routing
        let employee: Employee | null = null;
        let employeeProfileLoaded = false;

        // Only load employee profile for non-admin users
        // Company admins may have an employee record (for display purposes) but it should NOT affect routing
        if (!isContextCompanyAdmin) {
          employee = await loadEmployeeProfile(userId);
          if (!employee) {
            employee = employeeFromRpc;
          }
          employeeProfileLoaded = !!employee;
        } else {
          // For company admins, we may still want their display name from profiles but NOT their employee role
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[Auth] SKIPPED employee profile loading for routing (user is company admin)', {
              uid: userId,
              role: normalizedRole,
            });
          }
        }
        if (cancelled) return;

        if (import.meta.env.DEV) {
          if (employeeFromRpc && !isContextCompanyAdmin) {
            // eslint-disable-next-line no-console
            console.log('[Auth] Redirecting employee to /dashboard (invite matched via RPC)');
          } else if (employee && !isContextCompanyAdmin) {
            // eslint-disable-next-line no-console
            console.log('[Auth] Employee session path', {
              uid: userId,
              employeeId: employee.id,
              companyId: mappedWithCompany.companyId,
            });
          } else if (isContextCompanyAdmin) {
            // eslint-disable-next-line no-console
            console.log('[Auth] Company admin session path → /dashboard', {
              uid: userId,
              companyId: mappedWithCompany.companyId,
              role: mappedWithCompany.role,
            });
          } else {
            // eslint-disable-next-line no-console
            console.log('[Auth] Normal sign-in path (no employee profile)', {
              uid: userId,
              companyId: mappedWithCompany.companyId,
              role: mappedWithCompany.role,
            });
          }
        }

        // Build permissions with proper priority: company-admin always gets full access
        const effectivePermissions = buildEffectivePermissions(
          mappedWithCompany,
          isContextCompanyAdmin ? null : employee, // Don't use employee for company admins
          { forceCompanyAdmin: isContextCompanyAdmin }
        );

        // Display name: prefer profile name, then employee name, then Clerk fallback
        const displayName =
          (profileFullName && profileFullName.trim()) ||
          (!isContextCompanyAdmin && employee?.fullName && employee.fullName.trim()) ||
          (!isContextCompanyAdmin && employee?.name && employee.name.trim()) ||
          (fallbackName && fallbackName.trim()) ||
          fallbackEmail ||
          'User';

        // Employee role: only set for non-admin users
        // Company admins should NOT have employeeRole set (it would affect routing)
        const employeeRoleForUser = isContextCompanyAdmin
          ? undefined
          : (employee?.role ?? employee?.employeeRole ?? undefined);

        const userWithDisplayName: User = {
          ...mappedWithCompany,
          name: displayName,
          employeeRole: employeeRoleForUser,
        };

        if (import.meta.env.DEV) {
          // Debug: Role resolution summary
          const accessPreview = buildEffectiveAccess(
            userWithDisplayName,
            isContextCompanyAdmin ? null : employee,
            effectivePermissions,
            { forceCompanyAdmin: isContextCompanyAdmin }
          );
          // eslint-disable-next-line no-console
          console.log('[Auth] === ROLE RESOLUTION SUMMARY ===', {
            currentUserId: userId,
            currentContextRole: contextRole,
            currentContextCompanyId: contextCompanyId,
            isContextCompanyAdmin,
            employeeLinkingSkipped,
            employeeProfileLoaded,
            finalUserRole: userWithDisplayName.role,
            finalEmployeeRole: employeeRoleForUser,
            finalLandingPage: accessPreview.landingPage,
            resolvedPermissionsModules: Object.keys(effectivePermissions)
              .filter((k) => (effectivePermissions as any)[k]?.view === true)
              .slice(0, 8),
          });
          // eslint-disable-next-line no-console
          console.log('[Employee Context] loaded employee', {
            employeeId: employee?.id ?? null,
            employeeFullName: employee?.fullName ?? null,
            employeeRole: employee?.employeeRole ?? employee?.role ?? null,
            companyId: userWithDisplayName.companyId,
            usedForRouting: !isContextCompanyAdmin,
          });
          // eslint-disable-next-line no-console
          console.log('[Employee Context] loaded permissions', {
            rawPermissions: employee?.permissions ?? null,
            effectivePermissions,
            isFullAccess: isContextCompanyAdmin,
          });
        }

        setUser(userWithDisplayName);
        setEmployeeProfile(employee);
        setPermissions(effectivePermissions);
        writeCachedUser(userWithDisplayName);
        setSetupIncomplete(false);
        setActivationResolved(true);
        confirmedSignedInRef.current = true;
        setAuthReady(true);
      } catch (error) {
        const cached = readCachedUser();
        if (cached && cached.id === userId && cached.companyId) {
          setUser(cached);
          setEmployeeProfile(null);
          setPermissions(buildEffectivePermissions(cached, null));
          writeCachedUser(cached);
          setSetupIncomplete(false);
          setActivationResolved(true);
          confirmedSignedInRef.current = true;
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
          setActivationResolved(true);
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
      Promise.resolve(clerkSignOut())
        .catch(() => {
          // Ignore sign-out errors; proceed with local cleanup
        })
        .finally(() => {
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

  const refreshUserProfile = async () => {
    if (isEmergencySession || !userId || !user) return;
    try {
      const { data: profileRow } = await db
        .core()
        .from('profiles')
        .select('avatar_url, full_name')
        .eq('clerk_user_id', userId)
        .maybeSingle();
      const clerkImageUrl = (clerkUser as { imageUrl?: string })?.imageUrl;
      const resolvedAvatar = profileRow?.avatar_url || clerkImageUrl || null;
      const resolvedName =
        profileRow?.full_name != null && String(profileRow.full_name).trim().length > 0
          ? String(profileRow.full_name)
          : user.name;
      const next = {
        ...user,
        name: resolvedName,
        avatar: resolvedAvatar ? String(resolvedAvatar) : undefined,
      };
      setUser(next);
      writeCachedUser(next);
    } catch {
      // Non-blocking
    }
  };

  const refreshAuthState = async (): Promise<{ landingPage: string } | null> => {
    if (isEmergencySession || !userId || !user) return null;
    try {
      // Check if user is company admin - they should NOT have their role overridden by employee profile
      const isCompanyAdmin =
        user.role === 'company-admin' ||
        (user as { role?: string }).role === 'company_admin';

      // Only load employee profile for non-admin users (for routing purposes)
      const employee = isCompanyAdmin ? null : await loadEmployeeProfile(userId);
      const employeeRoleForUser = isCompanyAdmin
        ? undefined
        : (employee?.role ?? employee?.employeeRole ?? undefined);

      const displayName =
        (!isCompanyAdmin && employee?.fullName && employee.fullName.trim()) ||
        (!isCompanyAdmin && employee?.name && employee.name.trim()) ||
        user.name ||
        'User';

      const nextUser: User = {
        ...user,
        name: displayName,
        employeeRole: employeeRoleForUser,
      };

      const effectivePermissions = buildEffectivePermissions(
        nextUser,
        employee,
        { forceCompanyAdmin: isCompanyAdmin }
      );
      const access = buildEffectiveAccess(
        nextUser,
        employee,
        effectivePermissions,
        { forceCompanyAdmin: isCompanyAdmin }
      );

      setUser(nextUser);
      setEmployeeProfile(employee);
      setPermissions(effectivePermissions);
      writeCachedUser(nextUser);

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[Auth] refreshAuthState applied', {
          uid: userId,
          isCompanyAdmin,
          employeeRole: employeeRoleForUser,
          landingPage: access.landingPage,
          allowedModules: access.allowedModules,
        });
      }
      return { landingPage: access.landingPage };
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] refreshAuthState failed', err);
      }
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        employeeProfile,
        permissions,
        effectiveAccess,
        isAuthenticated: !!user,
        authReady: authReady && activationResolved,
        isDeveloper,
        setupIncomplete,
        isEmergencySession: !!isEmergencySession,
        login,
        logout,
        switchRole,
        refreshUserAvatar,
        refreshUserProfile,
        refreshAuthState,
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
