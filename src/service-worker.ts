/// <reference lib="webworker" />
/**
 * Served only from https://app.farmvault.africa/ (see main.tsx + vite-plugin-pwa).
 * Default scope is this origin’s root, so it never controls farmvault.africa marketing pages.
 */
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

/** Chrome/Android show generic icons when relative URLs fail to resolve from the SW scope — always use absolute app-origin URLs. */
function assetUrl(path: string): string {
  const p = path.trim().startsWith("/") ? path.trim() : `/${path.trim()}`;
  return new URL(p, self.location.origin).href;
}

/**
 * Tray title is always {@link FARMVAULT_NOTIFY_TITLE}. Payload `title` is the DB headline (e.g. "Low stock alert");
 * `body` is the message — combined so the user sees FarmVault-branded alerts, not a raw site title.
 */
function buildBrandedNotificationBody(data: PushData, fallbackBody: string): string {
  const rawTitle = typeof data.title === "string" ? data.title.trim() : "";
  const rawBody = typeof data.body === "string" ? data.body.trim() : "";
  const headline = rawTitle && rawTitle !== FARMVAULT_NOTIFY_TITLE ? rawTitle : "";
  if (headline && rawBody) return `${headline} — ${rawBody}`;
  if (headline) return headline;
  if (rawBody) return rawBody;
  return fallbackBody;
}

function vibratePatternForPushType(type: string | undefined): number[] {
  switch (type) {
    case "weekly_summary":
      return [100, 50, 100];
    case "inventory_alert":
    case "system_alert":
      return [160, 80, 160];
    default:
      return [120, 70, 120];
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

/** If any FarmVault tab is visible on this path, skip the tray (Realtime keeps the bell in sync). */
async function hasVisibleClientOnPath(path: string): Promise<boolean> {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const origin = self.location.origin;
  for (const c of clients) {
    const wc = c as WindowClient;
    if (wc.visibilityState !== "visible") continue;
    if (!wc.url.startsWith(origin)) continue;
    try {
      const u = new URL(wc.url);
      if (u.pathname === path) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

type PushData = {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  type?: string;
  notification_id?: string;
  ts?: number;
  notification_type?: string;
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

  // Required: every push must show a user-visible notification (userVisibleOnly subscription) or the browser may drop the event.
  event.waitUntil(
    (async () => {
      const displayTitle = FARMVAULT_NOTIFY_TITLE;
      const bodyText = buildBrandedNotificationBody(data, fallback.body!);
      const headlineForBell =
        typeof data.title === "string" && data.title.trim() && data.title.trim() !== FARMVAULT_NOTIFY_TITLE
          ? data.title.trim()
          : displayTitle;
      const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";
      const tag = (typeof data.tag === "string" && data.tag.trim()) || FARMVAULT_NOTIFY_TAG;
      const rawNid = typeof data.notification_id === "string" ? data.notification_id.trim() : "";
      const nid = rawNid.length >= 32 && rawNid.includes("-") ? rawNid : "";
      const bellDedupe = nid
        ? `db_notification:${nid}`
        : tag.length > 0
          ? `web_push:${tag}`
          : `${msgType}:${bodyText.slice(0, 48)}`;
      const iconPath = (typeof data.icon === "string" && data.icon.trim()) || FARMVAULT_NOTIFY_ICON;
      const badgePath = (typeof data.badge === "string" && data.badge.trim()) || FARMVAULT_NOTIFY_BADGE;
      const icon = assetUrl(iconPath);
      const badge = assetUrl(badgePath);
      const tsSec = typeof data.ts === "number" && Number.isFinite(data.ts) ? data.ts : Math.floor(Date.now() / 1000);

      if (await hasVisibleClientOnPath(url)) {
        return;
      }

      await postPushSoundToVisibleClients();

      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        (c as WindowClient).postMessage({
          type: "FARMVAULT_PUSH_BELL_SYNC",
          payload: {
            title: headlineForBell,
            body: bodyText,
            url,
            bellDedupe,
            notification_id: nid || undefined,
          },
        });
      }

      await self.registration.showNotification(displayTitle, {
        body: bodyText,
        icon,
        badge,
        tag: nid ? `fv-${nid}` : tag,
        renotify: true,
        vibrate,
        timestamp: tsSec * 1000,
        silent: false,
        data: {
          url,
          type: msgType,
          bellDedupe,
          notification_id: nid || undefined,
          notification_type: data.notification_type,
          ts: tsSec,
        },
      });
    })(),
  );
});

async function pickClientForNotificationTarget(targetHref: string): Promise<WindowClient | undefined> {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const origin = self.location.origin;
  let targetPath = "/dashboard";
  let targetSearch = "";
  try {
    const t = new URL(targetHref);
    targetPath = t.pathname;
    targetSearch = t.search;
  } catch {
    /* use defaults */
  }

  const sameOrigin: WindowClient[] = [];
  for (const c of list) {
    const client = c as WindowClient;
    if (!client.url.startsWith(origin)) continue;
    sameOrigin.push(client);
  }
  if (sameOrigin.length === 0) return undefined;

  for (const client of sameOrigin) {
    try {
      const u = new URL(client.url);
      if (u.pathname === targetPath && u.search === targetSearch) return client;
    } catch {
      /* next */
    }
  }

  for (const client of sameOrigin) {
    if (client.focused) return client;
  }

  return sameOrigin[0];
}

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const n = event.notification;
  const raw = n.data as {
    url?: string;
    bellDedupe?: string;
    notification_id?: string;
    notification_type?: string;
    ts?: number;
  } | undefined;
  const path = typeof raw?.url === "string" && raw.url.startsWith("/") ? raw.url : "/dashboard";
  const targetUrl = new URL(path, self.location.origin).href;
  const nid = typeof raw?.notification_id === "string" ? raw.notification_id.trim() : "";
  const bellDedupe =
    nid.length > 0
      ? `db_notification:${nid}`
      : typeof raw?.bellDedupe === "string" && raw.bellDedupe.length > 0
        ? raw.bellDedupe
        : `click_${Date.now()}`;
  const bellPayload = {
    title: n.title || FARMVAULT_NOTIFY_TITLE,
    body: typeof n.body === "string" && n.body.length > 0 ? n.body : undefined,
    url: path,
    bellDedupe,
    notification_id: nid || undefined,
  };

  event.waitUntil(
    (async () => {
      const existing = await pickClientForNotificationTarget(targetUrl);
      if (existing) {
        try {
          if (typeof existing.navigate === "function") {
            const cur = new URL(existing.url);
            const want = new URL(targetUrl);
            if (cur.pathname !== want.pathname || cur.search !== want.search) {
              await existing.navigate(targetUrl);
            }
          }
        } catch {
          /* focus still useful */
        }
        await existing.focus();
        existing.postMessage(PUSH_UI_SOUND_MSG);
        existing.postMessage({ type: "FARMVAULT_PUSH_BELL_SYNC", payload: bellPayload });
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
