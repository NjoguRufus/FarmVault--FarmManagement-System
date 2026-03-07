import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Index from '@/pages/Index';

const LAST_ROUTE_KEY = 'farmvault:last-route:v1';

/**
 * Handles the root path "/". Uses AuthContext so it works with or without Clerk.
 * Signed-in users are redirected to dashboard (RequireOnboarding will send to /onboarding if needed).
 * Does not block on Clerk or employee lookup; authReady timeout in AuthContext avoids indefinite loading.
 */
export function RootRoute() {
  const { authReady, isAuthenticated } = useAuth();

  if (!authReady) {
    return <Index />;
  }

  if (isAuthenticated) {
    let to = '/dashboard';
    try {
      const saved = window.localStorage.getItem(LAST_ROUTE_KEY) || '';
      if (saved && saved !== '/' && !saved.startsWith('/login') && !saved.startsWith('/sign-in')) {
        to = saved;
      }
    } catch {
      // ignore
    }
    return <Navigate to={to} replace />;
  }

  return <Index />;
}
