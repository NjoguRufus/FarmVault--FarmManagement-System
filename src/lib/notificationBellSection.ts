import type { NotificationAudience } from '@/lib/notificationAudience';
import { defaultAudiencesForUnifiedKind } from '@/lib/notificationAudience';
import type { UnifiedNotificationKind } from '@/services/unifiedNotificationTypes';

/** Where the item appears in the navbar bell (workspace = farm/company/staff/developer; ambassador = program-only). */
export type NotificationBellSection = 'workspace' | 'ambassador';

export function bellSectionForAudiences(aud: readonly NotificationAudience[]): NotificationBellSection {
  const hasAmb = aud.includes('ambassador');
  const hasCo = aud.includes('company');
  const hasSt = aud.includes('staff');
  const hasDev = aud.includes('developer');
  if (hasAmb && !hasCo && !hasSt && !hasDev) return 'ambassador';
  return 'workspace';
}

export function bellSectionForUnifiedKind(
  kind: UnifiedNotificationKind,
  audiences?: NotificationAudience[],
): NotificationBellSection {
  return bellSectionForAudiences(audiences ?? defaultAudiencesForUnifiedKind(kind));
}

/** Route-based fallback for web push and legacy items. */
export function bellSectionFromPath(path: string | null | undefined): NotificationBellSection {
  const p = (path ?? '').trim().toLowerCase();
  if (p.startsWith('/ambassador')) return 'ambassador';
  return 'workspace';
}
