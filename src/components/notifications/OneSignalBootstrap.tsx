import { useEffect } from 'react';

type OneSignalRuntime = {
  init: (options: Record<string, unknown>) => Promise<void>;
  Notifications?: {
    requestPermission?: () => Promise<void>;
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalRuntime) => void | Promise<void>>;
    __farmvaultOneSignalBootstrapped?: boolean;
  }
}

export function OneSignalBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    if (!appId) return;

    // Prevent duplicate init in StrictMode/dev remounts.
    if (window.__farmvaultOneSignalBootstrapped) return;
    window.__farmvaultOneSignalBootstrapped = true;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({
        appId,
        notifyButton: { enable: true },
        allowLocalhostAsSecureOrigin: true,
      });

      if (OneSignal.Notifications?.requestPermission) {
        await OneSignal.Notifications.requestPermission();
      }
    });
  }, []);

  return null;
}

