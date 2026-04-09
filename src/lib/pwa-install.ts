import { logger } from "@/lib/logger";

declare global {
  interface Window {
    /**
     * Set to `true` by pwa-install when ?install=true is detected on load.
     * DomainGuard reads this to suppress the /sign-in redirect while the
     * native PWA install dialog is being prepared and shown.
     * Cleared by pwa-install after the dialog resolves (or on any failure path).
     */
    __FARMVAULT_INSTALL_MODE__?: boolean;
  }
}

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
let pwaInstallInitRan = false;

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
 * Initialize PWA install prompt capture. Call from app entry as early as possible
 * (e.g. main.tsx) so `beforeinstallprompt` is not missed.
 */
function initPwaInstallImpl(): void {
  if (pwaInstallInitRan) {
    return;
  }

  log("=== Initializing PWA Install Prompt Capture ===");

  // Set install mode flag BEFORE any routing or auth logic runs.
  // DomainGuard (a React effect) reads this to suppress the /sign-in redirect
  // so the native install dialog has a chance to fire on this page.
  const installParams = new URLSearchParams(window.location.search);
  if (installParams.get("install") === "true") {
    window.__FARMVAULT_INSTALL_MODE__ = true;
    log("Install mode activated (__FARMVAULT_INSTALL_MODE__ = true)");
  }

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
    window.__FARMVAULT_INSTALL_MODE__ = false;
    setState("installed");
    pwaInstallInitRan = true;
    return;
  }

  // If browser doesn't support beforeinstallprompt, mark as unsupported immediately
  if (!browserInfo.supportsBeforeInstallPrompt) {
    log("Browser does NOT support beforeinstallprompt - will use fallback instructions");
    log("Fallback will be shown for:", browserInfo.browser, "on", browserInfo.platform);
    window.__FARMVAULT_INSTALL_MODE__ = false;
    setState("unsupported");
    pwaInstallInitRan = true;
    return;
  }

  pwaInstallInitRan = true;

  const handleBeforeInstallPrompt = (event: Event) => {
    log("=== beforeinstallprompt EVENT FIRED ===");
    event.preventDefault(); // Prevent browser mini-infobar; keep install for our button
    deferredPrompt = event as BeforeInstallPromptEvent;
    log("Deferred prompt stored; prompt() callable:", typeof deferredPrompt.prompt === "function");
    setState("available");

    // Auto-trigger install when redirected from marketing site with ?install=true
    const params = new URLSearchParams(window.location.search);
    if (params.get("install") === "true") {
      log("?install=true detected — auto-triggering install prompt");
      // Remove the param before prompting so it doesn't re-trigger on back navigation
      params.delete("install");
      const newSearch = params.toString();
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + (newSearch ? `?${newSearch}` : ""),
      );
      // Keep __FARMVAULT_INSTALL_MODE__ = true while the native dialog is open so
      // DomainGuard does not navigate the page away underneath the dialog.
      // Clear it only after the dialog resolves (accepted or dismissed).
      void (async () => {
        await promptInstall();
        window.__FARMVAULT_INSTALL_MODE__ = false;
        log("Install prompt handled — install mode cleared");
      })();
    }
  };

  const handleAppInstalled = () => {
    log("=== appinstalled EVENT FIRED ===");
    deferredPrompt = null;
    setState("installed");
  };

  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  const handleDisplayModeChange = (e: MediaQueryListEvent) => {
    if (e.matches) {
      deferredPrompt = null;
      setState("installed");
    }
  };

  // Register as early as possible so we never miss beforeinstallprompt
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  mediaQuery.addEventListener("change", handleDisplayModeChange);

  log("beforeinstallprompt listener registered (install UI will call prompt() + userChoice)");

  setTimeout(() => {
    if (installState === "idle" && !deferredPrompt) {
      log("=== TIMEOUT: No beforeinstallprompt after 10s (manifest / SW / HTTPS) ===");
      // Clear install mode so DomainGuard can resume normal routing.
      window.__FARMVAULT_INSTALL_MODE__ = false;
      setState("unavailable");
    } else if (deferredPrompt) {
      log("beforeinstallprompt captured — native install ready");
    }
  }, 10_000);
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
 * @deprecated Prefer {@link initPwaInstall} on startup so `beforeinstallprompt` is not missed.
 */
export function schedulePwaInstallDeferred(): void {
  if (typeof window === "undefined") return;
  queueMicrotask(() => {
    try {
      initPwaInstall();
    } catch (error) {
      console.warn("PWA init skipped:", error);
    }
  });
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
 * True when we captured `beforeinstallprompt` and can call `prompt()`.
 */
export function canInstall(): boolean {
  const hasPrompt = deferredPrompt !== null;
  const canTrigger =
    hasPrompt && installState !== "installed" && installState !== "prompting";
  log("canInstall check:", { hasPrompt, installState, canTrigger });
  return canTrigger;
}

/**
 * True when the browser did not give us a deferred install event (manual steps only).
 * Hidden whenever native prompt is available (`deferredPrompt` set).
 */
export function needsFallback(): boolean {
  if (getIsStandalone()) return false;
  if (deferredPrompt !== null) return false;
  const needs = installState === "unsupported" || installState === "unavailable";
  log("needsFallback check:", { installState, needs });
  return needs;
}

/**
 * Wait until `beforeinstallprompt` is captured (e.g. user tapped Install before SW/manifest finished).
 */
export function waitForDeferredPrompt(maxMs: number): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (deferredPrompt) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (deferredPrompt) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= maxMs) {
        resolve(false);
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
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
