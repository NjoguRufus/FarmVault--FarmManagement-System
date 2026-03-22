import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const LAST_ROUTE_KEY = 'farmvault:last-route:v1';
const NON_PERSISTED_PATHS = new Set([
  '/login',
  '/sign-in',
  '/sign-up',
  '/auth/callback',
  '/auth/continue',
  '/choose-plan',
  '/setup-company',
  '/setup',
  '/dev/sign-in',
  '/dev/sign-up',
  '/dev/bootstrap',
]);

export function RoutePersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, authReady } = useAuth();
  const didRestoreRef = useRef(false);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    const currentPath = location.pathname;
    const isPublicPath =
      currentPath === '/' ||
      NON_PERSISTED_PATHS.has(currentPath) ||
      currentPath.startsWith('/sign-in') ||
      currentPath.startsWith('/sign-up') ||
      currentPath.startsWith('/dev/');
    if (isPublicPath) return;

    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    try {
      window.localStorage.setItem(LAST_ROUTE_KEY, fullPath);
    } catch {
      // Ignore storage failures (private mode/quota).
    }
  }, [authReady, isAuthenticated, location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (didRestoreRef.current) return;
    if (!authReady || !isAuthenticated) return;

    // Only restore when app starts from root or is temporarily at login.
    if (location.pathname !== '/' && location.pathname !== '/login') {
      didRestoreRef.current = true;
      return;
    }

    let saved = '';
    try {
      saved = window.localStorage.getItem(LAST_ROUTE_KEY) || '';
    } catch {
      saved = '';
    }

    if (saved && saved !== '/' && !saved.startsWith('/login')) {
      didRestoreRef.current = true;
      navigate(saved, { replace: true });
      return;
    }

    didRestoreRef.current = true;
  }, [authReady, isAuthenticated, location.pathname, navigate]);

  return null;
}

