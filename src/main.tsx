import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
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

if (shouldRenderApp) {
  createRoot(document.getElementById("root")!).render(<App />);
}
