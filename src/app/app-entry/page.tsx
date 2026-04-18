import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";
import { useUserRole } from "@/hooks/useUserRole";
import { APP_ENTRY_PATH } from "@/lib/routing/appEntryPaths";
import { resolvePostAuthDestination } from "@/lib/routing/postAuthDestination";
import { readAmbassadorAccessIntent } from "@/lib/ambassador/accessIntent";
import { isAmbassadorSignupType } from "@/lib/ambassador/signupType";
import { isSafeAppRedirect } from "@/lib/routing/postAuth";
import type { CanonicalEmployeeRole } from "@/lib/roles/canonicalEmployeeRole";

export type AppEntryLocationState = {
  intended?: string;
};

function defaultFarmHome(role: CanonicalEmployeeRole | null, landingPage: string): string {
  if (role === "BROKER") return "/broker";
  const p = (landingPage || "/dashboard").trim();
  if (!p || p === "/") return "/dashboard";
  if (p === "/admin") return "/developer";
  return p;
}

function intendedAllowedForRole(role: CanonicalEmployeeRole | null, rawIntended: string): boolean {
  const pathOnly = rawIntended.split(/[?#]/)[0].replace(/\/+/g, "/") || "/";
  const isBrokerPath = pathOnly === "/broker" || pathOnly.startsWith("/broker/");
  if (role === "BROKER") {
    return isBrokerPath || pathOnly === "/feedback";
  }
  return !isBrokerPath;
}

/**
 * Central gate after authentication: resolves onboarding and DB-backed role before any role-specific layout.
 */
export default function AppEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const intended = ((location.state as AppEntryLocationState | null)?.intended ?? "").trim();

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
  const { role, loading: roleGateLoading } = useUserRole();
  const didRun = useRef(false);

  useLayoutEffect(() => {
    if (!authReady || !user || roleGateLoading || didRun.current) return;

    if (isEmergencySession) {
      const to = (effectiveAccess.landingPage || "/dashboard").trim() || "/dashboard";
      const normalized = to === "/admin" ? "/developer" : to;
      didRun.current = true;
      navigate(normalized, { replace: true });
      return;
    }

    if (isDeveloper || user.role === "developer") {
      didRun.current = true;
      navigate("/developer", { replace: true });
      return;
    }

    const hasAmbassadorAccessIntent = readAmbassadorAccessIntent();
    const pre = resolvePostAuthDestination({
      user,
      isDeveloper: false,
      setupIncomplete,
      employeeProfile,
      resetRequired,
      effectiveAccessLandingPage: effectiveAccess.landingPage,
      hasAmbassadorAccessIntent,
      isAmbassadorSignupType: isAmbassadorSignupType(),
    });

    if (pre !== APP_ENTRY_PATH) {
      didRun.current = true;
      navigate(pre, { replace: true });
      return;
    }

    let target = defaultFarmHome(role, effectiveAccess.landingPage);
    if (intended && isSafeAppRedirect(intended) && intendedAllowedForRole(role, intended)) {
      target = intended.split("#")[0];
    }

    didRun.current = true;
    navigate(target, { replace: true });
  }, [
    authReady,
    user,
    roleGateLoading,
    isEmergencySession,
    isDeveloper,
    setupIncomplete,
    employeeProfile,
    resetRequired,
    effectiveAccess.landingPage,
    role,
    intended,
    navigate,
  ]);

  return <AuthLoadingScreen message="Routing to your workspace…" />;
}
