import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type WebPushPayload = {
  title?: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  /** morning_message | evening_message | inventory_alert | weekly_summary | system_alert */
  type?: string;
  /** DB row id — used for dedupe in the service worker + bell */
  notification_id?: string;
  /** Unix seconds — shown in payload for clients */
  ts?: number;
  /** company | ambassador | developer */
  notification_type?: string;
};

let vapidConfigured = false;

export function isWebPushConfigured(): boolean {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  return !!(publicKey && privateKey);
}

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  const contact = Deno.env.get("VAPID_CONTACT")?.trim() ?? "mailto:support@farmvault.africa";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(contact, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

type SubscriptionKeys = { p256dh: string; auth: string };

function isSubscriptionShape(x: unknown): x is { endpoint: string; keys: SubscriptionKeys } {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.endpoint === "string" &&
    o.keys != null &&
    typeof (o.keys as SubscriptionKeys).p256dh === "string" &&
    typeof (o.keys as SubscriptionKeys).auth === "string"
  );
}

export async function sendWebPushToSubscription(
  subscription: { endpoint: string; keys: SubscriptionKeys },
  payload: WebPushPayload,
): Promise<{ ok: true } | { ok: false; statusCode?: number; message: string }> {
  if (!ensureVapid()) {
    return { ok: false, message: "VAPID keys not configured" };
  }
  const body = JSON.stringify({
    title: payload.title?.trim() || "FarmVault",
    body: payload.body,
    icon: payload.icon ?? "/icons/farmvault-192.png",
    badge: payload.badge ?? "/icons/badge.png",
    url: payload.url ?? "/dashboard",
    tag: payload.tag?.trim() || "farmvault",
    type: payload.type ?? "system_alert",
    notification_id: payload.notification_id,
    ts: payload.ts ?? Math.floor(Date.now() / 1000),
    notification_type: payload.notification_type,
  });
  try {
    await webpush.sendNotification(subscription, body, {
      TTL: 60 * 60 * 12,
    });
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    return {
      ok: false,
      statusCode: err.statusCode,
      message: err.message ?? String(e),
    };
  }
}

export async function sendWebPushToClerkUser(
  admin: SupabaseClient,
  clerkUserId: string,
  payload: WebPushPayload,
): Promise<{ attempts: number; delivered: number; pruned: number }> {
  let attempts = 0;
  let delivered = 0;
  let pruned = 0;
  if (!isWebPushConfigured()) {
    return { attempts, delivered, pruned };
  }
  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, subscription_json")
    .eq("clerk_user_id", clerkUserId);
  if (error || !rows?.length) {
    return { attempts, delivered, pruned };
  }
  for (const row of rows as { endpoint: string; subscription_json: unknown }[]) {
    const sub = row.subscription_json;
    if (!isSubscriptionShape(sub)) continue;
    attempts++;
    const r = await sendWebPushToSubscription(sub, payload);
    if (r.ok) {
      delivered++;
      continue;
    }
    if (r.statusCode === 404 || r.statusCode === 410) {
      await admin.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
      pruned++;
    }
  }
  return { attempts, delivered, pruned };
}
