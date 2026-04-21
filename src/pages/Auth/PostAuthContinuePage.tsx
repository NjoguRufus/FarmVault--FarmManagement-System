/**
 * Single post-auth entry: Clerk and emergency flows land here after sign-in/sign-up.
 * Delegates destination to `resolvePostAuthDestination` (see `lib/routing/postAuthDestination`).
 */
import React, { useEffect, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import {
  pickIntendedRoute,
  readIntendedRouteFromStorage,
  clearIntendedRouteStorage,
} from "@/lib/routing/postAuth";
import { clearAmbassadorAccessIntent, readAmbassadorAccessIntent } from "@/lib/ambassador/accessIntent";
import { isAmbassadorSignupType } from "@/lib/ambassador/signupType";
import {
  AMBASSADOR_CONSOLE_DASHBOARD_PATH,
  resolvePostAuthDestination,
} from "@/lib/routing/postAuthDestination";
import { APP_ENTRY_PATH } from "@/lib/routing/appEntryPaths";

function normalizeEmergencyLanding(landing: string): string {
  const l = (landing || "/home").trim() || "/home";
  if (l === "/admin") return "/developer";
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

  if (!user) {
    return <AuthLoadingScreen message="Finishing sign-in…" />;
  }

  if (isEmergencySession) {
    const to = normalizeEmergencyLanding(effectiveAccess.landingPage);
    return <Navigate to={to} replace />;
  }

  if (isDeveloper || user.role === "developer") {
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

  if (hasAmbassadorIntent && user.companyId) {
    clearAmbassadorAccessIntent();
  }

  if (
    hasAmbassadorIntent &&
    (user.profileUserType === "ambassador" || user.profileUserType === "both") &&
    dest === AMBASSADOR_CONSOLE_DASHBOARD_PATH
  ) {
    clearAmbassadorAccessIntent();
  }

  if (setupIncomplete) {
    return <Navigate to={dest} replace state={{ from: location }} />;
  }

  if (dest !== APP_ENTRY_PATH) {
    return <Navigate to={dest} replace />;
  }

  return <Navigate to={APP_ENTRY_PATH} replace state={{ intended: intended || undefined }} />;
}
