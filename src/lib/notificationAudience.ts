import type { User } from '@/types';
import type { UnifiedNotificationKind } from '@/services/unifiedNotificationTypes';

/**
 * Logical audiences for FarmVault notifications (maps to product roles).
 * - developer: platform team
 * - company: farm/workspace operators (admin, manager, broker)
 * - ambassador: ambassador program (profile user_type ambassador | both)
 * - staff: company employees (field/staff shell)
 */
export type NotificationAudience = 'developer' | 'company' | 'ambassador' | 'staff';

function norm(s: string | null | undefined): string {
  return (s ?? '').toString().trim().toLowerCase();
}

/**
 * Which audiences the signed-in user belongs to for notification routing.
 * Company + ambassador (both) yields both `company` and `ambassador` when applicable.
 */
export function resolveUserNotificationAudiences(user: User | null): Set<NotificationAudience> {
  const out = new Set<NotificationAudience>();
  if (!user) return out;

  const role = user.role;
  if (role === 'developer') out.add('developer');

  if (role === 'employee') out.add('staff');

  if (
    user.companyId &&
    (role === 'company-admin' || role === 'manager' || role === 'broker')
  ) {
    out.add('company');
  }

  const ut = norm(user.profileUserType);
  if (ut === 'ambassador' || ut === 'both') {
    out.add('ambassador');
  }

  return out;
}

export function userReceivesAudiences(
  user: User | null,
  audiences: readonly NotificationAudience[],
): boolean {
  if (!user || audiences.length === 0) return false;
  const u = resolveUserNotificationAudiences(user);
  return audiences.some((a) => u.has(a));
}

/**
 * Default routing per unified kind. Callers may override with `audiences` on the payload.
 * Priority tiers are unchanged (premium > insights > activity > daily); this only filters recipients.
 */
export function defaultAudiencesForUnifiedKind(kind: UnifiedNotificationKind): NotificationAudience[] {
  switch (kind) {
    case 'activity_operation_logged':
    case 'activity_task_completed':
    case 'staff_work_assigned':
    case 'staff_task_reminder':
    case 'staff_farm_instruction':
      return ['company', 'staff'];

    case 'insight_admin_alert':
    case 'premium_critical_alert':
      return ['company', 'developer'];

    case 'developer_company_signup':
    case 'developer_payment_received':
    case 'developer_system_alert':
    case 'developer_analytics_digest':
    case 'system':
      return ['developer'];

    case 'ambassador_referral_signup':
    case 'ambassador_commission_earned':
    case 'ambassador_subscription_paid':
    case 'ambassador_payout':
      return ['ambassador'];

    default:
      if (kind.startsWith('daily_')) return ['company'];
      if (kind.startsWith('insight_')) return ['company'];
      if (kind.startsWith('activity_')) return ['company'];
      if (kind.startsWith('premium_')) return ['company'];
      return ['company'];
  }
}
