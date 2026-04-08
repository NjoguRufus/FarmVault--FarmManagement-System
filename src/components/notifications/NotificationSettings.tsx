import React, { useEffect, useState } from 'react';
import { Bell, Volume2, VolumeX, Play, AlertCircle, CheckCircle2, XCircle, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { 
  NOTIFICATION_SOUNDS, 
  testNotificationSound,
  type NotificationSoundFile 
} from '@/services/notificationSoundService';
import { useAuth } from '@/contexts/AuthContext';
import {
  collectDeviceInfo,
  isWebPushConfiguredInApp,
  syncWebPushSubscriptionToServer,
} from '@/services/webPushSubscriptionService';

type OneSignalRuntime = {
  Notifications?: {
    requestPermission?: () => Promise<void>;
  };
  login?: (externalId: string) => Promise<void>;
  User?: {
    addTag?: (key: string, value: string) => Promise<void> | void;
    PushSubscription?: {
      optedIn?: boolean;
      optIn?: () => Promise<void>;
      optOut?: () => Promise<void>;
    };
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalRuntime) => void | Promise<void>>;
  }
}

export function NotificationSettings() {
  const { user } = useAuth();
  const {
    preferences,
    setNotificationsEnabled,
    setSoundEnabled,
    setSoundFile,
    requestBrowserPermission,
  } = useNotificationPreferences();

  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushHint, setPushHint] = useState<string | null>(null);
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const canonicalPushHost = 'app.farmvault.africa';
  const isLocalhost =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  const isCanonicalPushHost = isLocalhost || host === canonicalPushHost;

  const permissionStatus = preferences.browserPermission;
  const isPermissionBlocked = permissionStatus === 'denied';
  const isPermissionGranted = permissionStatus === 'granted';

  const canRegisterDevicePush =
    isWebPushConfiguredInApp() &&
    !import.meta.env.DEV &&
    isPermissionGranted;

  const resolveRoleTags = (): string[] => {
    const out = new Set<string>();
    const baseRole = (user?.role ?? '').trim().toLowerCase();
    const profileType = String((user as any)?.profileUserType ?? '').trim().toLowerCase();
    if (baseRole) out.add(baseRole);
    if (profileType === 'ambassador' || profileType === 'both') out.add('ambassador');
    if (baseRole !== 'developer' || profileType === 'both') out.add('company');
    if (out.size === 0) out.add('company');
    return Array.from(out);
  };

  const handleTestSound = async (soundFile: NotificationSoundFile) => {
    setPlayingSound(soundFile);
    await testNotificationSound(soundFile);
    setTimeout(() => setPlayingSound(null), 1000);
  };

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const permission = await requestBrowserPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
      }
    } finally {
      setIsRequestingPermission(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isCanonicalPushHost) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        const optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
        setNotificationsEnabled(optedIn);
      } catch {
        // Non-blocking.
      }
    });
  }, [setNotificationsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !isCanonicalPushHost) return;
    const permission = Notification.permission;
    if (permission === 'granted') {
      // Keep local toggle aligned with browser permission after refresh/reload.
      setNotificationsEnabled(true);
    }
  }, [setNotificationsEnabled]);

  const handleToggleNotifications = async (enabled: boolean) => {
    if (!isCanonicalPushHost) {
      setNotificationsEnabled(false);
      return;
    }
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        const optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);

        if (enabled) {
          if (user?.id && OneSignal.login) {
            await OneSignal.login(user.id);
          }
          if (user?.role && OneSignal.User?.addTag) {
            await Promise.resolve(OneSignal.User.addTag('role', String(user.role)));
          }
          const roleTags = resolveRoleTags();
          if (OneSignal.User?.addTag) {
            await Promise.resolve(OneSignal.User.addTag('roles', roleTags.join(',')));
            await Promise.resolve(OneSignal.User.addTag('has_role_developer', roleTags.includes('developer') ? '1' : '0'));
            await Promise.resolve(OneSignal.User.addTag('has_role_company', roleTags.includes('company') ? '1' : '0'));
            await Promise.resolve(OneSignal.User.addTag('has_role_ambassador', roleTags.includes('ambassador') ? '1' : '0'));
          }
          if (user?.companyId && OneSignal.User?.addTag) {
            await Promise.resolve(OneSignal.User.addTag('companyId', String(user.companyId)));
          }

          if (!optedIn) {
            if (OneSignal.Notifications?.requestPermission) {
              await OneSignal.Notifications.requestPermission();
            } else {
              await requestBrowserPermission();
            }
            if (OneSignal.User?.PushSubscription?.optIn) {
              await OneSignal.User.PushSubscription.optIn();
            }
          }
          const finalOptedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
          setNotificationsEnabled(finalOptedIn);
          return;
        }

        if (OneSignal.User?.PushSubscription?.optOut) {
          await OneSignal.User.PushSubscription.optOut();
        }
        setNotificationsEnabled(false);
      } catch {
        setNotificationsEnabled(enabled);
      }
    });
  };

  return (
    <div className="fv-card">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
      </div>

      <div className="space-y-6">
        {/* Browser Permission Status */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
          {isPermissionGranted ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : isPermissionBlocked ? (
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Browser Permission: {' '}
              <span className={cn(
                isPermissionGranted && 'text-emerald-600',
                isPermissionBlocked && 'text-destructive',
                !isPermissionGranted && !isPermissionBlocked && 'text-amber-600'
              )}>
                {isPermissionGranted ? 'Allowed' : isPermissionBlocked ? 'Blocked' : 'Not set'}
              </span>
            </p>
            {isPermissionBlocked && (
              <p className="text-xs text-muted-foreground mt-1">
                Notifications are blocked by your browser. To enable them, click the lock icon in your browser's address bar and allow notifications for this site.
              </p>
            )}
            {!isPermissionGranted && !isPermissionBlocked && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleRequestPermission}
                disabled={isRequestingPermission}
              >
                {isRequestingPermission ? 'Requesting...' : 'Request Permission'}
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              OneSignal status syncs with browser permission and subscription state.
            </p>
            {!isCanonicalPushHost && (
              <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                Push subscriptions are standardized on {canonicalPushHost}. Open the app on that domain to enable phone tray notifications.
              </p>
            )}
          </div>
        </div>

        {/* Enable Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Notifications</p>
            <p className="text-xs text-muted-foreground">
              Receive alerts for inventory actions and important updates
            </p>
          </div>
          <Switch
            checked={preferences.notificationsEnabled}
            onCheckedChange={handleToggleNotifications}
            disabled={isPermissionBlocked}
          />
        </div>

        {/* Web Push (VAPID) — production + HTTPS */}
        {isWebPushConfiguredInApp() && (
          <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-medium text-foreground">Phone &amp; desktop push</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Native tray notifications when the app is closed (Web Push, no Firebase). Uses the same schedule as
              morning / evening / weekly messages, plus inventory alerts.
            </p>
            {import.meta.env.DEV && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Local dev unregisters the service worker; use a production build over HTTPS to test push.
              </p>
            )}
            {canRegisterDevicePush && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-fit"
                  disabled={pushBusy}
                  onClick={async () => {
                    setPushHint(null);
                    setPushBusy(true);
                    try {
                      const r = await syncWebPushSubscriptionToServer({
                        companyId: user?.companyId ?? null,
                        role: resolveRoleTags().join(','),
                        deviceInfo: collectDeviceInfo(),
                      });
                      setPushHint(r.ok ? 'This device is registered for push.' : (r.error ?? 'Registration failed.'));
                    } finally {
                      setPushBusy(false);
                    }
                  }}
                >
                  {pushBusy ? 'Registering…' : 'Register this device'}
                </Button>
                {pushHint && (
                  <p className={cn('text-xs', pushHint.includes('failed') || pushHint.includes('not ') ? 'text-destructive' : 'text-emerald-600')}>
                    {pushHint}
                  </p>
                )}
              </>
            )}
            {!canRegisterDevicePush && isWebPushConfiguredInApp() && !import.meta.env.DEV && !isPermissionGranted && (
              <p className="text-xs text-muted-foreground">Allow browser notifications above, then register this device.</p>
            )}
          </div>
        )}

        {/* Sound Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {preferences.soundEnabled ? (
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">Notification Sound</p>
              <p className="text-xs text-muted-foreground">
                Play a sound when notifications arrive
              </p>
            </div>
          </div>
          <Switch
            checked={preferences.soundEnabled}
            onCheckedChange={setSoundEnabled}
            disabled={!preferences.notificationsEnabled}
          />
        </div>

        {/* Sound Selection */}
        {preferences.notificationsEnabled && preferences.soundEnabled && (
          <div className="space-y-3 pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground">Select Sound</p>
            <div className="grid gap-2">
              {NOTIFICATION_SOUNDS.map((sound) => (
                <div
                  key={sound.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                    preferences.soundFile === sound.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                  onClick={() => setSoundFile(sound.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      preferences.soundFile === sound.id
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    )}>
                      {preferences.soundFile === sound.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                    <span className="text-sm">{sound.label}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTestSound(sound.id);
                    }}
                  >
                    <Play className={cn(
                      'h-4 w-4',
                      playingSound === sound.id && 'text-primary animate-pulse'
                    )} />
                    <span className="sr-only">Test {sound.label}</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
