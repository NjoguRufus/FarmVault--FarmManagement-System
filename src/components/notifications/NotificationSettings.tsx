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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCompany, updateCompany } from '@/services/companyService';
import {
  collectDeviceInfo,
  isWebPushConfiguredInApp,
  syncWebPushSubscriptionToServer,
} from '@/services/webPushSubscriptionService';
import { resetOneSignalSubscription } from '@/services/oneSignalService';

type OneSignalRuntime = {
  Notifications?: {
    requestPermission?: () => Promise<string>;
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

  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const isCompanyAdmin =
    user?.role === 'company-admin' ||
    (user as any)?.role === 'company_admin' ||
    user?.role === 'developer';

  const { data: companyData } = useQuery({
    queryKey: ['company', companyId],
    enabled: !!companyId,
    queryFn: () => getCompany(companyId!),
    staleTime: 30_000,
  });

  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushHint, setPushHint] = useState<string | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
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
        // Also queue OneSignal opt-in so the device registers with the SDK.
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            if (OneSignal.User?.PushSubscription?.optIn) {
              await OneSignal.User.PushSubscription.optIn();
            }
          } catch {
            // Non-blocking.
          }
        });
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

    // Company admins/developers also persist the flag to the database so that
    // OneSignalIdentitySync picks it up for every user on their next load.
    if (isCompanyAdmin && companyId) {
      try {
        await updateCompany(companyId, { notificationsEnabled: enabled });
        await queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      } catch {
        // Non-blocking — still proceed with device-level toggle.
      }
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
            let granted =
              typeof window !== 'undefined' &&
              'Notification' in window &&
              Notification.permission === 'granted';
            if (OneSignal.Notifications?.requestPermission) {
              const result = await OneSignal.Notifications.requestPermission();
              granted = result === 'granted';
            } else {
              granted = (await requestBrowserPermission()) === 'granted';
            }
            if (granted && OneSignal.User?.PushSubscription?.optIn) {
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
      <div className="flex items-center gap-2 mb-5">
        <Bell className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
      </div>

      <div className="space-y-5">
        {/* Browser Permission Status */}
        <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/50">
          <div className="flex items-start gap-2.5">
            {isPermissionGranted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : isPermissionBlocked ? (
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">Browser permission</p>
              <p className={cn(
                'text-xs mt-0.5',
                isPermissionGranted && 'text-emerald-600',
                isPermissionBlocked && 'text-destructive',
                !isPermissionGranted && !isPermissionBlocked && 'text-muted-foreground'
              )}>
                {isPermissionGranted
                  ? 'Allowed — this browser can receive notifications'
                  : isPermissionBlocked
                  ? 'Blocked — click the lock icon in your address bar to allow'
                  : 'Not yet granted'}
              </p>
              {!isCanonicalPushHost && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  Open {canonicalPushHost} to enable push on this device.
                </p>
              )}
            </div>
          </div>
          {!isPermissionGranted && !isPermissionBlocked && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleRequestPermission}
              disabled={isRequestingPermission}
            >
              {isRequestingPermission ? 'Requesting…' : 'Allow'}
            </Button>
          )}
        </div>

        {/* Enable Notifications Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Push notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isCompanyAdmin
                ? 'Enable push alerts for all team members'
                : 'Receive push alerts on this device'}
            </p>
            {!isCompanyAdmin && companyData && !companyData.notifications_enabled && (
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                Disabled by your company admin.
              </p>
            )}
          </div>
          <Switch
            checked={preferences.notificationsEnabled}
            onCheckedChange={handleToggleNotifications}
            disabled={isPermissionBlocked || (!isCompanyAdmin && !companyData?.notifications_enabled)}
          />
        </div>

        {/* Fix Notifications — re-runs the full subscribe cycle for this device */}
        {isCanonicalPushHost && user?.id && (
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Not receiving notifications?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Re-triggers the permission prompt and re-subscribes this device.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={fixBusy}
              onClick={async () => {
                setFixBusy(true);
                resetOneSignalSubscription(user.id);
                // Give the queued async work time to run before re-enabling.
                await new Promise<void>((r) => setTimeout(r, 3000));
                // Sync UI permission state from browser after reset cycle.
                if (typeof window !== 'undefined' && 'Notification' in window) {
                  if (Notification.permission === 'granted') {
                    setNotificationsEnabled(true);
                  }
                }
                setFixBusy(false);
              }}
            >
              {fixBusy ? 'Fixing…' : 'Fix Notifications'}
            </Button>
          </div>
        )}

        {/* Web Push (VAPID) — production + HTTPS */}
        {isWebPushConfiguredInApp() && (
          <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-medium text-foreground">Phone &amp; desktop push</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Receive tray notifications even when the app is closed.
            </p>
            {import.meta.env.DEV && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Use a production build over HTTPS to test push.
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
            {!canRegisterDevicePush && !import.meta.env.DEV && !isPermissionGranted && (
              <p className="text-xs text-muted-foreground">Allow browser notifications above, then register this device.</p>
            )}
          </div>
        )}

        {/* Sound Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {preferences.soundEnabled ? (
              <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">Alert sound</p>
              <p className="text-xs text-muted-foreground mt-0.5">Play a sound when alerts arrive</p>
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
          <div className="space-y-2 pt-3 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select alert sound</p>
            <div className="grid gap-1.5">
              {NOTIFICATION_SOUNDS.map((sound) => (
                <div
                  key={sound.id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
                    preferences.soundFile === sound.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  )}
                  onClick={() => setSoundFile(sound.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                      preferences.soundFile === sound.id
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    )}>
                      {preferences.soundFile === sound.id && (
                        <div className="w-1 h-1 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                    <span className="text-sm">{sound.label}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTestSound(sound.id);
                    }}
                  >
                    <Play className={cn('h-3.5 w-3.5 shrink-0', playingSound === sound.id && 'text-primary animate-pulse')} />
                    {playingSound === sound.id ? 'Playing…' : 'Preview'}
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
