import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePostHog } from '@posthog/react';

/**
 * SPA route changes → PostHog `$pageview`.
 * Must render inside `BrowserRouter` and `@posthog/react` `PostHogProvider` (see `PosthogAnalyticsInner`).
 */
export function usePosthogPageTracking(): void {
  const location = useLocation();
  const posthog = usePostHog();
  const lastPath = useRef<string>('');

  useEffect(() => {
    if (!posthog?.capture) return;
    const path = `${location.pathname}${location.search}`;
    if (path === lastPath.current) return;
    lastPath.current = path;
    if (typeof window === 'undefined') return;
    posthog.capture('$pageview', {
      $current_url: window.location.href,
    });
  }, [location.pathname, location.search, posthog]);
}
