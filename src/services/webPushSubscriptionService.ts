/**
 * Register for Web Push (VAPID), then upsert subscription via Edge Function.
 */
import { getSupabaseAccessToken } from '@/lib/supabase';
import { subscribeToPush, getPushPermissionState } from '@/services/pushNotificationService';

function functionsBaseUrl(): string | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  return url || null;
}

function anonKey(): string | null {
  return (
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
    null
  );
}

function vapidPublicKey(): string | null {
  const k = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
  return k || null;
}

export function isWebPushConfiguredInApp(): boolean {
  return !!vapidPublicKey() && !!functionsBaseUrl() && !!anonKey();
}

export async function syncWebPushSubscriptionToServer(): Promise<{ ok: boolean; error?: string }> {
  if (!isWebPushConfiguredInApp()) {
    return { ok: false, error: 'Push is not configured (missing VITE_VAPID_PUBLIC_KEY or Supabase URL).' };
  }
  if (getPushPermissionState() !== 'granted') {
    return { ok: false, error: 'Notification permission not granted.' };
  }
  if (!('serviceWorker' in navigator)) {
    return { ok: false, error: 'Service workers are not supported.' };
  }

  const sub = await subscribeToPush(vapidPublicKey()!);
  if (!sub) {
    return { ok: false, error: 'Could not create push subscription (check HTTPS and service worker).' };
  }

  const payload = sub.toJSON();
  if (!payload?.endpoint || !payload.keys) {
    return { ok: false, error: 'Invalid subscription from browser.' };
  }

  const base = functionsBaseUrl();
  const key = anonKey();
  const token = await getSupabaseAccessToken();
  if (!base || !key || !token) {
    return { ok: false, error: 'Not signed in or missing Supabase configuration.' };
  }

  const res = await fetch(`${base}/functions/v1/sync-push-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: key,
    },
    body: JSON.stringify({
      subscription: {
        endpoint: payload.endpoint,
        keys: payload.keys,
      },
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: string; error?: string };
      detail = j.detail || j.error || detail;
    } catch {
      /* ignore */
    }
    return { ok: false, error: detail };
  }

  return { ok: true };
}

export async function removeWebPushSubscriptionFromServer(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  const base = functionsBaseUrl();
  const key = anonKey();
  const token = await getSupabaseAccessToken();
  if (!base || !key || !token) {
    return { ok: false, error: 'Not signed in or missing Supabase configuration.' };
  }
  const res = await fetch(`${base}/functions/v1/sync-push-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: key,
    },
    body: JSON.stringify({ removeEndpoint: endpoint }),
  });
  if (!res.ok) {
    return { ok: false, error: res.statusText };
  }
  return { ok: true };
}
