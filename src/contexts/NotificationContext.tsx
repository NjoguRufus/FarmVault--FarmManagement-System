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
import { bellSectionForUnifiedKind, bellSectionFromPath, type NotificationBellSection } from '@/lib/notificationBellSection';

export type { NotificationBellSection };

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  read: boolean;
  createdAt: number;
  type?: 'info' | 'success' | 'warning' | 'error';
  /** In-app deep link when user opens the item in the bell menu */
  navigatePath?: string;
  /** Stable key to avoid duplicate bell rows (e.g. farmer_smart_inbox:uuid, web_push:tag). */
  dedupeKey?: string;
  /**
   * Navbar grouping: farm/company vs ambassador program.
   * Omitted or `workspace` = main farm app bell; `ambassador` = ambassador console only.
   */
  bellSection?: NotificationBellSection;
}

interface AddNotificationOptions {
  title: string;
  message?: string;
  type?: AppNotification['type'];
  skipSound?: boolean; // Skip sound playback (used when sound is handled elsewhere, e.g., real-time alerts)
  navigatePath?: string;
  dedupeKey?: string;
  /** When true, only append to the bell list (no toast, no sound). */
  silent?: boolean;
  bellSection?: NotificationBellSection;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  addNotification: (n: AddNotificationOptions) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  markAllReadForSection: (section: NotificationBellSection) => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const MAX_NOTIFICATIONS = 100;
const STORAGE_KEY_PREFIX = 'farmvault:notifications:v1:';

function normalizeStoredNotification(value: unknown): AppNotification | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AppNotification> & { createdAt?: unknown };
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();
  let type: AppNotification['type'] = 'info';
  if (raw.type === 'info' || raw.type === 'success' || raw.type === 'warning' || raw.type === 'error') {
    type = raw.type;
  }
  const navigatePath =
    typeof (raw as { navigatePath?: unknown }).navigatePath === 'string'
      ? (raw as { navigatePath: string }).navigatePath
      : undefined;
  const dedupeKey =
    typeof (raw as { dedupeKey?: unknown }).dedupeKey === 'string'
      ? (raw as { dedupeKey: string }).dedupeKey
      : undefined;
  let bellSection: NotificationBellSection | undefined;
  const bs = (raw as { bellSection?: unknown }).bellSection;
  if (bs === 'workspace' || bs === 'ambassador') bellSection = bs;
  return {
    id: raw.id,
    title: raw.title,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    read: Boolean(raw.read),
    createdAt,
    type,
    navigatePath,
    dedupeKey,
    bellSection,
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
      const createdAt = Date.now();
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[NotificationContext] addNotification called', {
          title: n.title,
          message: n.message,
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
          read: false,
          createdAt,
          type: n.type ?? 'info',
          navigatePath: n.navigatePath,
          dedupeKey: n.dedupeKey,
          bellSection: n.bellSection ?? 'workspace',
        };
        return [next, ...prev].slice(0, MAX_NOTIFICATIONS);
      });

      if (n.silent) return;

      toast(n.title, { description: n.message, duration: 4000 });

      // Play notification sound if enabled (unless skipSound is true)
      if (n.skipSound) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[NotificationContext] Skipping sound (handled elsewhere)');
        }
        return;
      }

      const prefs = getNotificationPrefs(user.id);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[NotificationContext] Sound prefs', {
          enabled: prefs.enabled,
          soundEnabled: prefs.soundEnabled,
          soundFile: prefs.soundFile,
        });
      }

      if (prefs.enabled && prefs.soundEnabled) {
        playNotificationSound(prefs.soundFile).then((played) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[NotificationContext] Sound played:', played);
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
        type: payload.toastType ?? 'info',
        skipSound: payload.skipSound,
        navigatePath: payload.path,
        bellSection: bellSectionForUnifiedKind(payload.kind, payload.audiences),
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
        payload?: { title?: string; body?: string; url?: string; bellDedupe?: string };
      };
      if (d?.type !== SW_MSG_PUSH_BELL_SYNC || !d.payload) return;
      const p = d.payload;
      const url = typeof p.url === 'string' && p.url.startsWith('/') ? p.url : '/dashboard';
      const dedupe =
        typeof p.bellDedupe === 'string' && p.bellDedupe.length > 0
          ? `web_push:${p.bellDedupe}`.slice(0, 160)
          : `web_push:${Date.now()}`;
      addNotificationRef.current({
        title: p.title?.trim() || 'FarmVault',
        message: typeof p.body === 'string' ? p.body : undefined,
        type: 'info',
        navigatePath: url,
        silent: true,
        skipSound: true,
        dedupeKey: dedupe,
        bellSection: bellSectionFromPath(url),
      });
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [user?.id]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markAllReadForSection = useCallback((section: NotificationBellSection) => {
    setNotifications((prev) =>
      prev.map((n) => ((n.bellSection ?? 'workspace') === section ? { ...n, read: true } : n)),
    );
  }, []);

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
const noopSection = (_section: NotificationBellSection) => {};
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
