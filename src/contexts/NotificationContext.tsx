import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { playNotificationSound, preloadAllSounds } from '@/services/notificationSoundService';
import type { NotificationSoundFile } from '@/services/notificationSoundService';
import {
  setUnifiedNotificationDeliverPredicate,
  setUnifiedNotificationSink,
  unifiedNotificationWouldDeliverToUser,
} from '@/services/unifiedNotificationPipeline';
import { showFarmVaultLocalNotification } from '@/services/farmVaultLocalPush';
import {
  notificationPortalForUnifiedKind,
  notificationPortalFromPath,
  type NotificationPortalType,
} from '@/lib/notificationBellSection';
import { logger } from "@/lib/logger";
import { db } from '@/lib/db';
import { isUuid } from '@/lib/uuid';

export type { NotificationPortalType };

export type ToastNotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  read: boolean;
  createdAt: number;
  /** Sonner / in-app toast severity */
  toastType?: ToastNotificationType;
  /** Portal bucket: company workspace, ambassador program, or developer console */
  type: NotificationPortalType;
  /** In-app deep link when user opens the item in the bell menu */
  navigatePath?: string;
  /** Stable key to avoid duplicate bell rows (e.g. farmer_smart_inbox:uuid, web_push:tag). */
  dedupeKey?: string;
}

interface AddNotificationOptions {
  title: string;
  message?: string;
  toastType?: ToastNotificationType;
  type?: NotificationPortalType;
  skipSound?: boolean; // Skip sound playback (used when sound is handled elsewhere, e.g., real-time alerts)
  navigatePath?: string;
  dedupeKey?: string;
  /** When true, only append to the bell list (no toast, no sound). */
  silent?: boolean;
  /** When set, mirrors `public.notifications.id` (UUID) for read sync + dedupe with Web Push. */
  id?: string;
  /** When mirroring DB rows; default false. */
  read?: boolean;
  /** Epoch ms when mirroring DB `created_at` (defaults to now). */
  createdAt?: number;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  addNotification: (n: AddNotificationOptions) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  markAllReadForSection: (portal: NotificationPortalType) => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const MAX_NOTIFICATIONS = 100;
const STORAGE_KEY_PREFIX = 'farmvault:notifications:v1:';

function normalizeStoredNotification(value: unknown): AppNotification | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown> & { createdAt?: unknown };
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();

  const navigatePath = typeof raw.navigatePath === 'string' ? raw.navigatePath : undefined;
  const dedupeKey = typeof raw.dedupeKey === 'string' ? raw.dedupeKey : undefined;

  const isToastSeverity = (v: unknown): v is ToastNotificationType =>
    v === 'info' || v === 'success' || v === 'warning' || v === 'error';
  const isPortal = (v: unknown): v is NotificationPortalType =>
    v === 'company' || v === 'ambassador' || v === 'developer';

  let toastType: ToastNotificationType = 'info';
  let portalType: NotificationPortalType = 'company';

  const legacyBell = raw.bellSection;
  const legacyPortalFromBell: NotificationPortalType | undefined =
    legacyBell === 'ambassador' ? 'ambassador' : legacyBell === 'workspace' ? 'company' : undefined;

  if (isToastSeverity(raw.toastType)) {
    toastType = raw.toastType;
  }

  const rawType = raw.type;
  if (isPortal(rawType)) {
    portalType = rawType;
  } else if (isToastSeverity(rawType)) {
    toastType = rawType;
    portalType = legacyPortalFromBell ?? 'company';
  } else {
    portalType = legacyPortalFromBell ?? 'company';
  }

  return {
    id: raw.id,
    title: raw.title,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    read: Boolean(raw.read),
    createdAt,
    toastType,
    type: portalType,
    navigatePath,
    dedupeKey,
  };
}

const NOTIFICATION_PREFS_KEY_PREFIX = 'farmvault:notification-prefs:v1:';

