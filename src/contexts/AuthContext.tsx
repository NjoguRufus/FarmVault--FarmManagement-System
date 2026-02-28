import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, UserRole, Employee, PermissionMap } from '@/types';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getDefaultPermissions, getFullAccessPermissions, resolvePermissions } from '@/lib/permissions';
import { getCompany } from '@/services/companyService';

interface AuthContextType {
  user: User | null;
  employeeProfile: Employee | null;
  permissions: PermissionMap;
  isAuthenticated: boolean;
  authReady: boolean;
  /** True when user is signed in but users/{uid} is missing companyId/role (setup incomplete). */
  setupIncomplete: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_USER_CACHE_KEY = 'farmvault:auth:user:v1';

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

function mapEmployeeDoc(docId: string, raw: any): Employee {
  const joinDate = raw?.joinDate?.toDate ? raw.joinDate.toDate() : raw?.joinDate;
  const createdAt = raw?.createdAt?.toDate ? raw.createdAt.toDate() : raw?.createdAt;

  return {
    id: docId,
    companyId: String(raw?.companyId || ''),
    name: String(raw?.name || raw?.fullName || 'User'),
    fullName: raw?.fullName ? String(raw.fullName) : raw?.name ? String(raw.name) : undefined,
    email: raw?.email ? String(raw.email) : undefined,
    phone: raw?.phone ? String(raw.phone) : undefined,
    contact: raw?.contact ? String(raw.contact) : undefined,
    role: raw?.role ?? null,
    employeeRole: raw?.employeeRole ?? raw?.role ?? null,
    department: raw?.department ? String(raw.department) : undefined,
    status: raw?.status || 'active',
    permissions: raw?.permissions,
    joinDate: joinDate ?? undefined,
    createdAt: createdAt ?? undefined,
    createdBy: raw?.createdBy ? String(raw.createdBy) : undefined,
    authUserId: raw?.authUserId ? String(raw.authUserId) : undefined,
  };
}

async function loadEmployeeProfile(uid: string): Promise<Employee | null> {
  const employeeRefByUid = doc(db, 'employees', uid);
  const employeeSnapByUid = await getDoc(employeeRefByUid);
  if (employeeSnapByUid.exists()) {
    const byUid = mapEmployeeDoc(employeeSnapByUid.id, employeeSnapByUid.data());
    if (!byUid.authUserId || byUid.authUserId === uid) {
      return byUid;
    }
  }

  const employeeQuery = query(
    collection(db, 'employees'),
    where('authUserId', '==', uid),
    limit(1),
  );
  const employeeSnap = await getDocs(employeeQuery);
  const first = employeeSnap.docs[0];
  if (!first) return null;
  return mapEmployeeDoc(first.id, first.data());
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

function normalizeRole(role: string | null | undefined): UserRole {
  const r = (role || '').toString();
  if (r === 'company_admin') return 'company-admin';
  if (r === 'company-admin' || r === 'developer' || r === 'manager' || r === 'broker' || r === 'employee') return r as UserRole;
  return 'employee';
}

function mapUserFromUserDoc(uid: string, email: string, userData: any): User {
  return {
    id: uid,
    email: userData?.email || email || '',
    name: userData?.name || 'User',
    role: normalizeRole(userData?.role),
    employeeRole: userData?.employeeRole ?? undefined,
    companyId: userData?.companyId ?? null,
    avatar: userData?.avatar,
    createdAt: userData?.createdAt?.toDate ? userData.createdAt.toDate() : new Date(),
    ...(userData?.permissions ? { permissions: userData.permissions } : {}),
  } as User;
}

/** User doc is complete when it has role and companyId (or user is developer). */
function isUserSetupComplete(data: { role?: string | null; companyId?: string | null } | null): boolean {
  if (!data) return false;
  const role = normalizeRole(data.role);
  if (role === 'developer') return true;
  return Boolean(data.companyId && role);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [employeeProfile, setEmployeeProfile] = useState<Employee | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>(() => getDefaultPermissions());
  const [authReady, setAuthReady] = useState(false);
  const [setupIncomplete, setSetupIncomplete] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setSetupIncomplete(false);
      if (!firebaseUser) {
        setUser(null);
        setEmployeeProfile(null);
        setPermissions(getDefaultPermissions());
        writeCachedUser(null);
        setAuthReady(true);
        return;
      }
      const profileRef = doc(db, 'users', firebaseUser.uid);

      try {
        // Retry reading user doc so onboarding has time to write it after sign-up
        let snap = await getDoc(profileRef);
        for (const delayMs of [400, 900, 1800]) {
          if (snap.exists()) break;
          await new Promise((r) => setTimeout(r, delayMs));
          snap = await getDoc(profileRef);
        }

        const employee = await loadEmployeeProfile(firebaseUser.uid);

        if (snap.exists()) {
          const data = snap.data() as any;
          if (!isUserSetupComplete(data)) {
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: data?.name || 'User',
              role: 'employee',
              employeeRole: undefined,
              companyId: null,
              avatar: undefined,
              createdAt: new Date(),
            });
            setEmployeeProfile(null);
            setPermissions(getDefaultPermissions());
            setSetupIncomplete(true);
            writeCachedUser(null);
            setAuthReady(true);
            return;
          }
          const mapped = mapUserFromUserDoc(firebaseUser.uid, firebaseUser.email || '', data);
          const effectivePermissions = buildEffectivePermissions(mapped, employee);
          setUser(mapped);
          setEmployeeProfile(employee);
          setPermissions(effectivePermissions);
          writeCachedUser(mapped);
          setAuthReady(true);
          if (import.meta.env.DEV && firebaseUser.uid && mapped.companyId) {
            getCompany(mapped.companyId)
              .then((company) => {
                console.log('[Auth] Profile loaded:', {
                  uid: firebaseUser.uid,
                  role: mapped.role,
                  companyId: mapped.companyId,
                  companyName: company?.name ?? '(none)',
                });
              })
              .catch(() => {
                console.log('[Auth] Profile loaded:', {
                  uid: firebaseUser.uid,
                  role: mapped.role,
                  companyId: mapped.companyId,
                  companyName: '(fetch failed)',
                });
              });
          }
          return;
        }

        if (employee?.companyId) {
          const mappedEmployeeRole = employee.employeeRole ?? employee.role ?? null;
          const mapped: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || employee.email || '',
            name: employee.name || employee.fullName || 'User',
            role: getAppRoleFromEmployeeRole(mappedEmployeeRole),
            employeeRole: mappedEmployeeRole ?? undefined,
            companyId: employee.companyId ?? null,
            avatar: undefined,
            createdAt: new Date(),
          };
          await setDoc(
            profileRef,
            {
              id: firebaseUser.uid,
              email: mapped.email,
              name: mapped.name,
              role: mapped.role,
              employeeRole: mapped.employeeRole ?? null,
              companyId: mapped.companyId ?? null,
              permissions: employee.permissions ?? null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          const effectivePermissions = buildEffectivePermissions(mapped, employee);
          setUser(mapped);
          setEmployeeProfile(employee);
          setPermissions(effectivePermissions);
          writeCachedUser(mapped);
          setAuthReady(true);
          return;
        }

        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || 'User',
          role: 'employee',
          employeeRole: undefined,
          companyId: null,
          avatar: undefined,
          createdAt: new Date(),
        });
        setEmployeeProfile(null);
        setPermissions(getDefaultPermissions());
        setSetupIncomplete(true);
        writeCachedUser(null);
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        const isPermissionDenied = code === 'permission-denied';
        const cached = readCachedUser();
        if (!isPermissionDenied && cached && cached.id === firebaseUser.uid && cached.companyId) {
          setUser(cached);
          setEmployeeProfile(null);
          setPermissions(buildEffectivePermissions(cached, null));
          writeCachedUser(cached);
        } else {
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'User',
            role: 'employee',
            employeeRole: undefined,
            companyId: null,
            avatar: undefined,
            createdAt: new Date(),
          });
          setEmployeeProfile(null);
          setPermissions(getDefaultPermissions());
          setSetupIncomplete(true);
          writeCachedUser(null);
        }
        console.warn('[Auth] Profile load failed:', error);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    setSetupIncomplete(false);
    const profileRef = doc(db, 'users', credential.user.uid);
    const employee = await loadEmployeeProfile(credential.user.uid);
    const snap = await getDoc(profileRef);

    if (snap.exists()) {
      const data = snap.data() as any;
      if (!isUserSetupComplete(data)) {
        setUser({
          id: credential.user.uid,
          email: credential.user.email || '',
          name: data?.name || 'User',
          role: 'employee',
          employeeRole: undefined,
          companyId: null,
          avatar: undefined,
          createdAt: new Date(),
        });
        setEmployeeProfile(null);
        setPermissions(getDefaultPermissions());
        setSetupIncomplete(true);
        writeCachedUser(null);
        return;
      }
      const mapped = mapUserFromUserDoc(credential.user.uid, credential.user.email || '', data);
      setUser(mapped);
      setEmployeeProfile(employee);
      setPermissions(buildEffectivePermissions(mapped, employee));
      writeCachedUser(mapped);
      return;
    }

    if (employee?.companyId) {
      const mappedEmployeeRole = employee.employeeRole ?? employee.role ?? null;
      const mapped: User = {
        id: credential.user.uid,
        email: credential.user.email || employee.email || '',
        name: employee.name || employee.fullName || 'User',
        role: getAppRoleFromEmployeeRole(mappedEmployeeRole),
        employeeRole: mappedEmployeeRole ?? undefined,
        companyId: employee.companyId ?? null,
        avatar: undefined,
        createdAt: new Date(),
      };
      await setDoc(
        profileRef,
        {
          id: credential.user.uid,
          email: mapped.email,
          name: mapped.name,
          role: mapped.role,
          employeeRole: mapped.employeeRole ?? null,
          companyId: mapped.companyId ?? null,
          permissions: employee.permissions ?? null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setUser(mapped);
      setEmployeeProfile(employee);
      setPermissions(buildEffectivePermissions(mapped, employee));
      writeCachedUser(mapped);
      return;
    }

    setUser({
      id: credential.user.uid,
      email: credential.user.email || '',
      name: credential.user.displayName || 'User',
      role: 'employee',
      employeeRole: undefined,
      companyId: null,
      avatar: undefined,
      createdAt: new Date(),
    });
    setEmployeeProfile(null);
    setPermissions(getDefaultPermissions());
    setSetupIncomplete(true);
    writeCachedUser(null);
  };

  const logout = () => {
    // Sign out from Firebase and clear local user
    signOut(auth).finally(() => {
      setUser(null);
      setEmployeeProfile(null);
      setPermissions(getDefaultPermissions());
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
