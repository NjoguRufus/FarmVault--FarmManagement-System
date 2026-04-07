import { useEffect, useState, useCallback, useMemo } from "react";
import {
  type InstallState,
  type PromptInstallResult,
  type BrowserInfo,
  type FallbackInstructions,
  canInstall as checkCanInstall,
  isInstalled as checkIsInstalled,
  needsFallback as checkNeedsFallback,
  promptInstall as triggerPromptInstall,
  subscribeToInstallState,
  getInstallState,
  getFallbackInstructions,
  getBrowserInfo,
} from "@/lib/pwa-install";
import { logger } from "@/lib/logger";

export type { BeforeInstallPromptEvent, InstallState, PromptInstallResult, BrowserInfo, FallbackInstructions } from "@/lib/pwa-install";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  logger.log("[PWA Install Hook]", ...args);
}

/**
 * React hook for PWA installation.
 * 
 * Uses the global pwa-install module which captures the beforeinstallprompt
 * event early (before React mounts) to ensure we don't miss it.
 * 
 * Provides:
 * - canInstall: true if native install prompt is available
 * - needsFallback: true if fallback instructions should be shown
 * - isInstalled: true if app is already installed
 * - browserInfo: detected browser and platform info
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
  const [needsFallback, setNeedsFallback] = useState(() => {
    const needs = checkNeedsFallback();
    log("Initial needsFallback:", needs);
    return needs;
  });

  // Browser info is static, so we can memoize it
  const browserInfo = useMemo<BrowserInfo>(() => {
    const info = getBrowserInfo();
    log("Browser info:", info);
    return info;
  }, []);

  useEffect(() => {
    log("Setting up state subscription...");
    
    // Subscribe to state changes from the global module
    const unsubscribe = subscribeToInstallState((newState) => {
      log("State change received:", newState);
      setInstallState(newState);
      const newCanInstall = checkCanInstall();
      const newIsInstalled = checkIsInstalled();
      const newNeedsFallback = checkNeedsFallback();
      log("Updated values:", { newState, newCanInstall, newIsInstalled, newNeedsFallback });
      setCanInstall(newCanInstall);
      setIsInstalled(newIsInstalled);
      setNeedsFallback(newNeedsFallback);
    });

    // Also update immediately in case state changed before subscription
    const immediateCanInstall = checkCanInstall();
    const immediateIsInstalled = checkIsInstalled();
    const immediateNeedsFallback = checkNeedsFallback();
    log("Immediate check after mount:", { canInstall: immediateCanInstall, isInstalled: immediateIsInstalled, needsFallback: immediateNeedsFallback });
    setCanInstall(immediateCanInstall);
    setIsInstalled(immediateIsInstalled);
    setNeedsFallback(immediateNeedsFallback);

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
    /** Whether the native install prompt is available and can be triggered */
    canInstall,
    /** Whether fallback instructions should be shown (browser doesn't support native install) */
    needsFallback,
    /** Whether the app is installed (running as standalone PWA) */
    isInstalled,
    /** Current install state for UI feedback */
    installState,
    /** Detected browser and platform info */
    browserInfo,
    /** Trigger the native install prompt. Returns the user's choice. */
    promptInstall,
    /** Get browser-specific fallback instructions */
    getFallbackInstructions,
  };
}
