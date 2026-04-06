import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/react";
import { readAmbassadorAccessIntent } from "@/lib/ambassador/accessIntent";
import { isAmbassadorClerkFlow } from "@/lib/ambassador/clerkAuth";
import { useAuth } from "@/contexts/AuthContext";
import {
  AUTH_CONTINUE_PATH,
  COMPANY_ONBOARDING_PATH,
  isClerkSignUpContinuationPath,
  isSignedOutOnlyMarketingAuthPath,
  isTopLevelSignInOrSignUpPath,
  resolvePostAuthDestination,
  resolveSignedInTopLevelAuthDestination,
} from "@/lib/routing/postAuthDestination";
import { isAmbassadorSignupType } from "@/lib/ambassador/signupType";

/**
 * When Clerk already has a session but the user is still on auth UI (stale tab, interrupted redirect),
 * send them through the centralized post-auth router. Does not block rendering elsewhere.
 */
export function SignedInAuthEscape() {
  const { isLoaded, isSignedIn } = useClerkAuth();
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
  const location = useLocation();
  const navigate = useNavigate();
  const didRun = useRef(false);

  useEffect(() => {
    didRun.current = false;
  }, [location.pathname, location.search, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || didRun.current) return;

    if (isClerkSignUpContinuationPath(location.pathname)) return;

    if (!isSignedOutOnlyMarketingAuthPath(location.pathname)) return;

    const ambassadorQuery = isAmbassadorClerkFlow(location.search);

    if (readAmbassadorAccessIntent() || ambassadorQuery) {
      if (location.pathname === "/auth/ambassador-continue") {
        didRun.current = true;
        return;
      }
      didRun.current = true;
      navigate("/auth/ambassador-continue", { replace: true });
      return;
    }

    // Skip `/auth/callback` here: that route is for Clerk’s OAuth return only — it forwards to `/auth/continue`.
    if (!authReady) {
      if (location.pathname === AUTH_CONTINUE_PATH) {
        didRun.current = true;
        return;
      }
      didRun.current = true;
      navigate(AUTH_CONTINUE_PATH, { replace: true });
      return;
    }

    // Clerk session exists but FarmVault has no platform user yet — company onboarding, not /sign-up.
    if (!user) {
      if (
        location.pathname === COMPANY_ONBOARDING_PATH ||
        location.pathname.startsWith("/onboarding/")
      ) {
        didRun.current = true;
        return;
      }
      didRun.current = true;
      navigate(COMPANY_ONBOARDING_PATH, { replace: true });
      return;
    }

    if (isEmergencySession) {
      didRun.current = true;
      const to = (effectiveAccess.landingPage || "/dashboard").trim() || "/dashboard";
      const normalized = to === "/admin" ? "/developer" : to;
      if (location.pathname !== normalized) {
        navigate(normalized, { replace: true });
      }
      return;
    }

    const dest = isTopLevelSignInOrSignUpPath(location.pathname)
      ? resolveSignedInTopLevelAuthDestination({
          user,
          employeeProfile,
          isDeveloper,
          setupIncomplete,
          resetRequired,
          isEmergencySession: false,
          effectiveAccessLandingPage: effectiveAccess.landingPage,
        })
      : resolvePostAuthDestination({
          user,
          isDeveloper,
          setupIncomplete,
          employeeProfile,
          resetRequired,
          effectiveAccessLandingPage: effectiveAccess.landingPage,
          hasAmbassadorAccessIntent: false,
          isAmbassadorSignupType: isAmbassadorSignupType(),
        });

    if (location.pathname === dest) {
      didRun.current = true;
      return;
    }

    didRun.current = true;
    navigate(dest, { replace: true });
  }, [
    isLoaded,
    isSignedIn,
    authReady,
    user,
    isDeveloper,
    setupIncomplete,
    employeeProfile,
    resetRequired,
    effectiveAccess.landingPage,
    isEmergencySession,
    location.pathname,
    location.search,
    navigate,
  ]);

  return null;
}
