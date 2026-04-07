/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkOnly, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /^\/__/],
  }),
);

function isClerkHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "clerk.app.farmvault.africa" ||
    h.endsWith(".clerk.accounts.dev") ||
    h === "clerk.com" ||
    h.endsWith(".clerk.com") ||
    h.endsWith(".clerk.app") ||
    h.includes(".clerk.")
  );
}

registerRoute(
  ({ url }) => isClerkHost(url.hostname),
  new NetworkOnly(),
);

registerRoute(
  ({ request, url }) => {
    if (isClerkHost(url.hostname)) return false;
    const swOrigin = self.location?.origin ?? "";
    return (
      !!swOrigin &&
      url.origin === swOrigin &&
      ["script", "style", "image", "font", "worker"].includes(request.destination)
    );
  },
  new CacheFirst({
    cacheName: "app-assets",
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clientsClaim());
});

/** Must match {@link initServiceWorkerPushFeedback} listener in pushNotificationFeedback.ts */
const PUSH_UI_SOUND_MSG = { type: "FARMVAULT_PUSH_UI_SOUND" };

/** FarmVault push branding (align defaults with webPushSend.ts). */
const FARMVAULT_NOTIFY_TITLE = "FarmVault";
const FARMVAULT_NOTIFY_ICON = "/icons/farmvault-192.png";
const FARMVAULT_NOTIFY_BADGE = "/icons/badge.png";
const FARMVAULT_NOTIFY_TAG = "farmvault";

function vibratePatternForPushType(type: string | undefined): number[] {
  switch (type) {
    case "weekly_summary":
      return [100, 50, 100];
    case "inventory_alert":
    case "system_alert":
      return [300, 100, 300, 100, 500];
    default:
      return [200, 100, 200, 100, 400];
  }
}

async function postPushSoundToVisibleClients(): Promise<void> {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of list) {
    const wc = c as WindowClient;
    if (wc.visibilityState === "visible") {
      wc.postMessage(PUSH_UI_SOUND_MSG);
      return;
    }
  }
}

type PushData = {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  type?: string;
};

self.addEventListener("push", (event: PushEvent) => {
  const fallback: PushData = {
    body: "You have a new update.",
    url: "/dashboard",
    type: "system_alert",
  };

  let data: PushData = { ...fallback };
  try {
    if (event.data) {
      const parsed = event.data.json() as PushData;
      data = { ...fallback, ...parsed };
    }
  } catch {
    try {
      const text = event.data?.text();
      if (text) data = { ...fallback, body: text };
    } catch {
      /* use fallback */
    }
  }

  const msgType = data.type ?? "system_alert";
  const vibrate = vibratePatternForPushType(msgType);

  event.waitUntil(
    (async () => {
      await postPushSoundToVisibleClients();
      const title = (typeof data.title === "string" && data.title.trim()) || FARMVAULT_NOTIFY_TITLE;
      const body = data.body ?? fallback.body!;
      const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";
      const tag = (typeof data.tag === "string" && data.tag.trim()) || FARMVAULT_NOTIFY_TAG;
      const bellDedupe = tag.length > 0 ? tag : `${msgType}:${body.slice(0, 48)}`;
      const icon = (typeof data.icon === "string" && data.icon.trim()) || FARMVAULT_NOTIFY_ICON;
      const badge = (typeof data.badge === "string" && data.badge.trim()) || FARMVAULT_NOTIFY_BADGE;

      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        (c as WindowClient).postMessage({
          type: "FARMVAULT_PUSH_BELL_SYNC",
          payload: { title, body, url, bellDedupe },
        });
      }

      await self.registration.showNotification(title, {
        body,
        icon,
        badge,
        tag,
        renotify: true,
        vibrate,
        data: {
          url,
          type: msgType,
          bellDedupe,
        },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const n = event.notification;
  const raw = n.data as { url?: string; bellDedupe?: string } | undefined;
  const path = typeof raw?.url === "string" && raw.url.startsWith("/") ? raw.url : "/dashboard";
  const targetUrl = new URL(path, self.location.origin).href;
  const bellPayload = {
    title: n.title || FARMVAULT_NOTIFY_TITLE,
    body: n.body || undefined,
    url: path,
    bellDedupe:
      typeof raw?.bellDedupe === "string" && raw.bellDedupe.length > 0
        ? raw.bellDedupe
        : `click_${Date.now()}`,
  };

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const rawClient of list) {
        const client = rawClient as WindowClient;
        if (!client.url.startsWith(self.location.origin)) continue;
        try {
          if (typeof client.navigate === "function") {
            await client.navigate(targetUrl);
          }
        } catch {
          /* keep existing URL; user still gets sound + focus */
        }
        await client.focus();
        client.postMessage(PUSH_UI_SOUND_MSG);
        client.postMessage({ type: "FARMVAULT_PUSH_BELL_SYNC", payload: bellPayload });
        return;
      }
      const opened = await self.clients.openWindow(targetUrl);
      if (opened) {
        const wc = opened as WindowClient;
        setTimeout(() => {
          wc.postMessage(PUSH_UI_SOUND_MSG);
          wc.postMessage({ type: "FARMVAULT_PUSH_BELL_SYNC", payload: bellPayload });
        }, 450);
      }
    })(),
  );
});
