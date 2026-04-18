import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { NotificationSoundFile } from '@/services/notificationSoundService';
import {
  collectDeviceInfo,
  isWebPushConfiguredInApp,
  syncWebPushSubscriptionToServer,
} from '@/services/webPushSubscriptionService';

function resolveRoleForSubscription(
  role: string | undefined,
  profileUserType: string | null | undefined,
): string | null {
  const roles = new Set<string>();
  const baseRole = (role ?? '').trim().toLowerCase();
  const profileType = (profileUserType ?? '').trim().toLowerCase();
  if (baseRole) roles.add(baseRole);
  if (profileType === 'ambassador' || profileType === 'both') roles.add('ambassador');
  if (baseRole !== 'developer' || profileType === 'both') roles.add('company');
  if (roles.size === 0) roles.add('company');
  return Array.from(roles).join(',');
}

export interface NotificationPreferences {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  soundFile: NotificationSoundFile;
  browserPermission: NotificationPermission | 'unsupported';
  promptSeen: boolean;
}

const STORAGE_KEY_PREFIX = 'farmvault:notification-prefs:v1:';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  notificationsEnabled: false,
  soundEnabled: true,
  soundFile: 'notification1.aac',
  browserPermission: 'default',
  promptSeen: false,
};

function getStorageKey(userId: string | undefined): string {
  return `${STORAGE_KEY_PREFIX}${userId ?? 'anonymous'}`;
}

function getBrowserPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/** Read notification prefs from localStorage (for non-React callers, e.g. after an in-app action). */
export function readStoredNotificationPrefs(userId: string | undefined): {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  soundFile: NotificationSoundFile;
} {
  if (typeof window === 'undefined') {
    return { notificationsEnabled: false, soundEnabled: true, soundFile: 'notification1.aac' };
  }
  const p = loadPreferences(userId);
  return {
    notificationsEnabled: p.notificationsEnabled,
    soundEnabled: p.soundEnabled,
    soundFile: p.soundFile,
  };
}

function loadPreferences(userId: string | undefined): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return { ...DEFAULT_PREFERENCES, browserPermission: getBrowserPermission() };
    
    const parsed = JSON.parse(raw);
    return {
      notificationsEnabled: Boolean(parsed.notificationsEnabled),
      soundEnabled: parsed.soundEnabled !== false,
      soundFile: parsed.soundFile || 'notification1.aac',
      browserPermission: getBrowserPermission(),
      promptSeen: Boolean(parsed.promptSeen),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, browserPermission: getBrowserPermission() };
  }
}

function savePreferences(userId: string | undefined, prefs: Partial<NotificationPreferences>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const current = loadPreferences(userId);
    const updated = { ...current, ...prefs };
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify({
      notificationsEnabled: updated.notificationsEnabled,
      soundEnabled: updated.soundEnabled,
      soundFile: updated.soundFile,
      promptSeen: updated.promptSeen,
    }));
  } catch {
    // Ignore storage failures
  }
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => 
    loadPreferences(user?.id)
  );
  const sessionPushSyncDone = useRef(false);

  useEffect(() => {
    setPreferences(loadPreferences(user?.id));
  }, [user?.id]);

  /** Re-upsert Web Push subscription when the user already enabled notifications (new tab, SW update, PWA reinstall). */
  useEffect(() => {
    if (!user?.id || import.meta.env.DEV) return;
    if (sessionPushSyncDone.current) return;
    const prefs = loadPreferences(user.id);
    if (!prefs.notificationsEnabled) return;
    if (getBrowserPermission() !== 'granted') return;
    if (!isWebPushConfiguredInApp()) return;
    sessionPushSyncDone.current = true;
    void syncWebPushSubscriptionToServer({
      companyId: user.companyId ?? null,
      role: resolveRoleForSubscription(user.role, (user as any).profileUserType ?? null),
      deviceInfo: collectDeviceInfo(),
    });
  }, [user?.id, user?.companyId, user?.role, (user as any)?.profileUserType]);

  useEffect(() => {
    const handlePermissionChange = () => {
      setPreferences(prev => ({
        ...prev,
        browserPermission: getBrowserPermission(),
      }));
    };

    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' as PermissionName })
        .then(status => {
          status.addEventListener('change', handlePermissionChange);
        })
        .catch(() => {});
    }
  }, []);

  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setPreferences(prev => {
      const updated = { ...prev, ...updates };
      savePreferences(user?.id, updated);
      return updated;
    });
  }, [user?.id]);

  const requestBrowserPermission = useCallback(async (): Promise<NotificationPermission | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    try {
      const permission = await Notification.requestPermission();
      setPreferences(prev => ({ ...prev, browserPermission: permission }));
      return permission;
    } catch {
      return getBrowserPermission();
    }
  }, []);

  const enableNotifications = useCallback(async (soundFile?: NotificationSoundFile) => {
    const permission = await requestBrowserPermission();

    updatePreferences({
      notificationsEnabled: permission === 'granted',
      soundEnabled: true,
      soundFile: soundFile ?? preferences.soundFile,
      promptSeen: true,
    });

    if (permission === 'granted' && isWebPushConfiguredInApp() && !import.meta.env.DEV) {
      void syncWebPushSubscriptionToServer({
        companyId: user?.companyId ?? null,
        role: resolveRoleForSubscription(user?.role, (user as any)?.profileUserType ?? null),
        deviceInfo: collectDeviceInfo(),
      });
    }

    return permission;
  }, [requestBrowserPermission, updatePreferences, preferences.soundFile, user?.companyId, user?.role]);

  const disableNotifications = useCallback(() => {
    updatePreferences({
      notificationsEnabled: false,
      promptSeen: true,
    });
  }, [updatePreferences]);

  const markPromptSeen = useCallback(() => {
    updatePreferences({ promptSeen: true });
  }, [updatePreferences]);

  const setSoundFile = useCallback((soundFile: NotificationSoundFile) => {
    updatePreferences({ soundFile });
  }, [updatePreferences]);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    updatePreferences({ soundEnabled: enabled });
  }, [updatePreferences]);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    updatePreferences({ notificationsEnabled: enabled });
  }, [updatePreferences]);

  const shouldShowPrompt = useMemo(() => {
    if (!user?.id) return false;
    if (preferences.promptSeen) return false;
    if (preferences.browserPermission === 'denied') return false;
    return true;
  }, [user?.id, preferences.promptSeen, preferences.browserPermission]);

  const canPlaySound = useMemo(() => {
    return preferences.notificationsEnabled && preferences.soundEnabled;
  }, [preferences.notificationsEnabled, preferences.soundEnabled]);

  return {
    preferences,
    updatePreferences,
    requestBrowserPermission,
    enableNotifications,
    disableNotifications,
    markPromptSeen,
    setSoundFile,
    setSoundEnabled,
    setNotificationsEnabled,
    shouldShowPrompt,
    canPlaySound,
  };
}
