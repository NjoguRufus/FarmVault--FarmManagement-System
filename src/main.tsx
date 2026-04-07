import type { ReactElement } from "react";
import "./chromium-metrics-shim";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { ClerkProvider } from "@clerk/react";
import { PostHogProvider } from "@posthog/react";
import App from "./App.tsx";
import { AuthProvider } from "@/contexts/AuthContext";
import { AmbassadorAccessProvider } from "@/contexts/AmbassadorAccessContext";
import { ClerkAuthBridge } from "@/components/auth/ClerkAuthBridge";
import { ClerkLoadErrorBoundary } from "@/components/auth/ClerkLoadErrorBoundary";
import { schedulePwaInstallDeferred } from "@/lib/pwa-install";
import { migrateQuickUnlockState } from "@/services/appLockService";
import { getPosthogProjectToken, getPosthogClientOptions } from "@/lib/analytics/posthog";
import { getAppEntryUrl } from "@/lib/urls/domains";
import { initServiceWorkerPushFeedback } from "@/lib/pushNotificationFeedback";
import "./index.css";

initServiceWorkerPushFeedback();

// Defer PWA install listeners until after load so sign-up / Clerk are not affected by the same early errors.
schedulePwaInstallDeferred();

// Migrate/reset Quick Unlock state to fix broken states from previous versions
// This clears stale localStorage data that causes PIN screen to appear without proper setup
migrateQuickUnlockState();

const DEV_SW_RESET_MARKER = "__farmvault_dev_sw_reset__";
let shouldRenderApp = true;

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    // Flush stale SW and caches once in dev to avoid mixed old/new chunk execution.
    let alreadyReset = false;
    try {
      alreadyReset = window.sessionStorage.getItem(DEV_SW_RESET_MARKER) === "1";
    } catch {
      alreadyReset = true;
    }
    if (!alreadyReset) {
      shouldRenderApp = false;
      try {
        window.sessionStorage.setItem(DEV_SW_RESET_MARKER, "1");
      } catch {
        // If sessionStorage is unavailable, skip one-time reload behavior.
        shouldRenderApp = true;
      }

      const unregisterPromise = navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        );

      const clearCachesPromise =
        "caches" in window
          ? caches
              .keys()
              .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          : Promise.resolve();

      void Promise.all([unregisterPromise, clearCachesPromise]).finally(() => {
        if (!shouldRenderApp) {
          window.location.reload();
        }
      });
    } else {
      try {
        window.sessionStorage.removeItem(DEV_SW_RESET_MARKER);
      } catch {
        // No-op when sessionStorage is unavailable.
      }
    }
  } else {
    registerSW({
      immediate: true,
      onRegisterError(error) {
        console.error("[PWA] Service worker registration failed:", error);
      },
    });
  }
}

// Use only env; no custom Clerk JS host or domain overrides (avoids CORS/origin issues).
const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const emergencyAccess = import.meta.env.VITE_EMERGENCY_ACCESS === "true" || import.meta.env.VITE_EMERGENCY_ACCESS === "1";

// Runtime diagnostic logs for Clerk configuration (helps debug dev vs live instance issues)
if (pk) {
  const keyPrefix = pk.substring(0, 7); // pk_test or pk_live
  const isLiveKey = pk.startsWith('pk_live_');
  const isTestKey = pk.startsWith('pk_test_');
  
  // Decode the base64 portion to extract the Clerk frontend API domain
  let clerkDomain = 'unknown';
  try {
    const base64Part = pk.replace('pk_test_', '').replace('pk_live_', '');
    const decoded = atob(base64Part);
    clerkDomain = decoded.replace(/\$$/, ''); // Remove trailing $ if present
  } catch {
    clerkDomain = 'could not decode';
  }

  console.log(`[Clerk Config] Key prefix: ${keyPrefix}, Live: ${isLiveKey}, Test: ${isTestKey}`);
  console.log(`[Clerk Config] Frontend API domain: ${clerkDomain}`);

  if (isTestKey && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    console.warn('[Clerk Config] ⚠️ USING TEST KEY IN NON-LOCALHOST ENVIRONMENT! Production should use pk_live_');
  }
}

if (!pk && !emergencyAccess) {
  throw new Error(
    "Missing Clerk configuration. Set VITE_CLERK_PUBLISHABLE_KEY in your environment, or enable VITE_EMERGENCY_ACCESS for fallback.",
  );
}

if (shouldRenderApp) {
  const root = document.getElementById("root")!;
  // PostHog: set VITE_PUBLIC_POSTHOG_PROJECT_TOKEN (+ optional VITE_PUBLIC_POSTHOG_HOST) in .env — restart `npm run dev` after changes.
  const posthogKey = getPosthogProjectToken();

  const wrapPostHog = (node: ReactElement) =>
    posthogKey ? (
      <PostHogProvider apiKey={posthogKey} options={getPosthogClientOptions()}>
        {node}
      </PostHogProvider>
    ) : (
      node
    );

  try {
    if (pk) {
      // Clerk Dashboard → configure allowed redirect URLs for each deployment origin, e.g.:
      //   https://app.example.com/auth/callback
      //   https://app.example.com/auth/continue
      // Dev: http://localhost:5173/auth/callback (and /auth/continue if used)
      const afterSignInUrl = getAppEntryUrl("/auth/callback");
      const afterSignUpUrl = getAppEntryUrl("/auth/callback");
      createRoot(root).render(
        wrapPostHog(
          <ClerkLoadErrorBoundary>
            <ClerkProvider
              publishableKey={pk}
              signInUrl="/sign-in"
              signUpUrl="/sign-up"
              afterSignInUrl={afterSignInUrl}
              afterSignUpUrl={afterSignUpUrl}
              afterSignOutUrl="/"
            >
              <ClerkAuthBridge />
            </ClerkProvider>
          </ClerkLoadErrorBoundary>,
        ),
      );
    } else {
      createRoot(root).render(
        wrapPostHog(
          <AmbassadorAccessProvider>
            <AuthProvider clerkState={null}>
              <App />
            </AuthProvider>
          </AmbassadorAccessProvider>,
        ),
      );
    }
  } catch (error) {
    console.error("[Clerk Load Failure]", error);
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:1rem;font-family:system-ui;text-align:center;">
        <h1 style="font-size:1.25rem;margin-bottom:0.5rem;">Authentication service temporarily unavailable.</h1>
        <p style="color:#666;margin-bottom:1rem;">Sign-in could not load. Use emergency access to continue.</p>
        <a href="/emergency-access" style="background:#0d9488;color:#fff;padding:0.5rem 1rem;border-radius:0.375rem;text-decoration:none;">Use emergency access</a>
      </div>
    `;
  }
}