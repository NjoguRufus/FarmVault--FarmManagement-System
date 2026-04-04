/** Minimal user shape for feature checks. */
interface User {
  uid?: string;
  email?: string | null;
}

const SEEN_KEY_APP_LOCK_V1 = "fv_seen_feature_app_lock_v1";

export function markAppLockAnnouncementSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY_APP_LOCK_V1, "1");
  } catch {
    // ignore storage errors
  }
}

export function hasSeenAppLockAnnouncement(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY_APP_LOCK_V1) === "1";
  } catch {
    return true;
  }
}

export function shouldShowAppLockAnnouncement(
  user: User | null | undefined,
  opts?: { isDuringOnboarding?: boolean },
): boolean {
  if (!user) return false;
  if (opts?.isDuringOnboarding) return false;
  if (hasSeenAppLockAnnouncement()) return false;
  return true;
}

