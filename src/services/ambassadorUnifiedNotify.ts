import { dispatchUnifiedNotificationNow } from '@/services/unifiedNotificationPipeline';

/** Referral converted — call from flows that confirm a new farmer under this ambassador. */
export function notifyAmbassadorReferralSignup(displayName?: string): void {
  dispatchUnifiedNotificationNow({
    tier: 'insights',
    kind: 'ambassador_referral_signup',
    title: 'New referral signup',
    body: displayName
      ? `${displayName} joined FarmVault with your link.`
      : 'A farmer signed up using your referral link.',
    path: '/ambassador/console/referrals',
    toastType: 'success',
    audiences: ['ambassador'],
  });
}

export function notifyAmbassadorCommissionEarned(amountLabel: string, detail?: string): void {
  dispatchUnifiedNotificationNow({
    tier: 'insights',
    kind: 'ambassador_commission_earned',
    title: 'Commission earned',
    body: detail ? `${amountLabel} — ${detail}` : amountLabel,
    path: '/ambassador/console/earnings',
    toastType: 'success',
    audiences: ['ambassador'],
  });
}

export function notifyAmbassadorSubscriptionPaid(companyName?: string): void {
  dispatchUnifiedNotificationNow({
    tier: 'premium',
    kind: 'ambassador_subscription_paid',
    title: 'Subscription payment',
    body: companyName
      ? `${companyName} completed a subscription payment on your referral.`
      : 'A referred workspace completed a subscription payment.',
    path: '/ambassador/console/earnings',
    toastType: 'success',
    audiences: ['ambassador'],
  });
}

export function notifyAmbassadorPayout(body: string): void {
  dispatchUnifiedNotificationNow({
    tier: 'premium',
    kind: 'ambassador_payout',
    title: 'Payout update',
    body,
    path: '/ambassador/console/earnings',
    toastType: 'info',
    audiences: ['ambassador'],
  });
}
