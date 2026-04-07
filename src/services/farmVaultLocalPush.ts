/**
 * Show a browser notification via the app service worker (same path as Web Push).
 * Adds vibration pattern where supported. Icon uses FarmVault PWA assets.
 */

/** Align with `src/sw.ts` push branding */
const DEFAULT_ICON = '/icons/farmvault-192.png';
const DEFAULT_BADGE = '/icons/badge.png';
/** Noticeable but short vibration (ms). */
const VIBRATE_PATTERN = [180, 100, 180] as number[];

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

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(input.title, {
        body: input.body,
        icon: DEFAULT_ICON,
        badge: DEFAULT_BADGE,
        tag,
        data: { url: path, type: tag },
        vibrate: VIBRATE_PATTERN,
      });
      return;
    }
  } catch {
    /* fall through */
  }

  try {
    new Notification(input.title, {
      body: input.body,
      icon: DEFAULT_ICON,
      tag,
    });
  } catch {
    /* ignore */
  }
}
