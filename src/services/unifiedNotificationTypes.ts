/**
 * FarmVault unified notification tiers (priority: lower number = higher priority).
 * Premium > Insights > Activity > Daily
 */
export type UnifiedNotificationTier = 'premium' | 'insights' | 'activity' | 'daily';

export const UNIFIED_TIER_PRIORITY: Record<UnifiedNotificationTier, number> = {
  premium: 1,
  insights: 2,
  activity: 3,
  daily: 4,
};

export type UnifiedNotificationKind =
  | 'daily_morning'
  | 'daily_evening'
  | 'daily_weekly'
  | 'insight_low_inventory'
  | 'insight_expense'
  | 'insight_harvest'
  | 'insight_inactivity'
  | 'insight_crop_stage'
  | 'activity_expense_added'
  | 'activity_inventory_updated'
  | 'activity_harvest_recorded'
  | 'activity_operation_logged'
  | 'activity_task_completed'
  | 'premium_payment'
  | 'premium_subscription'
  | 'premium_trial'
  | 'premium_critical_alert'
  | 'insight_admin_alert'
  | 'system'
  /** Platform developer — new workspace signup (future / edge-triggered). */
  | 'developer_company_signup'
  /** Platform developer — payment / billing signal. */
  | 'developer_payment_received'
  /** Platform developer — infra / system. */
  | 'developer_system_alert'
  /** Platform developer — periodic analytics digest. */
  | 'developer_analytics_digest'
  /** Ambassador program — referred farmer signed up. */
  | 'ambassador_referral_signup'
  /** Ambassador program — commission credited. */
  | 'ambassador_commission_earned'
  /** Ambassador program — referred company paid subscription. */
  | 'ambassador_subscription_paid'
  /** Ambassador program — payout processed. */
  | 'ambassador_payout'
  /** Staff — assigned work / instructions (task-focused). */
  | 'staff_work_assigned'
  | 'staff_task_reminder'
  | 'staff_farm_instruction';
