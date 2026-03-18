import { useEffect, useState, useCallback } from "react";
import {
  type InstallState,
  type PromptInstallResult,
  canInstall as checkCanInstall,
  isInstalled as checkIsInstalled,
  promptInstall as triggerPromptInstall,
  subscribeToInstallState,
  getInstallState,
  getFallbackInstructions,
} from "@/lib/pwa-install";

export type { BeforeInstallPromptEvent, InstallState, PromptInstallResult } from "@/lib/pwa-install";

/**
 * React hook for PWA installation.
 * 
 * Uses the global pwa-install module which captures the beforeinstallprompt
 * event early (before React mounts) to ensure we don't miss it.
 */
export function usePwaInstall() {
  const [installState, setInstallState] = useState<InstallState>(getInstallState);
  const [canInstall, setCanInstall] = useState(checkCanInstall);
  const [isInstalled, setIsInstalled] = useState(checkIsInstalled);

  useEffect(() => {
    // Subscribe to state changes from the global module
    const unsubscribe = subscribeToInstallState((newState) => {
      setInstallState(newState);
      setCanInstall(checkCanInstall());
      setIsInstalled(checkIsInstalled());
    });

    // Also update immediately in case state changed before subscription
    setCanInstall(checkCanInstall());
    setIsInstalled(checkIsInstalled());

    return unsubscribe;
  }, []);

  const promptInstall = useCallback(async (): Promise<PromptInstallResult> => {
    const result = await triggerPromptInstall();
    // State will be updated via subscription
    return result;
  }, []);

  return {
    /** Whether the install prompt is available and can be triggered */
    canInstall,
    /** Whether the app is installed (running as standalone PWA) */
    isInstalled,
    /** Current install state for UI feedback */
    installState,
    /** Trigger the install prompt. Returns the user's choice. */
    promptInstall,
    /** Get device-specific fallback instructions when direct install isn't available */
    getFallbackInstructions,
  };
}
