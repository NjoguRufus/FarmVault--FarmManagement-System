/**
 * @deprecated Prefer `@/lib/analytics/posthog` — kept for existing imports.
 */
export {
  getPosthogProjectToken,
  getPosthogPublicKey,
  getPosthogHost,
  isPosthogEnabled,
  isPosthogEnabled as isPosthogConfigured,
  getPosthogClientOptions,
} from '@/lib/analytics/posthog';

export function isPosthogSessionReplayEnabled(): boolean {
  const v = import.meta.env.VITE_PUBLIC_POSTHOG_SESSION_REPLAY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
