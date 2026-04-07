/**
 * Show a browser notification via the app service worker (same path as Web Push).
 * Adds vibration pattern where supported. Icon uses FarmVault PWA assets.
 */

/** Align with `src/service-worker.ts` push branding */
const TRAY_TITLE = 'FarmVault';
const DEFAULT_ICON = '/icons/farmvault-192.png';
const DEFAULT_BADGE = '/icons/badge.png';
/** Noticeable but short vibration (ms). */
const VIBRATE_PATTERN = [180, 100, 180] as number[];

function assetUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const p = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;
  return new URL(p, window.location.origin).href;
}

function buildTrayBody(headline: string, message: string): string {
  const h = headline.trim();
  const m = message.trim();
  const useHeadline = h && h !== TRAY_TITLE;
  if (useHeadline && m) return `${h} — ${m}`;
  if (useHeadline) return h;
  return m || 'You have a new update.';
}

export type FarmVaultLocalNotificationInput = {
  title: string;
  body: string;
  /** In-app route, e.g. /expenses */
  path: string;
  /** Dedupes stacked notifications in the tray */
  tag?: string;
};

export async function showFarmVaultLocalNotification(input: FarmVaultLocalNotificationInput): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
  const tag = input.tag ?? 'farmvault-unified';
  const body = buildTrayBody(input.title, input.body);

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(TRAY_TITLE, {
        body,
        icon: assetUrl(DEFAULT_ICON),
        badge: assetUrl(DEFAULT_BADGE),
        tag,
        silent: false,
        data: { url: path, type: tag },
        vibrate: VIBRATE_PATTERN,
      });
      return;
    }
  } catch {
    /* ignore — do not fall back to `new Notification()` (generic Chrome/site tray, no badge/vibrate) */
  }
}
