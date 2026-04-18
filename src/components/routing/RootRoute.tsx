import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import Index from '@/pages/Index';
import { isPublicProductionHost } from '@/lib/urls/domains';
import { isSafeAppRedirect } from '@/lib/routing/postAuth';
import { isAppRoutePath, pathnameFromFullPath } from '@/lib/routing/domainRoutes';
import { readAmbassadorAccessIntent } from '@/lib/ambassador/accessIntent';
import { isAmbassadorSignupType } from '@/lib/ambassador/signupType';
import { resolvePostAuthDestination } from '@/lib/routing/postAuthDestination';
import { useUserRole } from '@/hooks/useUserRole';

const LAST_ROUTE_KEY = 'farmvault:last-route:v1';

/**
 * Handles the root path "/". Uses AuthContext so it works with or without Clerk.
 * Signed-in users are routed by role and onboarding (not hardcoded /dashboard).
 */
export function RootRoute() {
  const {
    authReady,
    isAuthenticated,
    clerkLoaded,
    clerkSignedIn,
    hasClerkSession,
    user,
    setupIncomplete,
    employeeProfile,
    resetRequired,
    effectiveAccess,
    isDeveloper,
    isEmergencySession,
  } = useAuth();
  const { loading: roleLoading, role: canonicalRole } = useUserRole();

  // Public marketing domain should always open the landing page immediately.
  if (isPublicProductionHost()) {
    return <Index />;
  }

  if (!clerkLoaded) {
    return <AuthLoadingScreen message="Loading…" />;
  }

  if (!authReady) {
    if (clerkSignedIn || hasClerkSession) {
      return <AuthLoadingScreen message="Signing you in…" />;
    }
    return <Index />;
  }

  if (isAuthenticated && user) {
    if (roleLoading) {
      return <AuthLoadingScreen message="Loading your workspace…" />;
    }

    if (isEmergencySession) {
      const to = (effectiveAccess.landingPage || '/dashboard').trim() || '/dashboard';
      return <Navigate to={to} replace />;
    }

    if (isDeveloper || user.role === 'developer') {
      return <Navigate to="/developer" replace />;
    }

    const hasAmbassadorIntent = readAmbassadorAccessIntent();
    const dest = resolvePostAuthDestination({
      user,
      isDeveloper: false,
      setupIncomplete,
      employeeProfile,
      resetRequired,
      effectiveAccessLandingPage: effectiveAccess.landingPage,
      hasAmbassadorAccessIntent: hasAmbassadorIntent,
      isAmbassadorSignupType: isAmbassadorSignupType(),
    });

    let to = dest;
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
        if (
          canonicalRole === 'BROKER' &&
          (savedPathname === '/dashboard' ||
            savedPathname === '/app' ||
            savedPathname.startsWith('/app/'))
        ) {
          to = '/broker';
        }
      }
    } catch {
      // ignore
    }
    return <Navigate to={to} replace />;
  }

  return <Index />;
}
