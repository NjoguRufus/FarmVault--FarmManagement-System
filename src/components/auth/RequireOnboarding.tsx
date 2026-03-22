import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import { SignInRedirect } from '@/components/auth/SignInRedirect';
import { SubscriptionAccessGate } from '@/components/subscription/SubscriptionAccessGate';
import { readPendingApprovalSession } from '@/lib/pendingApprovalSession';

interface RequireOnboardingProps {
  children: React.ReactElement;
}

/**
 * Enforces tenant onboarding for non-developer users.
 *
 * - Waits for authReady; shows loading until then.
 * - Developers bypass onboarding entirely (render children or redirect to /developer as configured).
 * - Redirect to /onboarding ONLY when setupIncomplete === true (never based on subscription/trial).
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
      console.log('[RequireOnboarding] Redirect to /sign-in (no user)', { authReady });
    }
    return <SignInRedirect />;
  }

  // Developers bypass onboarding; never redirect them to /onboarding.
  if (isDeveloper || user.role === 'developer') {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[RequireOnboarding] Developer bypass', { uid: user.id, companyId: user.companyId, role: user.role });
    }
    return <Navigate to="/developer" replace />;
  }

  // If this session has an employee profile (from RPC activation or existing membership),
  // skip owner onboarding and go straight to app. No client-side employees lookup here.
  if (employeeProfile) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Auth] Redirecting employee to /dashboard');
    }
    return children;
  }

  // Redirect ONLY when setupIncomplete is true AND there is no employee profile
  // (no invite match). Re-signup blocked (allow_resignup=false) still uses /start-fresh.
  if (setupIncomplete && !employeeProfile) {
    const pending = readPendingApprovalSession();
    const pendingCompanyId = pending?.companyId != null ? String(pending.companyId).trim() : '';
    if (pendingCompanyId) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[RequireOnboarding] Pending approval handoff → /pending-approval (avoid create-company loop)', {
          companyId: pendingCompanyId,
          setupIncomplete,
        });
      }
      return <Navigate to="/pending-approval" replace state={pending} />;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[RequireOnboarding] Owner onboarding path → /onboarding', {
        companyId: user.companyId,
        role: user.role,
        setupIncomplete,
      });
    }
    if (resetRequired) {
      // eslint-disable-next-line no-console
      console.warn('[AuthReset] Auto-onboarding skipped; routing reset user to Start Fresh gate');
      return <Navigate to="/start-fresh" replace state={{ from: location }} />;
    }
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[RequireOnboarding] Normal app path (no onboarding)', {
      uid: user.id,
      companyId: user.companyId,
      role: user.role,
      hasEmployeeProfile: !!employeeProfile,
      setupIncomplete,
    });
  }

  return <SubscriptionAccessGate>{children}</SubscriptionAccessGate>;
}
