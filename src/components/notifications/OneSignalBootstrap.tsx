import { useEffect } from 'react';

type OneSignalRuntime = {
  init: (options: Record<string, unknown>) => Promise<void>;
  showSlidedownPrompt?: () => void | Promise<void>;
  Notifications?: {
    permission?: 'default' | 'granted' | 'denied';
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
    const host = (window.location.hostname || '').toLowerCase();
    const canonicalHost = 'app.farmvault.africa';
    const isLocalhost =
      host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
    if (!isLocalhost && host !== canonicalHost) {
      // Standardize push subscriptions to the app origin only.
      return;
    }
    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    if (!appId) {
      // eslint-disable-next-line no-console
      console.warn('[OneSignal] Missing VITE_ONESIGNAL_APP_ID; push will stay disabled.');
      return;
    }

    // Prevent duplicate init in StrictMode/dev remounts.
    if (window.__farmvaultOneSignalBootstrapped) return;
    window.__farmvaultOneSignalBootstrapped = true;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({
        appId,
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerUpdaterPath: '/OneSignalSDKUpdaterWorker.js',
        notifyButton: { enable: true },
        allowLocalhostAsSecureOrigin: true,
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: 'push',
                autoPrompt: true,
                delay: { pageViews: 1, timeDelay: 8 },
              },
            ],
          },
        },
      });

      // Avoid forcing native permission on page-load (Chrome may suppress it without user gesture).
      // Prefer OneSignal soft prompt first.
      if (OneSignal.Notifications?.permission === 'default' && OneSignal.showSlidedownPrompt) {
        await Promise.resolve(OneSignal.showSlidedownPrompt());
      }
    });
  }, []);

  return null;
}

