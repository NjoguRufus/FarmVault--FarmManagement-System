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
  | "dismissed"      // User dismissed the prompt
  | "unavailable";   // Install not supported or already installed

export type PromptInstallResult = "accepted" | "dismissed" | "unavailable";

// Module-level storage for the deferred prompt
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installState: InstallState = "idle";
const listeners: Set<(state: InstallState) => void> = new Set();

// Debug logging helper
const DEBUG = typeof window !== "undefined" && 
  (window.location.hostname === "localhost" || 
   window.location.search.includes("pwa_debug=1"));

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log("[PWA Install]", ...args);
  }
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

  log("Initializing PWA install prompt capture...");

  // Check if already installed
  if (getIsStandalone()) {
    log("App is already installed (running standalone)");
    setState("installed");
    return;
  }

  // Listen for the beforeinstallprompt event
  const handleBeforeInstallPrompt = (event: Event) => {
    log("beforeinstallprompt event captured!", event);
    event.preventDefault(); // Prevent Chrome's mini-infobar
    deferredPrompt = event as BeforeInstallPromptEvent;
    setState("available");
  };

  // Listen for successful installation
  const handleAppInstalled = () => {
    log("appinstalled event received - app was installed");
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

  // Set initial state based on browser support
  // Note: We stay in "idle" until we either get the prompt or confirm it's unavailable
  // The prompt may arrive asynchronously after page load
  setTimeout(() => {
    if (installState === "idle" && !deferredPrompt) {
      log("No install prompt received after timeout - likely unsupported or already installed");
      // Don't change state here - leave as idle since prompt might still come
      // Only component UI will show fallback if canInstall is false
    }
  }, 3000);

  log("Event listeners registered, waiting for beforeinstallprompt...");
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
 * Check if install is available
 */
export function canInstall(): boolean {
  return deferredPrompt !== null && installState === "available";
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
  if (!deferredPrompt) {
    log("promptInstall called but no deferred prompt available");
    return "unavailable";
  }

  log("Triggering install prompt...");
  setState("prompting");

  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    log("User choice:", choice.outcome);

    if (choice.outcome === "accepted") {
      deferredPrompt = null;
      setState("installed");
      return "accepted";
    } else {
      setState("dismissed");
      // Note: After dismissal, the prompt may become available again later
      // Keep the deferredPrompt in case user wants to try again
      return "dismissed";
    }
  } catch (error) {
    log("Install prompt error:", error);
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
