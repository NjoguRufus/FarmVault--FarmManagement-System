import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { SignInRedirect } from '@/components/auth/SignInRedirect';
import { SubscriptionAccessGate } from '@/components/subscription/SubscriptionAccessGate';
import { COMPANY_ONBOARDING_PATH } from '@/lib/routing/postAuthDestination';
import { logger } from "@/lib/logger";
interface RequireOnboardingProps {
  children: React.ReactElement;
}

/**
 * Enforces tenant onboarding for non-developer users.
 *
 * - Waits for authReady; shows loading until then.
 * - Developers bypass onboarding entirely (render children or redirect to /developer as configured).
 * - Redirect to /onboarding/company when setupIncomplete === true (no company/role or company onboarding_completed is false).
 */
export function RequireOnboarding({ children }: RequireOnboardingProps) {
  const { user, authReady, isDeveloper, setupIncomplete, employeeProfile, resetRequired } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <AuthLoadingScreen message="Preparing your FarmVault workspace..." />;
  }

  if (!user) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.debug('[RequireOnboarding] Redirect to /sign-in (no user)', { authReady });
    }
    return <SignInRedirect />;
  }

  // Developers bypass onboarding; never redirect them to company onboarding.
  if (isDeveloper || user.role === 'developer') {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.debug('[RequireOnboarding] Developer bypass', { uid: user.id, companyId: user.companyId, role: user.role });
    }
    return <Navigate to="/developer" replace />;
  }

  // Ambassador-only (from core.profiles.user_type): no RPC wait — avoids freeze if capabilities call hangs.
  const pt = user.profileUserType;
  if (pt === 'ambassador' || (pt === 'both' && !user.companyId)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.debug('[RequireOnboarding] Ambassador profile bypass → /ambassador/console/dashboard', {
        profileUserType: pt,
        companyId: user.companyId,
      });
    }
    return <Navigate to="/ambassador/console/dashboard" replace />;
  }

  // Workspace onboarding (company created but onboarding_completed is false) applies to all roles
  // until the company admin finishes the wizard — do not let employeeProfile bypass this.
  if (setupIncomplete) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.debug('[RequireOnboarding] Onboarding required → /onboarding/company', {
        companyId: user.companyId,
        role: user.role,
        setupIncomplete,
        hasEmployeeProfile: !!employeeProfile,
      });
    }
    if (resetRequired) {
      // eslint-disable-next-line no-console
      console.warn('[AuthReset] Auto-onboarding skipped; routing reset user to Start Fresh gate');
      return <Navigate to="/start-fresh" replace state={{ from: location }} />;
    }
    return <Navigate to={COMPANY_ONBOARDING_PATH} replace state={{ from: location }} />;
  }

  // Invited employee with a completed workspace: skip further onboarding gates.
  if (employeeProfile) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.debug('[Auth] Redirecting employee to app entry / home');
    }
    return children;
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.debug('[RequireOnboarding] Normal app path (no onboarding)', {
      uid: user.id,
      companyId: user.companyId,
      role: user.role,
      hasEmployeeProfile: !!employeeProfile,
      setupIncomplete,
    });
  }

  return <SubscriptionAccessGate>{children}</SubscriptionAccessGate>;
}
