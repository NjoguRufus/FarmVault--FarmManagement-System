/**
 * Browser push notification scaffold for FarmVault.
 * Request permission, register service worker, and store subscription for selected admins.
 * Backend/Edge Function can use stored subscriptions to send push when alerts are created.
 */

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

const VAPID_KEY_STORAGE = 'farmvault:push:vapid_public_key';

/** Check if push is supported and current permission. */
export function getPushPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if (!('PushManager' in window)) return 'unsupported';
  switch (Notification.permission) {
    case 'granted': return 'granted';
    case 'denied': return 'denied';
    default: return 'default';
  }
}

/** Request notification permission. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (getPushPermissionState() === 'unsupported') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Register service worker and subscribe to push.
 * Pass the VAPID public key from your backend/env; subscription can be sent to your API to store per user/company.
 */
export async function subscribeToPush(vapidPublicKey?: string): Promise<PushSubscription | null> {
  if (getPushPermissionState() !== 'granted') {
    const ok = await requestNotificationPermission();
    if (!ok) return null;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const key = vapidPublicKey ?? (typeof window !== 'undefined' ? window.localStorage?.getItem(VAPID_KEY_STORAGE) : null);
    if (!key) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[Push] No VAPID public key; push subscription skipped. Set backend key in env or storage.');
      }
      return null;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Push] Subscription obtained', sub.endpoint?.slice(0, 50));
    }
    return sub;
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Push] Subscribe failed', e);
    }
    return null;
  }
}

/** Serialize subscription for sending to backend (e.g. store in alert_recipients or push_subscriptions). */
export function serializeSubscription(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const keys = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: keys ? btoa(String.fromCharCode(...new Uint8Array(keys))) : '',
      auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '',
    },
  };
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(raw);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
