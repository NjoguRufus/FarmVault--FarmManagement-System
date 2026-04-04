/** Query string for standard Clerk SignUp / SignIn pages to land on ambassador onboarding after auth. */
export const AMBASSADOR_CLERK_FLOW = "ambassador";

/** Clerk `afterSignInUrl` / `afterSignUpUrl` for ambassador flow — resolves dashboard vs onboarding without access-revoked. */
export const AMBASSADOR_POST_AUTH_PATH = "/auth/ambassador-continue";

export function getAmbassadorSignUpSearch(): string {
  // Use ?type=ambassador as the canonical param; old ?flow=ambassador links remain supported.
  return `type=${encodeURIComponent(AMBASSADOR_CLERK_FLOW)}`;
}

export function getAmbassadorSignUpPath(): string {
  return `/sign-up?${getAmbassadorSignUpSearch()}`;
}

export function getAmbassadorSignInPath(): string {
  return `/sign-in?${getAmbassadorSignUpSearch()}`;
}

export function isAmbassadorClerkFlow(search: string): boolean {
  try {
    const params = new URLSearchParams(search);
    // Accept both ?type=ambassador (new) and ?flow=ambassador (legacy).
    return (
      params.get("type") === AMBASSADOR_CLERK_FLOW ||
      params.get("flow") === AMBASSADOR_CLERK_FLOW
    );
  } catch {
    return false;
  }
}
