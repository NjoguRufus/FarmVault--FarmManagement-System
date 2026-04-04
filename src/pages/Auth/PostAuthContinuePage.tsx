/**
 * Single post-auth entry: Clerk and emergency flows land here after sign-in/sign-up.
 * Resolves onboarding vs app vs developer without sending users through the marketing home page.
 */
import React, { useEffect, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth as useClerkAuth } from '@clerk/react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';
import {
  pickIntendedRoute,
  readIntendedRouteFromStorage,
  clearIntendedRouteStorage,
} from '@/lib/routing/postAuth';
import { clearAmbassadorAccessIntent, readAmbassadorAccessIntent } from '@/lib/ambassador/accessIntent';
import { isAmbassadorSignupType } from '@/lib/ambassador/signupType';
import { readDashboardSurfacePreference } from '@/lib/dashboard/dashboardSurfacePreference';
import { useDashboardRoles } from '@/hooks/useDashboardRoles';

function normalizeLandingPath(landing: string): string {
  const l = (landing || '/dashboard').trim() || '/dashboard';
  if (l === '/admin') return '/developer';
  return l;
}

export default function PostAuthContinuePage() {
  const location = useLocation();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useClerkAuth();
  const {
    authReady,
    user,
    isDeveloper,
    setupIncomplete,
    employeeProfile,
    resetRequired,
    effectiveAccess,
    isEmergencySession,
  } = useAuth();
  const { hasCompany, hasAmbassador, loading: rolesLoading } = useDashboardRoles();

  const intended = useMemo(() => {
    const stored = readIntendedRouteFromStorage();
    return pickIntendedRoute((location.state as { from?: unknown } | null)?.from, stored);
  }, [location.state, location.key]);

  useEffect(() => {
    return () => {
      clearIntendedRouteStorage();
    };
  }, []);

  if (!clerkLoaded) {
    return <AuthLoadingScreen message="Completing sign-in…" />;
  }

  if (!clerkSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!authReady) {
    return <AuthLoadingScreen message="Preparing your workspace…" />;
  }

  // At this point Clerk is signed in and authReady is true. FarmVault user should exist; if not,
  // keep loading instead of bouncing to /sign-in (that looked like a failed password sign-in).
  if (!user) {
    return <AuthLoadingScreen message="Finishing sign-in…" />;
  }

  if (isEmergencySession) {
    const to = normalizeLandingPath(effectiveAccess.landingPage);
    return <Navigate to={to} replace />;
  }

  if (isDeveloper || user.role === 'developer') {
    return <Navigate to="/developer" replace />;
  }

  // Wait for DB role resolution before any role-conditional routing.
  // Must come before the ambassador intent check so we know whether the user
  // already has an ambassador profile before deciding where to send them.
  if (!isEmergencySession && rolesLoading) {
    return <AuthLoadingScreen message="Preparing your workspace…" />;
  }

  // Explicit ambassador funnel (user came via "Become Ambassador" link).
  // If they're already registered, skip onboarding and go straight to console.
  if (readAmbassadorAccessIntent()) {
    if (hasAmbassador) {
      clearAmbassadorAccessIntent();
      return <Navigate to="/ambassador/console/dashboard" replace />;
    }
    return <Navigate to="/ambassador/onboarding" replace />;
  }

  // Ambassador-only accounts must not land on company onboarding.
  if (hasAmbassador && !hasCompany) {
    return <Navigate to="/ambassador/console/dashboard" replace />;
  }

  // Company-only or no-setup-yet: only redirect to onboarding for non-ambassadors.
  if (setupIncomplete && !employeeProfile) {
    if (resetRequired) {
      return <Navigate to="/start-fresh" replace state={{ from: location }} />;
    }
    // Safety net: if the intent flag was lost but signup_type is still set
    // (bootstrap RPC threw and didn't clear it), route to ambassador onboarding
    // rather than company onboarding.
    if (isAmbassadorSignupType()) {
      return <Navigate to="/ambassador/onboarding" replace />;
    }
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  if (intended) {
    return <Navigate to={intended} replace />;
  }

  // Dual-role ("both"): respect last-chosen surface. Default = company dashboard.
  if (hasCompany && hasAmbassador && readDashboardSurfacePreference() === 'ambassador') {
    return <Navigate to="/ambassador/console/dashboard" replace />;
  }

  // Final safety net: effectiveAccess.landingPage returns '/staff/staff-dashboard' for
  // users with role='employee' (the normalizeRole(null) default for ambassador-only users).
  // Check profileUserType — set from core.profiles before authReady=true — to avoid
  // sending an ambassador to the staff shell when all other guards have been bypassed.
  const pt = user.profileUserType;
  if (pt === 'ambassador' || (pt === 'both' && !user.companyId)) {
    return <Navigate to="/ambassador/console/dashboard" replace />;
  }

  const to = normalizeLandingPath(effectiveAccess.landingPage);
  return <Navigate to={to} replace />;
}
