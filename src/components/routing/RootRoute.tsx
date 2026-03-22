import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import Index from '@/pages/Index';

const LAST_ROUTE_KEY = 'farmvault:last-route:v1';

/**
 * Handles the root path "/". Uses AuthContext so it works with or without Clerk.
 * Signed-in users are redirected to dashboard (RequireOnboarding will send to /onboarding if needed).
 * While Clerk reports a session but FarmVault auth is still hydrating, show a shell instead of the marketing page.
 */
export function RootRoute() {
  const { authReady, isAuthenticated, hasClerkSession } = useAuth();

  if (!authReady) {
    if (hasClerkSession) {
      return <AuthLoadingScreen message="Signing you in…" />;
    }
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
