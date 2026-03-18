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

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[PWA Install Hook]", ...args);
}

/**
 * React hook for PWA installation.
 * 
 * Uses the global pwa-install module which captures the beforeinstallprompt
 * event early (before React mounts) to ensure we don't miss it.
 */
export function usePwaInstall() {
  const [installState, setInstallState] = useState<InstallState>(() => {
    const state = getInstallState();
    log("Initial state:", state);
    return state;
  });
  const [canInstall, setCanInstall] = useState(() => {
    const can = checkCanInstall();
    log("Initial canInstall:", can);
    return can;
  });
  const [isInstalled, setIsInstalled] = useState(() => {
    const installed = checkIsInstalled();
    log("Initial isInstalled:", installed);
    return installed;
  });

  useEffect(() => {
    log("Setting up state subscription...");
    
    // Subscribe to state changes from the global module
    const unsubscribe = subscribeToInstallState((newState) => {
      log("State change received:", newState);
      setInstallState(newState);
      const newCanInstall = checkCanInstall();
      const newIsInstalled = checkIsInstalled();
      log("Updated values:", { newState, newCanInstall, newIsInstalled });
      setCanInstall(newCanInstall);
      setIsInstalled(newIsInstalled);
    });

    // Also update immediately in case state changed before subscription
    const immediateCanInstall = checkCanInstall();
    const immediateIsInstalled = checkIsInstalled();
    log("Immediate check after mount:", { canInstall: immediateCanInstall, isInstalled: immediateIsInstalled });
    setCanInstall(immediateCanInstall);
    setIsInstalled(immediateIsInstalled);

    return () => {
      log("Cleaning up subscription");
      unsubscribe();
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<PromptInstallResult> => {
    log("promptInstall() called from hook");
    const result = await triggerPromptInstall();
    log("promptInstall() result:", result);
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