function getNotificationPrefs(userId: string | undefined): { 
  enabled: boolean; 
  soundEnabled: boolean; 
  soundFile: NotificationSoundFile;
} {
  if (typeof window === 'undefined' || !userId) {
    return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
  }
  try {
    const raw = window.localStorage.getItem(`${NOTIFICATION_PREFS_KEY_PREFIX}${userId}`);
    if (!raw) return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.notificationsEnabled),
      soundEnabled: parsed.soundEnabled !== false,
      soundFile: parsed.soundFile || 'notification1.aac',
    };
  } catch {
    return { enabled: false, soundEnabled: false, soundFile: 'notification1.aac' };
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const dedupeKeysRef = useRef<Set<string>>(new Set());
  const soundsPreloaded = useRef(false);
  const storageKey = useMemo(
    () => `${STORAGE_KEY_PREFIX}${user?.id ?? 'anonymous'}`,
    [user?.id],
  );

  // Preload notification sounds on mount
  useEffect(() => {
    if (!soundsPreloaded.current) {
      preloadAllSounds();
      soundsPreloaded.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.id) {
      dedupeKeysRef.current = new Set();
      setNotifications([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        dedupeKeysRef.current = new Set();
        setNotifications([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        dedupeKeysRef.current = new Set();
        setNotifications([]);
        return;
      }
      const restored = parsed
        .map((item) => normalizeStoredNotification(item))
        .filter((item): item is AppNotification => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_NOTIFICATIONS);
      dedupeKeysRef.current = new Set(
        restored.map((r) => r.dedupeKey).filter((k): k is string => typeof k === 'string' && k.length > 0),
      );
      setNotifications(restored);
    } catch {
      dedupeKeysRef.current = new Set();
      setNotifications([]);
    }
  }, [storageKey, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
    } catch {
      // Ignore storage failures (private mode/quota).
    }
  }, [notifications, storageKey, user?.id]);

  const addNotification = useCallback(
    (n: AddNotificationOptions) => {
      if (!user?.id) return;
      if (n.dedupeKey) {
        const k = n.dedupeKey;
        if (dedupeKeysRef.current.has(k)) return;
        dedupeKeysRef.current.add(k);
      }
      const createdAt = typeof n.createdAt === 'number' && Number.isFinite(n.createdAt) ? n.createdAt : Date.now();
      const id = n.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[NotificationContext] addNotification called', {
          title: n.title,
          message: n.message,
          toastType: n.toastType,
          type: n.type,
          skipSound: n.skipSound,
          silent: n.silent,
          userId: user.id,
        });
      }

      setNotifications((prev) => {
        const next: AppNotification = {
          id,
          title: n.title,
          message: n.message,
          read: n.read ?? false,
          createdAt,
          toastType: n.toastType ?? 'info',
          type: n.type ?? 'company',
          navigatePath: n.navigatePath,
          dedupeKey: n.dedupeKey,
        };
        return [next, ...prev].slice(0, MAX_NOTIFICATIONS);
      });

      if (n.silent) return;

      toast(n.title, { description: n.message, duration: 4000 });

      // Play notification sound if enabled (unless skipSound is true)
      if (n.skipSound) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          logger.log('[NotificationContext] Skipping sound (handled elsewhere)');
        }
        return;
      }

      const prefs = getNotificationPrefs(user.id);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[NotificationContext] Sound prefs', {
          enabled: prefs.enabled,
          soundEnabled: prefs.soundEnabled,
          soundFile: prefs.soundFile,
        });
      }

      if (prefs.enabled && prefs.soundEnabled) {
        playNotificationSound(prefs.soundFile).then((played) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            logger.log('[NotificationContext] Sound played:', played);
          }
        }).catch((err) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[NotificationContext] Sound playback failed', err);
          }
        });
      }
    },
    [user?.id]
  );

  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;

  useEffect(() => {
    setUnifiedNotificationDeliverPredicate((payload) => unifiedNotificationWouldDeliverToUser(payload, user));
    return () => setUnifiedNotificationDeliverPredicate(null);
  }, [user]);

  useEffect(() => {
    setUnifiedNotificationSink((payload) => {
      if (!user?.id) return;
      addNotificationRef.current({
        title: payload.title,
        message: payload.body,
        toastType: payload.toastType ?? 'info',
        skipSound: payload.skipSound,
        navigatePath: payload.path,
        type: notificationPortalForUnifiedKind(payload.kind, payload.audiences),
      });
      if (
        payload.showSystemNotification !== false &&
        typeof document !== 'undefined' &&
        document.hidden
      ) {
        void showFarmVaultLocalNotification({
          title: payload.title,
          body: payload.body ?? '',
          path: payload.path,
          tag: payload.kind,
        });
      }
    });
    return () => setUnifiedNotificationSink(null);
  }, [user?.id]);

  /** Mirror web push payloads into the bell (same copy as the system notification when the app is backgrounded). */
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !user?.id) return;
    const SW_MSG_PUSH_BELL_SYNC = 'FARMVAULT_PUSH_BELL_SYNC';
    const onMsg = (event: MessageEvent) => {
      const d = event.data as {
        type?: string;
        payload?: {
          title?: string;
          body?: string;
          url?: string;
          bellDedupe?: string;
          notification_id?: string;
        };
      };
      if (d?.type !== SW_MSG_PUSH_BELL_SYNC || !d.payload) return;
      const p = d.payload;
      const url = typeof p.url === 'string' && p.url.startsWith('/') ? p.url : '/home';
      let dedupe: string;
      if (typeof p.bellDedupe === 'string' && p.bellDedupe.startsWith('db_notification:')) {
        dedupe = p.bellDedupe.slice(0, 160);
      } else if (typeof p.notification_id === 'string' && p.notification_id.length > 0) {
        dedupe = `db_notification:${p.notification_id}`;
      } else if (typeof p.bellDedupe === 'string' && p.bellDedupe.length > 0) {
        dedupe = `web_push:${p.bellDedupe}`.slice(0, 160);
      } else {
        dedupe = `web_push:${Date.now()}`;
      }
      addNotificationRef.current({
        title: p.title?.trim() || 'FarmVault',
        message: typeof p.body === 'string' ? p.body : undefined,
        toastType: 'info',
        navigatePath: url,
        silent: true,
        skipSound: true,
        dedupeKey: dedupe,
        type: notificationPortalFromPath(url),
      });
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [user?.id]);

  const markAsRead = useCallback(
    (id: string) => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      if (user?.id && isUuid(id)) {
        void db
          .public()
          .from('notifications')
          .update({ read: true })
          .eq('id', id)
          .eq('clerk_user_id', user.id);
      }
    },
    [user?.id],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (user?.id) {
      void db
        .public()
        .from('notifications')
        .update({ read: true })
        .eq('clerk_user_id', user.id)
        .eq('read', false);
    }
  }, [user?.id]);

  const markAllReadForSection = useCallback(
    (portal: NotificationPortalType) => {
      setNotifications((prev) =>
        prev.map((n) => (n.type === portal ? { ...n, read: true } : n)),
      );
      if (user?.id) {
        void db
          .public()
          .from('notifications')
          .update({ read: true })
          .eq('clerk_user_id', user.id)
          .eq('read', false)
          .eq('type', portal);
      }
    },
    [user?.id],
  );

  const unreadCount = useMemo(
    () => notifications.reduce((count, n) => count + (n.read ? 0 : 1), 0),
    [notifications],
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        markAsRead,
        markAllRead,
        markAllReadForSection,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

const noop = () => {};
const noopSection = (_portal: NotificationPortalType) => {};
const emptyNotifications: AppNotification[] = [];
const defaultContext: NotificationContextValue = {
  notifications: emptyNotifications,
  addNotification: noop,
  markAsRead: noop,
  markAllRead: noop,
  markAllReadForSection: noopSection,
  unreadCount: 0,
};

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx ?? defaultContext;
}
