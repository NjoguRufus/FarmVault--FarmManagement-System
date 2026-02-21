import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  authReady: boolean;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        writeCachedUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          // Try to load from employees (in case user doc wasn't created)
          const empQ = query(collection(db, 'employees'), where('authUserId', '==', firebaseUser.uid));
          const empSnap = await getDocs(empQ);
          const emp = empSnap.docs[0]?.data();
          if (emp) {
            const appRole = emp.role === 'operations-manager' ? 'manager' : emp.role === 'sales-broker' ? 'broker' : 'employee';
            const mapped: User = {
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: emp.name || 'User',
              role: appRole,
              employeeRole: emp.role,
              companyId: emp.companyId ?? null,
              avatar: undefined,
              createdAt: new Date(),
            };
            setUser(mapped);
            writeCachedUser(mapped);
          } else {
            const mapped: User = {
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'User',
              role: 'employee',
              employeeRole: undefined,
              companyId: null,
              avatar: undefined,
              createdAt: new Date(),
            };
            setUser(mapped);
            writeCachedUser(mapped);
          }
          return;
        }
        const data = snap.data() as any;
        const mapped: User = {
          id: firebaseUser.uid,
          email: data.email || firebaseUser.email || '',
          name: data.name || 'User',
          role: data.role || 'employee',
          employeeRole: data.employeeRole,
          companyId: data.companyId ?? null,
          avatar: data.avatar,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        };
        setUser(mapped);
        writeCachedUser(mapped);
      } catch (error) {
        // If profile reads fail offline, keep user logged in from cache/fallback.
        const cached = readCachedUser();
        if (cached && cached.id === firebaseUser.uid) {
          setUser(cached);
        } else {
          const fallback: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'User',
            role: 'employee',
            employeeRole: undefined,
            companyId: null,
            avatar: undefined,
            createdAt: new Date(),
          };
          setUser(fallback);
          writeCachedUser(fallback);
        }
        console.warn('[Auth] Falling back to cached user profile while offline:', error);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    // Load user profile immediately so UI updates without waiting for onAuthStateChanged
    const profileRef = doc(db, 'users', credential.user.uid);
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      const data = snap.data() as any;
      const mapped: User = {
        id: credential.user.uid,
        email: data.email || credential.user.email || '',
        name: data.name || 'User',
        role: data.role || 'employee',
        employeeRole: data.employeeRole,
        companyId: data.companyId ?? null,
        avatar: data.avatar,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      };
      setUser(mapped);
      writeCachedUser(mapped);
    } else {
      // User doc missing — try employees collection (e.g. new broker/sales employee)
      const empQ = query(collection(db, 'employees'), where('authUserId', '==', credential.user.uid));
      const empSnap = await getDocs(empQ);
      const emp = empSnap.docs[0]?.data();
      if (emp) {
        const appRole = emp.role === 'operations-manager' ? 'manager' : emp.role === 'sales-broker' ? 'broker' : 'employee';
        const mapped: User = {
          id: credential.user.uid,
          email: credential.user.email || '',
          name: emp.name || 'User',
          role: appRole,
          employeeRole: emp.role,
          companyId: emp.companyId ?? null,
          avatar: undefined,
          createdAt: new Date(),
        };
        setUser(mapped);
        writeCachedUser(mapped);
      } else {
        const mapped: User = {
          id: credential.user.uid,
          email: credential.user.email || '',
          name: credential.user.displayName || 'User',
          role: 'employee',
          employeeRole: undefined,
          companyId: null,
          avatar: undefined,
          createdAt: new Date(),
        };
        setUser(mapped);
        writeCachedUser(mapped);
      }
    }
  };

  const logout = () => {
    // Sign out from Firebase and clear local user
    signOut(auth).finally(() => {
      setUser(null);
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
        isAuthenticated: !!user,
        authReady,
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
