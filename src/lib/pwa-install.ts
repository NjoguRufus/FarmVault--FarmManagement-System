/**
 * Global PWA Install Prompt Manager
 * 
 * This module captures the beforeinstallprompt event EARLY (before React mounts)
 * and stores it for later use by React components.
 * 
 * The event must be captured at the module level because it fires once during
 * page load, often before React components have mounted.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallState = 
  | "idle"           // Initial state, checking availability
  | "available"      // Install prompt is available
  | "prompting"      // Currently showing the install prompt
  | "installed"      // App is installed (running standalone)
  | "dismissed"      // User dismissed the prompt (can still retry if prompt exists)
  | "unavailable";   // Install not supported or already installed

export type PromptInstallResult = "accepted" | "dismissed" | "unavailable";

// Module-level storage for the deferred prompt
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installState: InstallState = "idle";
const listeners: Set<(state: InstallState) => void> = new Set();

// Always log PWA install events for debugging (prefixed so users can filter)
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[PWA Install]", ...args);
}

function setState(newState: InstallState) {
  if (installState !== newState) {
    log(`State change: ${installState} → ${newState}`);
    installState = newState;
    listeners.forEach(fn => fn(newState));
  }
}

function getIsStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return standaloneMedia || iosStandalone;
}

/**
 * Initialize PWA install prompt capture.
 * Call this ONCE at app startup, before React mounts.
 */
export function initPwaInstall(): void {
  if (typeof window === "undefined") return;

  log("=== Initializing PWA Install Prompt Capture ===");
  log("Browser:", navigator.userAgent);
  log("URL:", window.location.href);

  // Check if already installed
  const standalone = getIsStandalone();
  log("Already running as standalone PWA?", standalone);
  
  if (standalone) {
    log("App is already installed (running standalone) - hiding install button");
    setState("installed");
    return;
  }

  // Listen for the beforeinstallprompt event
  const handleBeforeInstallPrompt = (event: Event) => {
    log("=== beforeinstallprompt EVENT FIRED ===");
    log("Event object:", event);
    event.preventDefault(); // Prevent Chrome's mini-infobar
    deferredPrompt = event as BeforeInstallPromptEvent;
    log("Deferred prompt stored successfully");
    log("deferredPrompt.prompt is function?", typeof deferredPrompt.prompt === "function");
    setState("available");
    log("Install button should now trigger native prompt");
  };

  // Listen for successful installation
  const handleAppInstalled = () => {
    log("=== appinstalled EVENT FIRED ===");
    log("App was successfully installed!");
    deferredPrompt = null;
    setState("installed");
  };

  // Listen for display mode changes (e.g., user opens as standalone)
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  const handleDisplayModeChange = (e: MediaQueryListEvent) => {
    log("Display mode changed, standalone:", e.matches);
    if (e.matches) {
      deferredPrompt = null;
      setState("installed");
    }
  };

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  mediaQuery.addEventListener("change", handleDisplayModeChange);

  // Check if we might have missed the event (it can fire before this code runs)
  log("Event listeners registered, waiting for beforeinstallprompt...");
  log("Note: Event will NOT fire if:");
  log("  - Browser doesn't support PWA install (iOS Safari, Firefox)");
  log("  - App is already installed");
  log("  - Manifest is invalid or missing required fields");
  log("  - Site isn't served over HTTPS (except localhost)");
  log("  - Service worker isn't registered");

  // Log status after a delay to help debugging
  setTimeout(() => {
    if (installState === "idle" && !deferredPrompt) {
      log("=== TIMEOUT: No beforeinstallprompt received after 3s ===");
      log("Current state:", installState);
      log("This means the browser likely doesn't support install or criteria not met");
      log("Fallback instructions will be shown to user");
    } else if (deferredPrompt) {
      log("Good: beforeinstallprompt was captured, native install available");
    }
  }, 3000);
}

/**
 * Get the current deferred prompt (if available)
 */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/**
 * Get the current install state
 */
export function getInstallState(): InstallState {
  return installState;
}

/**
 * Check if install is available.
 * Returns true if we have a deferred prompt and the app isn't installed or currently prompting.
 * Allows retrying after dismissal since some browsers allow re-prompting.
 */
export function canInstall(): boolean {
  const hasPrompt = deferredPrompt !== null;
  const canTrigger = hasPrompt && 
    installState !== "installed" && 
    installState !== "prompting" &&
    installState !== "unavailable";
  log("canInstall check:", { hasPrompt, installState, canTrigger });
  return canTrigger;
}

/**
 * Check if the app is installed (running standalone)
 */
export function isInstalled(): boolean {
  return installState === "installed" || getIsStandalone();
}

/**
 * Trigger the install prompt
 */
export async function promptInstall(): Promise<PromptInstallResult> {
  log("promptInstall() called", { hasDeferredPrompt: !!deferredPrompt, installState });
  
  if (!deferredPrompt) {
    log("ERROR: No deferred prompt available - beforeinstallprompt event may not have fired");
    return "unavailable";
  }

  log("Triggering native install prompt via deferredPrompt.prompt()...");
  setState("prompting");

  try {
    // Some browsers only allow prompt() to be called once per event
    // Store reference before calling in case it gets nullified
    const promptEvent = deferredPrompt;
    
    await promptEvent.prompt();
    log("Native prompt displayed, waiting for user choice...");
    
    const choice = await promptEvent.userChoice;
    log("User made choice:", { outcome: choice.outcome, platform: choice.platform });

    if (choice.outcome === "accepted") {
      log("SUCCESS: User accepted installation");
      deferredPrompt = null;
      setState("installed");
      return "accepted";
    } else {
      log("User dismissed installation - keeping prompt for potential retry");
      // After dismissal, some browsers may still allow retrying with the same event
      // Keep the state as "available" if we still have the prompt
      if (deferredPrompt) {
        setState("available");
      } else {
        setState("dismissed");
      }
      return "dismissed";
    }
  } catch (error) {
    log("ERROR: Install prompt failed:", error);
    // The prompt was likely consumed or is no longer valid
    deferredPrompt = null;
    setState("unavailable");
    return "unavailable";
  }
}

/**
 * Subscribe to install state changes
 */
export function subscribeToInstallState(callback: (state: InstallState) => void): () => void {
  listeners.add(callback);
  // Immediately call with current state
  callback(installState);
  return () => listeners.delete(callback);
}

/**
 * Get device-specific fallback instructions
 */
export function getFallbackInstructions(): { title: string; steps: string[] } | null {
  if (typeof window === "undefined") return null;

  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
  const isChrome = /chrome/.test(ua) && !/edge/.test(ua);

  if (isIos && isSafari) {
    return {
      title: "Install on iPhone/iPad",
      steps: [
        "Tap the Share button (square with arrow)",
        "Scroll down and tap 'Add to Home Screen'",
        "Tap 'Add' to confirm",
      ],
    };
  }

  if (isAndroid && isChrome) {
    return {
      title: "Install on Android",
      steps: [
        "Tap the menu button (three dots)",
        "Tap 'Install app' or 'Add to Home Screen'",
        "Tap 'Install' to confirm",
      ],
    };
  }

  if (isAndroid) {
    return {
      title: "Install on Android",
      steps: [
        "Open the browser menu",
        "Look for 'Install app' or 'Add to Home Screen'",
        "Follow the prompts to install",
      ],
    };
  }

  // Desktop browsers
  return {
    title: "Install FarmVault",
    steps: [
      "Look for the install icon in the address bar",
      "Or use browser menu → 'Install FarmVault'",
      "Click 'Install' when prompted",
    ],
  };
}
