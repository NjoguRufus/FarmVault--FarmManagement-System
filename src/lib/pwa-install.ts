import { logger } from "@/lib/logger";
/**
 * Global PWA Install Prompt Manager
 * 
 * This module captures the beforeinstallprompt event EARLY (before React mounts)
 * and stores it for later use by React components.
 * 
 * The event must be captured at the module level because it fires once during
 * page load, often before React components have mounted.
 * 
 * BROWSER SUPPORT FOR beforeinstallprompt:
 * ✅ Supported: Chrome, Edge, Brave, Opera, Samsung Internet, Arc
 * ❌ Not supported: Safari (iOS & Mac), Firefox, IE
 * 
 * For unsupported browsers, we show browser-specific manual install instructions.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallState = 
  | "idle"           // Initial state, waiting for beforeinstallprompt
  | "available"      // Install prompt is available (beforeinstallprompt captured)
  | "prompting"      // Currently showing the install prompt
  | "installed"      // App is installed (running standalone)
  | "dismissed"      // User dismissed the prompt (can still retry if prompt exists)
  | "unsupported"    // Browser doesn't support beforeinstallprompt (use fallback)
  | "unavailable";   // Install not supported or criteria not met

export type PromptInstallResult = "accepted" | "dismissed" | "unavailable";

export type BrowserInfo = {
  browser: "chrome" | "edge" | "brave" | "firefox" | "safari" | "opera" | "samsung" | "arc" | "other";
  platform: "ios" | "android" | "macos" | "windows" | "linux" | "other";
  supportsBeforeInstallPrompt: boolean;
};

// Module-level storage for the deferred prompt
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installState: InstallState = "idle";
let browserInfo: BrowserInfo | null = null;
const listeners: Set<(state: InstallState) => void> = new Set();

// Always log PWA install events for debugging (prefixed so users can filter)
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  logger.log("[PWA Install]", ...args);
}

function setState(newState: InstallState) {
  if (installState !== newState) {
    log(`State change: ${installState} → ${newState}`);
    installState = newState;
    listeners.forEach(fn => fn(newState));
  }
}

/**
 * Detect browser and platform for appropriate install flow
 */
function detectBrowser(): BrowserInfo {
  if (typeof window === "undefined") {
    return { browser: "other", platform: "other", supportsBeforeInstallPrompt: false };
  }

  const ua = navigator.userAgent.toLowerCase();
  const vendor = navigator.vendor?.toLowerCase() ?? "";
  
  // Platform detection
  let platform: BrowserInfo["platform"] = "other";
  if (/iphone|ipad|ipod/.test(ua)) {
    platform = "ios";
  } else if (/android/.test(ua)) {
    platform = "android";
  } else if (/macintosh|mac os x/.test(ua)) {
    platform = "macos";
  } else if (/windows/.test(ua)) {
    platform = "windows";
  } else if (/linux/.test(ua)) {
    platform = "linux";
  }

  // Browser detection (order matters - more specific checks first)
  let browser: BrowserInfo["browser"] = "other";
  
  // Brave has its own navigator property
  if ((navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave) {
    browser = "brave";
  }
  // Arc browser
  else if (ua.includes("arc/")) {
    browser = "arc";
  }
  // Samsung Internet
  else if (ua.includes("samsungbrowser")) {
    browser = "samsung";
  }
  // Opera
  else if (ua.includes("opr/") || ua.includes("opera")) {
    browser = "opera";
  }
  // Edge (Chromium-based)
  else if (ua.includes("edg/")) {
    browser = "edge";
  }
  // Firefox
  else if (ua.includes("firefox") || ua.includes("fxios")) {
    browser = "firefox";
  }
  // Chrome (must check after Edge since Edge includes "chrome" in UA)
  else if (ua.includes("chrome") && vendor.includes("google")) {
    browser = "chrome";
  }
  // Safari (must check after Chrome since Chrome on iOS includes "safari" in UA)
  else if (ua.includes("safari") && vendor.includes("apple")) {
    browser = "safari";
  }

  // beforeinstallprompt is supported by Chromium-based browsers
  // Safari (all platforms) and Firefox do NOT support it
  const supportsBeforeInstallPrompt = 
    platform !== "ios" && // iOS doesn't support it in any browser
    browser !== "safari" && 
    browser !== "firefox" &&
    ["chrome", "edge", "brave", "opera", "samsung", "arc"].includes(browser);

  const info: BrowserInfo = { browser, platform, supportsBeforeInstallPrompt };
  log("Browser detected:", info);
  return info;
}

function getIsStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return standaloneMedia || iosStandalone;
}

