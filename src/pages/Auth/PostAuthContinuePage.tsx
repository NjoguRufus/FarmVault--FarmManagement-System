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

  if (intended && intended.split('?')[0] === '/ambassador/onboarding') {
    return <Navigate to={intended} replace />;
  }

  if (isEmergencySession) {
    const to = normalizeLandingPath(effectiveAccess.landingPage);
    return <Navigate to={to} replace />;
  }

  if (isDeveloper || user.role === 'developer') {
    return <Navigate to="/developer" replace />;
  }

  if (setupIncomplete && !employeeProfile) {
    if (resetRequired) {
      return <Navigate to="/start-fresh" replace state={{ from: location }} />;
    }
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  if (intended) {
    return <Navigate to={intended} replace />;
  }

  const to = normalizeLandingPath(effectiveAccess.landingPage);
  return <Navigate to={to} replace />;
}
