/**
 * Persist only the user's last-chosen dashboard surface (not capability flags).
 * Capabilities come from `dashboard_switcher_capabilities` / `useDashboardRoles`.
 */
export type DashboardSurface = "company" | "ambassador";

const STORAGE_KEY = "farmvault:dashboard-surface:v1";

export function readDashboardSurfacePreference(): DashboardSurface | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "company" || raw === "ambassador") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeDashboardSurfacePreference(surface: DashboardSurface): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, surface);
  } catch {
    /* ignore */
  }
}
