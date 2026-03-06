import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import Index from '@/pages/Index';

const LAST_ROUTE_KEY = 'farmvault:last-route:v1';

/**
 * Handles the root path "/". Uses Clerk only so the page renders immediately.
 * Signed-in users are redirected to dashboard (RequireOnboarding will send to /onboarding if needed).
 */
export function RootRoute() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <Index />;
  }

  if (isSignedIn) {
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
