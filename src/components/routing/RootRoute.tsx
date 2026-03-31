import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import Index from '@/pages/Index';
import { isPublicProductionHost } from '@/lib/urls/domains';
import { isSafeAppRedirect } from '@/lib/routing/postAuth';
import { isAppRoutePath, pathnameFromFullPath } from '@/lib/routing/domainRoutes';

const LAST_ROUTE_KEY = 'farmvault:last-route:v1';

/**
 * Handles the root path "/". Uses AuthContext so it works with or without Clerk.
 * Signed-in users are redirected to dashboard (RequireOnboarding will send to /onboarding if needed).
 * While Clerk reports a session but FarmVault auth is still hydrating, show a shell instead of the marketing page.
 */
export function RootRoute() {
  const { authReady, isAuthenticated, clerkLoaded, clerkSignedIn, hasClerkSession } = useAuth();

  // Prevent the marketing landing from flashing while Clerk is still hydrating.
  // If Clerk hasn't loaded yet, we don't know whether a session exists.
  if (!clerkLoaded) {
    return <AuthLoadingScreen message="Loading…" />;
  }

  // Clerk is loaded at this point. If it reports a signed-in session but FarmVault bootstrap
  // (company/role/onboarding) isn't ready yet, keep the user on a loading screen.
  if (!authReady) {
    if (clerkSignedIn || hasClerkSession) {
      return <AuthLoadingScreen message="Signing you in…" />;
    }
    return <Index />;
  }

  if (isAuthenticated) {
    // On the public production domain, allow authenticated users to view marketing pages intentionally.
    // (The landing navbar will show an "Open Dashboard" button that goes to the app domain.)
    if (isPublicProductionHost()) {
      return <Index />;
    }
    let to = '/dashboard';
    try {
      const saved = window.localStorage.getItem(LAST_ROUTE_KEY) || '';
      const savedPathname = pathnameFromFullPath(saved);
      if (
        saved &&
        isSafeAppRedirect(saved) &&
        isAppRoutePath(savedPathname) &&
        !saved.startsWith('/login') &&
        !saved.startsWith('/sign-in')
      ) {
        to = saved;
      }
    } catch {
      // ignore
    }
    return <Navigate to={to} replace />;
  }

  return <Index />;
}
