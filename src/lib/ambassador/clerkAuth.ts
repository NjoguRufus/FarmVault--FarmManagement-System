/** Query string for standard Clerk SignUp / SignIn pages to land on ambassador onboarding after auth. */
export const AMBASSADOR_CLERK_FLOW = "ambassador";

export function getAmbassadorSignUpSearch(): string {
  return `flow=${encodeURIComponent(AMBASSADOR_CLERK_FLOW)}`;
}

export function getAmbassadorSignUpPath(): string {
  return `/sign-up?${getAmbassadorSignUpSearch()}`;
}

export function getAmbassadorSignInPath(): string {
  return `/sign-in?${getAmbassadorSignUpSearch()}`;
}

export function isAmbassadorClerkFlow(search: string): boolean {
  try {
    return new URLSearchParams(search).get("flow") === AMBASSADOR_CLERK_FLOW;
  } catch {
    return false;
  }
}
