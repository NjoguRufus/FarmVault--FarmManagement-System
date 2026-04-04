/**
 * Persisted flag: user signed up via the ambassador flow (?type=ambassador).
 * Used to assign user_type='ambassador' in core.profiles immediately after Clerk signup,
 * before the ambassador onboarding wizard is completed.
 * Cleared once the role assignment RPC has been called.
 */
export const AMBASSADOR_SIGNUP_TYPE_KEY = "farmvault:signup_type:v1";

export function readSignupType(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(AMBASSADOR_SIGNUP_TYPE_KEY);
  } catch {
    return null;
  }
}

export function setSignupType(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AMBASSADOR_SIGNUP_TYPE_KEY, value);
  } catch {
    // ignore
  }
}

export function clearSignupType(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AMBASSADOR_SIGNUP_TYPE_KEY);
  } catch {
    // ignore
  }
}

/** True when the current session was started via an ambassador signup link. */
export function isAmbassadorSignupType(): boolean {
  return readSignupType() === "ambassador";
}
