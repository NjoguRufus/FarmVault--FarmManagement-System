/**
 * Persisted flag: user explicitly entered the ambassador funnel ("Become Ambassador").
 * Auth bootstrap and post-auth routing consult this so farm dashboard flows stay isolated.
 */
export const AMBASSADOR_ACCESS_INTENT_KEY = "farmvault:accessing-ambassador:v1";

const TRUE = "1";

export function readAmbassadorAccessIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AMBASSADOR_ACCESS_INTENT_KEY) === TRUE;
  } catch {
    return false;
  }
}

export function setAmbassadorAccessIntent(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (active) {
      window.localStorage.setItem(AMBASSADOR_ACCESS_INTENT_KEY, TRUE);
    } else {
      window.localStorage.removeItem(AMBASSADOR_ACCESS_INTENT_KEY);
    }
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new Event("farmvault:ambassador-access-intent"));
  } catch {
    // ignore
  }
}

export function clearAmbassadorAccessIntent(): void {
  setAmbassadorAccessIntent(false);
}
