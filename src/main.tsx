import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { ClerkProvider } from "@clerk/react";
import App from "./App.tsx";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClerkAuthBridge } from "@/components/auth/ClerkAuthBridge";
import { ClerkLoadErrorBoundary } from "@/components/auth/ClerkLoadErrorBoundary";
import "./index.css";

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

if (!pk && !emergencyAccess) {
  throw new Error(
    "Missing Clerk configuration. Set VITE_CLERK_PUBLISHABLE_KEY in your environment, or enable VITE_EMERGENCY_ACCESS for fallback.",
  );
}

if (shouldRenderApp) {
  const root = document.getElementById("root")!;
  try {
    if (pk) {
      createRoot(root).render(
        <ClerkLoadErrorBoundary>
          <ClerkProvider publishableKey={pk} afterSignOutUrl="/">
            <ClerkAuthBridge />
          </ClerkProvider>
        </ClerkLoadErrorBoundary>,
      );
    } else {
      createRoot(root).render(
        <AuthProvider clerkState={null}>
          <App />
        </AuthProvider>,
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