import { dispatchUnifiedNotificationNow } from '@/services/unifiedNotificationPipeline';

export function notifyDeveloperNewCompanySignup(companyName: string): void {
  dispatchUnifiedNotificationNow({
    tier: 'insights',
    kind: 'developer_company_signup',
    title: 'New company signup',
    body: `${companyName} completed onboarding.`,
    path: '/admin/companies',
    toastType: 'info',
    audiences: ['developer'],
  });
}

export function notifyDeveloperPayment(body: string): void {
  dispatchUnifiedNotificationNow({
    tier: 'premium',
    kind: 'developer_payment_received',
    title: 'Payment activity',
    body,
    path: '/admin/billing',
    toastType: 'success',
    audiences: ['developer'],
  });
}

export function notifyDeveloperSystemAlert(body: string, path = '/developer'): void {
  dispatchUnifiedNotificationNow({
    tier: 'premium',
    kind: 'developer_system_alert',
    title: 'System alert',
    body,
    path,
    toastType: 'warning',
    audiences: ['developer'],
  });
}

export function notifyDeveloperAnalyticsDigest(body: string): void {
  dispatchUnifiedNotificationNow({
    tier: 'daily',
    kind: 'developer_analytics_digest',
    title: 'Analytics snapshot',
    body,
    path: '/admin/analytics/subscriptions',
    toastType: 'info',
    audiences: ['developer'],
  });
}
