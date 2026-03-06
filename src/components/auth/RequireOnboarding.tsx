import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

interface RequireOnboardingProps {
  children: React.ReactElement;
}

/**
 * Enforces tenant onboarding for non-developer users.
 *
 * - Waits for authReady; shows loading until then.
 * - Developers bypass onboarding entirely (render children or redirect to /admin as configured).
 * - Redirect to /onboarding ONLY when setupIncomplete === true (never based on subscription/trial).
 */
export function RequireOnboarding({ children }: RequireOnboardingProps) {
  const { user, authReady, isDeveloper, setupIncomplete } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AuthLoadingScreen message="Preparing your FarmVault workspace..." />;
  }

  if (!user) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[RequireOnboarding] Redirect to /sign-in (no user)', { authReady });
    }
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  // Developers bypass onboarding; never redirect them to /onboarding.
  if (isDeveloper || user.role === 'developer') {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[RequireOnboarding] Developer bypass', { uid: user.id, companyId: user.companyId, role: user.role });
    }
    return <Navigate to="/admin" replace />;
  }

  // Redirect ONLY when setupIncomplete is true (missing company_id or role from current_context).
  // Do NOT redirect based on subscription/trial state.
  if (setupIncomplete) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[RequireOnboarding] Redirect to /onboarding (setupIncomplete)', {
        companyId: user.companyId,
        role: user.role,
        setupIncomplete,
      });
    }
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  return children;
}
