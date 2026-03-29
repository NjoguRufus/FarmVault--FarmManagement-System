import React from 'react';
import { isPosthogEnabled } from '@/lib/analytics/posthog';
import { usePosthogPageTracking } from '@/hooks/usePosthogPageTracking';
import { usePosthogIdentify } from '@/hooks/usePosthogIdentify';

/**
 * Runs PostHog hooks only when the project token is set (parent must wrap the app with `PostHogProvider` in main.tsx).
 */
function PosthogAnalyticsInner() {
  usePosthogPageTracking();
  usePosthogIdentify();
  return null;
}

export function PosthogAnalytics() {
  if (!isPosthogEnabled()) return null;
  return <PosthogAnalyticsInner />;
}
