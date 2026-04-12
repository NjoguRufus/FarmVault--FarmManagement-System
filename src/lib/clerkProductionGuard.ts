/**
 * Warn when a Clerk *test* publishable key is used on a non-local host (production misconfiguration).
 * Call once at app bootstrap after reading `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`.
 */
export function logClerkProductionWarnings(): void {
  if (typeof window === 'undefined') return;
  const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!pk || typeof pk !== 'string') return;

  const isTestKey = pk.startsWith('pk_test_');
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  if (isTestKey && !isLocal) {
    console.warn(
      '[Clerk] Test publishable key (pk_test_) on non-localhost host. Production must use pk_live_ from the Clerk production instance.',
    );
  }

  if (import.meta.env.PROD && isTestKey) {
    console.warn('[Clerk] PROD build with pk_test_ — set VITE_CLERK_PUBLISHABLE_KEY to pk_live_* before launch.');
  }
}
