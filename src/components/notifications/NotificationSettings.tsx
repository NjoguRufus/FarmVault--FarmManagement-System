import React, { useState } from 'react';
import { Bell, Volume2, VolumeX, Play, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { 
  NOTIFICATION_SOUNDS, 
  testNotificationSound,
  type NotificationSoundFile 
} from '@/services/notificationSoundService';

export function NotificationSettings() {
  const {
    preferences,
    setNotificationsEnabled,
    setSoundEnabled,
    setSoundFile,
    requestBrowserPermission,
  } = useNotificationPreferences();

  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

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

  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled && preferences.browserPermission !== 'granted') {
      const permission = await requestBrowserPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
      }
    } else {
      setNotificationsEnabled(enabled);
    }
  };

  const permissionStatus = preferences.browserPermission;
  const isPermissionBlocked = permissionStatus === 'denied';
  const isPermissionGranted = permissionStatus === 'granted';

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
