import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import Index from '@/pages/Index';

const LAST_ROUTE_KEY = 'farmvault:last-route:v1';

/**
 * Handles the root path "/". When the user is logged in, redirect to dashboard
 * (or last saved route) so they never see the landing page. When not logged in,
 * show the landing page. While auth is still loading, show a loading screen.
 */
export function RootRoute() {
  const { authReady, isAuthenticated, setupIncomplete } = useAuth();

  if (!authReady) {
    return <AuthLoadingScreen message="Loading…" />;
  }

  if (isAuthenticated) {
    if (setupIncomplete) {
      return <Navigate to="/setup-company" replace state={{ message: 'Your company setup is incomplete. Please finish setup.' }} />;
    }
    let to = '/dashboard';
    try {
      const saved = window.localStorage.getItem(LAST_ROUTE_KEY) || '';
      if (saved && saved !== '/' && !saved.startsWith('/login')) {
        to = saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return <Navigate to={to} replace />;
  }

  return <Index />;
}
