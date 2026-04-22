/**
 * Development console output.
 * - `log` / `warn`: normal dev messages.
 * - `debug`: verbose diagnostics (auth tokens, nav, layout, polling). Off by default.
 *   Enable: set `VITE_DEBUG_LOGS=true` in `.env`, or in the browser console:
 *   `localStorage.setItem('fv_debug_logs', '1')` then reload.
 */
function isVerboseDebugEnabled(): boolean {
  if (import.meta.env.PROD) return false;
  if (import.meta.env.VITE_DEBUG_LOGS === 'true') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('fv_debug_logs') === '1';
  } catch {
    return false;
  }
}

export const logger = {
  log: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },

  /** Verbose tracing (Clerk/Supabase token flow, nav, responsive, admin alert polling, app lock). */
  debug: (...args: unknown[]) => {
    if (isVerboseDebugEnabled()) {
      console.log(...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => console.error(...args),
};
