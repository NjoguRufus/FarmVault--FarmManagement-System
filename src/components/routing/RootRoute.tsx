import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import Index from '@/pages/Index';
import { isPublicProductionHost } from '@/lib/urls/domains';
import { APP_ENTRY_PATH } from '@/lib/routing/appEntryPaths';

/**
 * Handles the root path "/". Signed-in farm users always pass through `APP_ENTRY_PATH`
 * so role is resolved before any admin or broker layout mounts.
 */
export function RootRoute() {
  const { authReady, isAuthenticated, clerkLoaded, clerkSignedIn, hasClerkSession } = useAuth();

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

  if (isAuthenticated) {
    return <Navigate to={APP_ENTRY_PATH} replace />;
  }

  return <Index />;
}
