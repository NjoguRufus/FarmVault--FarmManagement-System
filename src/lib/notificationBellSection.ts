import type { NotificationAudience } from '@/lib/notificationAudience';
import { defaultAudiencesForUnifiedKind } from '@/lib/notificationAudience';
import type { UnifiedNotificationKind } from '@/services/unifiedNotificationTypes';

/** Which portal’s bell should list this notification (route-derived in UI; stored on each row). */
export type NotificationPortalType = 'company' | 'ambassador' | 'developer';

export function notificationPortalFromPathname(pathname: string | null | undefined): NotificationPortalType {
  const p = (pathname ?? '').trim().toLowerCase();
  if (p.startsWith('/ambassador')) return 'ambassador';
  if (p.startsWith('/developer')) return 'developer';
  return 'company';
}

export function notificationPortalForAudiences(aud: readonly NotificationAudience[]): NotificationPortalType {
  const hasAmb = aud.includes('ambassador');
  const hasCo = aud.includes('company');
  const hasSt = aud.includes('staff');
  const hasDev = aud.includes('developer');
  if (hasAmb && !hasCo && !hasSt && !hasDev) return 'ambassador';
  if (hasDev && !hasCo && !hasSt && !hasAmb) return 'developer';
  return 'company';
}

export function notificationPortalForUnifiedKind(
  kind: UnifiedNotificationKind,
  audiences?: NotificationAudience[],
): NotificationPortalType {
  return notificationPortalForAudiences(audiences ?? defaultAudiencesForUnifiedKind(kind));
}

/** Route-based fallback for web push and legacy items. */
export function notificationPortalFromPath(path: string | null | undefined): NotificationPortalType {
  return notificationPortalFromPathname(path);
}
