/**
 * Chromium / DevTools sometimes expose `window.__chromium_devtools_metrics_reporter`
 * as a non-callable value; code that invokes it then throws and can break the app
 * (e.g. sign-up). Normalize to a no-op unless it is already a function.
 */
type ChromiumMetricsWindow = Window & {
  __chromium_devtools_metrics_reporter?: unknown;
};

export function ensureChromiumDevtoolsMetricsReporterShim(): void {
  if (typeof window === "undefined") return;
  const w = window as ChromiumMetricsWindow;
  if (typeof w.__chromium_devtools_metrics_reporter !== "function") {
    w.__chromium_devtools_metrics_reporter = function chromiumDevtoolsMetricsReporterNoop() {};
  }
}

/** Optional invoke — only runs when the global is a real function (e.g. real DevTools hook). */
export function callChromiumDevtoolsMetricsReporterIfAvailable(): void {
  if (typeof window === "undefined") return;
  const w = window as ChromiumMetricsWindow;
  if (typeof w.__chromium_devtools_metrics_reporter === "function") {
    (w.__chromium_devtools_metrics_reporter as () => void)();
  }
}

ensureChromiumDevtoolsMetricsReporterShim();
