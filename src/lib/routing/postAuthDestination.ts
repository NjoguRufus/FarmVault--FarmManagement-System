import type { Employee, User } from "@/types";
import { APP_ENTRY_PATH } from "@/lib/routing/appEntryPaths";

function normalizeLandingPath(landing: string): string {
  const l = (landing || "/dashboard").trim() || "/dashboard";
  if (l === "/admin") return "/developer";
  return l;
}

/** Canonical company onboarding URL (sign-up / post-auth land here when no company). */
export const COMPANY_ONBOARDING_PATH = "/onboarding/company";

export const AMBASSADOR_CONSOLE_DASHBOARD_PATH = "/ambassador/console/dashboard";

/** Clerk OAuth return + default `afterSignInUrl` / `afterSignUpUrl` — hands off to `/auth/callback` → `/auth/continue` → app entry. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** Full post-auth resolution (ambassador funnel, intended routes). */
export const AUTH_CONTINUE_PATH = "/auth/continue";

/** True when the user should use the ambassador console as their primary home (no farm tenant). */
export function isAmbassadorPrimaryHomeUser(user: User | null | undefined): boolean {
  if (!user || user.companyId) return false;
  const pt = user.profileUserType;
  return pt === "ambassador" || pt === "both";
}

export type ResolvePostAuthDestinationInput = {
  user: User;
  isDeveloper: boolean;
  setupIncomplete: boolean;
  employeeProfile: Employee | null;
  resetRequired: boolean;
  effectiveAccessLandingPage: string;
  /** LocalStorage / query: explicit ambassador signup or sign-in funnel. */
  hasAmbassadorAccessIntent: boolean;
  /** Session flag from ambassador sign-up (may lag profile user_type). */
  isAmbassadorSignupType: boolean;
};

/**
 * Single routing decision after Clerk session exists and FarmVault auth is ready.
 * Order: developer → ambassador funnel intent → ambassador profile (no company) → company onboarding → app landing.
 */
export function resolvePostAuthDestination(input: ResolvePostAuthDestinationInput): string {
  const {
    user,
    isDeveloper,
    setupIncomplete,
    employeeProfile,
    resetRequired,
    hasAmbassadorAccessIntent,
    isAmbassadorSignupType,
  } = input;

  if (isDeveloper || user.role === "developer") {
    return "/developer";
  }

  if (hasAmbassadorAccessIntent) {
    // Already has a farm workspace — company app wins over ambassador funnel flag.
    if (user.companyId) {
      /* fall through */
    } else {
      const pt = user.profileUserType;
      if (pt === "ambassador" || pt === "both") {
        return AMBASSADOR_CONSOLE_DASHBOARD_PATH;
      }
      return "/ambassador/onboarding";
    }
  }

  if (isAmbassadorPrimaryHomeUser(user)) {
    return AMBASSADOR_CONSOLE_DASHBOARD_PATH;
  }

  if (setupIncomplete) {
    if (resetRequired && !employeeProfile) {
      return "/start-fresh";
    }
    if (isAmbassadorSignupType) {
      return "/ambassador/onboarding";
    }
    return COMPANY_ONBOARDING_PATH;
  }

  return APP_ENTRY_PATH;
}

/** Exact `/sign-in` or `/sign-up` only — not `/sign-in/*` (Clerk MFA / SSO substeps must not be interrupted). */
export function isTopLevelSignInOrSignUpPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/sign-in" || p === "/sign-up";
}

export type ResolveSignedInTopLevelAuthDestinationInput = {
  user: User;
  employeeProfile: Employee | null;
  isDeveloper: boolean;
  setupIncomplete: boolean;
  resetRequired: boolean;
  isEmergencySession: boolean;
  effectiveAccessLandingPage: string;
};

/**
 * When Clerk is signed in but the router is still on top-level sign-in / sign-up, pick the bootstrap route.
 * Order matches product rule: ambassador home → dashboard (has workspace) → company onboarding.
 */
export function resolveSignedInTopLevelAuthDestination(
  input: ResolveSignedInTopLevelAuthDestinationInput,
): string {
  const {
    user,
    employeeProfile,
    isDeveloper,
    setupIncomplete,
    resetRequired,
    isEmergencySession,
    effectiveAccessLandingPage,
  } = input;

  if (isDeveloper || user.role === "developer") {
    return "/developer";
  }

  if (isEmergencySession) {
    return normalizeLandingPath(effectiveAccessLandingPage);
  }

  if (resetRequired && setupIncomplete && !employeeProfile) {
    return "/start-fresh";
  }

  if (isAmbassadorPrimaryHomeUser(user)) {
    return AMBASSADOR_CONSOLE_DASHBOARD_PATH;
  }

  const hasCompany = Boolean(user.companyId) || Boolean(employeeProfile);
  if (hasCompany) {
    return APP_ENTRY_PATH;
  }

  return COMPANY_ONBOARDING_PATH;
}

/** Paths where a signed-in user should be forwarded into the app (Clerk continuation paths excluded). */
export function isSignedOutOnlyMarketingAuthPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/sign-in") return true;
  if (p === "/sign-up") return true;
  if (p === "/scan") return true;
  return false;
}

export function isClerkSignUpContinuationPath(pathname: string): boolean {
  return pathname.startsWith("/sign-up/");
}
