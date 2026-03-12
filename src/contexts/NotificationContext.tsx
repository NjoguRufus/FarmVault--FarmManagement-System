import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { playNotificationSound, preloadAllSounds } from '@/services/notificationSoundService';
import type { NotificationSoundFile } from '@/services/notificationSoundService';

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  read: boolean;
  createdAt: number;
  type?: 'info' | 'success' | 'warning' | 'error';
}

interface AddNotificationOptions {
  title: string;
  message?: string;
  type?: AppNotification['type'];
  skipSound?: boolean; // Skip sound playback (used when sound is handled elsewhere, e.g., real-time alerts)
}

interface NotificationContextValue {
  notifications: AppNotification[];
  addNotification: (n: AddNotificationOptions) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
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
  return {
    id: raw.id,
    title: raw.title,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    read: Boolean(raw.read),
    createdAt,
    type,
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
      setNotifications([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setNotifications([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setNotifications([]);
        return;
      }
      const restored = parsed
        .map((item) => normalizeStoredNotification(item))
        .filter((item): item is AppNotification => item !== null)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_NOTIFICATIONS);
      setNotifications(restored);
    } catch {
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
      const createdAt = Date.now();
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[NotificationContext] addNotification called', {
          title: n.title,
          message: n.message,
          type: n.type,
          skipSound: n.skipSound,
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
        };
        return [next, ...prev].slice(0, MAX_NOTIFICATIONS);
      });
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

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

const noop = () => {};
const emptyNotifications: AppNotification[] = [];
const defaultContext: NotificationContextValue = {
  notifications: emptyNotifications,
  addNotification: noop,
  markAsRead: noop,
  markAllRead: noop,
  unreadCount: 0,
};

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx ?? defaultContext;
}
