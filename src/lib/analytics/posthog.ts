import { logger } from "@/lib/logger";
/**
 * PostHog configuration for Vite (browser).
 *
 * Uses import.meta.env only — never process.env.
 * After changing .env, restart the dev server so Vite re-injects env vars.
 *
 * Primary: VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
 * Legacy: VITE_PUBLIC_POSTHOG_KEY (still supported)
 */
import type { PostHogConfig } from 'posthog-js';

export function getPosthogProjectToken(): string {
  const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  if (token) return token;
  return import.meta.env.VITE_PUBLIC_POSTHOG_KEY?.trim() ?? '';
}

/** @deprecated use getPosthogProjectToken */
export function getPosthogPublicKey(): string {
  return getPosthogProjectToken();
}

export function getPosthogHost(): string {
  return import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
}

export function isPosthogEnabled(): boolean {
  return getPosthogProjectToken().length > 0;
}

function isSessionReplayEnabled(): boolean {
  const v = import.meta.env.VITE_PUBLIC_POSTHOG_SESSION_REPLAY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Options passed to PostHogProvider / posthog.init (single init). */
export function getPosthogClientOptions(): Partial<PostHogConfig> {
  const replay = isSessionReplayEnabled();
  return {
    api_host: getPosthogHost(),
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    autocapture: false,
    disable_session_recording: !replay,
    session_recording: replay
      ? {
          maskAllInputs: true,
          maskTextSelector: '[data-ph-mask], .ph-mask',
        }
      : undefined,
    loaded: () => {
      if (import.meta.env.DEV) {
        logger.log('[PostHog] client loaded');
      }
    },
  };
}