/**
 * Get the detected browser info
 */
export function getBrowserInfo(): BrowserInfo {
  if (!browserInfo) {
    browserInfo = detectBrowser();
  }
  return browserInfo;
}

/**
 * Initialize PWA install prompt capture.
 * Prefer {@link schedulePwaInstallDeferred} at app startup so auth/sign-up is not
 * contending with PWA listeners; may miss a very early `beforeinstallprompt` in edge cases.
 */
function initPwaInstallImpl(): void {
  log("=== Initializing PWA Install Prompt Capture ===");
  
  // Detect browser capabilities first
  browserInfo = detectBrowser();
  log("Browser:", browserInfo.browser, "Platform:", browserInfo.platform);
  log("Supports beforeinstallprompt:", browserInfo.supportsBeforeInstallPrompt);
  log("User Agent:", navigator.userAgent);
  log("URL:", window.location.href);

  // Check if already installed
  const standalone = getIsStandalone();
  log("Already running as standalone PWA?", standalone);
  
  if (standalone) {
    log("App is already installed (running standalone) - hiding install button");
    setState("installed");
    return;
  }

  // If browser doesn't support beforeinstallprompt, mark as unsupported immediately
  // This allows the UI to show fallback instructions right away
  if (!browserInfo.supportsBeforeInstallPrompt) {
    log("Browser does NOT support beforeinstallprompt - will use fallback instructions");
    log("Fallback will be shown for:", browserInfo.browser, "on", browserInfo.platform);
    setState("unsupported");
    return;
  }

  // For supported browsers, listen for the beforeinstallprompt event
  log("Browser supports beforeinstallprompt - setting up event listener");

  const handleBeforeInstallPrompt = (event: Event) => {
    log("=== beforeinstallprompt EVENT FIRED ===");
    log("Event object:", event);
    event.preventDefault(); // Prevent Chrome's mini-infobar
    deferredPrompt = event as BeforeInstallPromptEvent;
    log("Deferred prompt stored successfully");
    log("deferredPrompt.prompt is function?", typeof deferredPrompt.prompt === "function");
    setState("available");
    log("Install button will now trigger native prompt");
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

  log("Event listeners registered, waiting for beforeinstallprompt...");
  log("Note: Event will NOT fire if:");
  log("  - App is already installed");
  log("  - Manifest is invalid or missing required fields");
  log("  - Site isn't served over HTTPS (except localhost)");
  log("  - Service worker isn't registered");

  // For supported browsers, log status after a delay to help debugging
  // If we haven't received the event, PWA criteria may not be met
  setTimeout(() => {
    if (installState === "idle" && !deferredPrompt) {
      log("=== TIMEOUT: No beforeinstallprompt received after 3s ===");
      log("Current state:", installState);
      log("Browser supports the event but PWA criteria may not be met");
      log("Check: manifest, service worker, HTTPS, icons");
      // Mark as unavailable - we expected the event but didn't get it
      setState("unavailable");
    } else if (deferredPrompt) {
      log("Good: beforeinstallprompt was captured, native install available");
    }
  }, 3000);
}

export function initPwaInstall(): void {
  if (typeof window === "undefined") return;
  try {
    initPwaInstallImpl();
  } catch (error) {
    console.warn("PWA init skipped:", error);
  }
}

/**
 * Run PWA install capture after `load` + delay so sign-up and Clerk are not blocked by
 * the same turn as early PWA setup.
 */
export function schedulePwaInstallDeferred(): void {
  if (typeof window === "undefined") return;
  const run = () => {
    setTimeout(() => {
      try {
        initPwaInstall();
      } catch (error) {
        console.warn("PWA init skipped:", error);
      }
    }, 1000);
  };
  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run);
  }
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
 * Check if native install prompt is available.
 * Returns true if we have a deferred prompt and can trigger it.
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
 * Check if fallback instructions should be shown.
 * This is true when:
 * - Browser doesn't support beforeinstallprompt (Safari, Firefox)
 * - OR PWA criteria aren't met (unavailable state)
 * - AND app is not already installed
 */
export function needsFallback(): boolean {
  const needs = (installState === "unsupported" || installState === "unavailable") && 
    !getIsStandalone();
  log("needsFallback check:", { installState, needs });
  return needs;
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

export interface FallbackInstructions {
  title: string;
  steps: string[];
  icon?: "share" | "menu" | "plus" | "install";
  hint?: string;
}

/**
 * Get browser-specific fallback instructions for manual PWA installation.
 * These are shown when beforeinstallprompt is not available.
 */
export function getFallbackInstructions(): FallbackInstructions | null {
  if (typeof window === "undefined") return null;

  const info = getBrowserInfo();
  log("Getting fallback instructions for:", info);

  // iOS Safari (iPhone/iPad)
  if (info.platform === "ios" && info.browser === "safari") {
    return {
      title: "Install on iPhone/iPad",
      steps: [
        "Tap the Share button at the bottom of Safari",
        "Scroll down and tap 'Add to Home Screen'",
        "Tap 'Add' in the top right to confirm",
      ],
      icon: "share",
      hint: "Look for the square icon with an upward arrow",
    };
  }

  // iOS with non-Safari browser (Chrome on iOS, Firefox on iOS, etc.)
  if (info.platform === "ios") {
    return {
      title: "Install on iPhone/iPad",
      steps: [
        "Open this page in Safari for the best install experience",
        "In Safari, tap the Share button",
        "Tap 'Add to Home Screen'",
      ],
      icon: "share",
      hint: "PWA installation works best in Safari on iOS",
    };
  }

  // macOS Safari
  if (info.platform === "macos" && info.browser === "safari") {
    return {
      title: "Install on Mac",
      steps: [
        "Click 'File' in the menu bar",
        "Select 'Add to Dock...'",
        "Click 'Add' to confirm",
      ],
      icon: "plus",
      hint: "FarmVault will appear in your Dock as a standalone app",
    };
  }

  // Firefox (all platforms)
  if (info.browser === "firefox") {
    return {
      title: "Install FarmVault",
      steps: [
        "Firefox doesn't support one-click PWA install",
        "For the best experience, use Chrome, Edge, or Brave",
        "Or bookmark this page for quick access",
      ],
      icon: "menu",
      hint: "Consider using a Chromium-based browser for PWA install",
    };
  }

  // Android Chrome
  if (info.platform === "android" && info.browser === "chrome") {
    return {
      title: "Install on Android",
      steps: [
        "Tap the three-dot menu (⋮) in Chrome",
        "Tap 'Install app' or 'Add to Home Screen'",
        "Tap 'Install' to confirm",
      ],
      icon: "menu",
      hint: "FarmVault will appear on your home screen",
    };
  }

  // Android Samsung Internet
  if (info.platform === "android" && info.browser === "samsung") {
    return {
      title: "Install on Android",
      steps: [
        "Tap the menu button (three lines)",
        "Tap 'Add page to' → 'Home Screen'",
        "Tap 'Add' to confirm",
      ],
      icon: "menu",
      hint: "FarmVault will appear on your home screen",
    };
  }

  // Android other browsers
  if (info.platform === "android") {
    return {
      title: "Install on Android",
      steps: [
        "Open the browser menu",
        "Look for 'Install app' or 'Add to Home Screen'",
        "Follow the prompts to install",
      ],
      icon: "menu",
      hint: "The option name varies by browser",
    };
  }

  // Desktop Chrome
  if (info.browser === "chrome") {
    return {
      title: "Install FarmVault",
      steps: [
        "Click the install icon (⊕) in the address bar",
        "Or click the three-dot menu → 'Install FarmVault'",
        "Click 'Install' when prompted",
      ],
      icon: "install",
      hint: "Look for the install icon in the right side of the address bar",
    };
  }

  // Desktop Edge
  if (info.browser === "edge") {
    return {
      title: "Install FarmVault",
      steps: [
        "Click the install icon in the address bar",
        "Or click the menu (⋯) → Apps → 'Install FarmVault'",
        "Click 'Install' to confirm",
      ],
      icon: "install",
      hint: "Edge provides excellent PWA support",
    };
  }

  // Desktop Brave
  if (info.browser === "brave") {
    return {
      title: "Install FarmVault",
      steps: [
        "Click the install icon in the address bar",
        "Or click the menu → 'Install FarmVault'",
        "Click 'Install' to confirm",
      ],
      icon: "install",
      hint: "Brave supports PWA installation like Chrome",
    };
  }

  // Desktop Opera
  if (info.browser === "opera") {
    return {
      title: "Install FarmVault",
      steps: [
        "Click the install icon in the address bar",
        "Or go to Menu → 'Install FarmVault'",
        "Click 'Install' to confirm",
      ],
      icon: "install",
      hint: "Opera supports PWA installation",
    };
  }

  // Generic fallback for unknown browsers
  return {
    title: "Install FarmVault",
    steps: [
      "Look for an install option in your browser menu",
      "Or check for an install icon in the address bar",
      "If not available, bookmark this page for quick access",
    ],
    icon: "menu",
    hint: "Installation varies by browser",
  };
}
