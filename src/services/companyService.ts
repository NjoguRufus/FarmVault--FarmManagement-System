import { addDoc, collection, doc, getDoc, getDocs, query, where, serverTimestamp, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type SubscriptionPlan = 'trial' | 'basic' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'expired' | 'grace' | 'paused';

export interface CompanySubscriptionOverride {
  enabled: boolean;
  type?: 'full_free' | 'extended_trial' | 'custom';
  overrideEndsAt?: Timestamp | null;
  reason?: string | null;
  grantedBy?: string;
  grantedAt?: Timestamp;
}

export interface CompanySubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialStartAt?: Timestamp;
  trialEndsAt?: Timestamp;
  paidUntil?: Timestamp | null;
  billingMode?: PaymentMode;
  override?: CompanySubscriptionOverride;
}

export interface CompanyDoc {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  plan?: string;
  userCount?: number;
  projectCount?: number;
  revenue?: number;
  createdAt?: unknown;
  nextPaymentAt?: Timestamp | null;
  paymentReminderActive?: boolean;
  paymentReminderSetAt?: Timestamp | null;
  paymentReminderDismissedAt?: Timestamp | null;
  paymentReminderDismissedBy?: string | null;
  subscriptionPlan?: string;
  subscription?: CompanySubscription;
  [key: string]: unknown;
}

export async function getCompany(companyId: string): Promise<CompanyDoc | null> {
  const snap = await getDoc(doc(db, 'companies', companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CompanyDoc;
}

/** List all companies (developer use, e.g. share records). */
export async function listCompanies(): Promise<{ id: string; name: string }[]> {
  const snap = await getDocs(collection(db, 'companies'));
  return snap.docs.map((d) => ({
    id: d.id,
    name: String((d.data() as { name?: string }).name ?? d.id),
  }));
}

export async function setPaymentReminder(companyId: string, nextPaymentAt?: Date): Promise<void> {
  const ref = doc(db, 'companies', companyId);
  await updateDoc(ref, {
    paymentReminderActive: true,
    paymentReminderSetAt: serverTimestamp(),
    ...(nextPaymentAt && { nextPaymentAt: Timestamp.fromDate(nextPaymentAt) }),
  });
}

export async function clearPaymentReminder(companyId: string, dismissedByUserId?: string): Promise<void> {
  const updates: Record<string, unknown> = { paymentReminderActive: false };
  if (dismissedByUserId) {
    updates.paymentReminderDismissedAt = serverTimestamp();
    updates.paymentReminderDismissedBy = dismissedByUserId;
  }
  await updateDoc(doc(db, 'companies', companyId), updates);
}

export async function setCompanyNextPayment(companyId: string, nextPaymentAt: Date): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId), {
    nextPaymentAt: Timestamp.fromDate(nextPaymentAt),
  });
}

export async function updateCompany(
  companyId: string,
  data: {
    name?: string;
    email?: string;
    plan?: string;
    status?: string;
    customWorkTypes?: string[];
  }
): Promise<void> {
  const ref = doc(db, 'companies', companyId);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.plan !== undefined) updates.plan = data.plan;
  if (data.status !== undefined) updates.status = data.status;
  if (data.customWorkTypes !== undefined) updates.customWorkTypes = data.customWorkTypes;
  if (Object.keys(updates).length === 0) return;
  await updateDoc(ref, updates);
}

export async function createCompany(
  name: string,
  companyEmail: string,
  plan: string = 'starter',
): Promise<string> {
  const now = Timestamp.now();
  const trialEndsAt = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);

  const ref = await addDoc(collection(db, 'companies'), {
    name,
    email: companyEmail,
    createdAt: serverTimestamp(),
    status: 'active',
    subscriptionPlan: 'trial',
    plan: ['starter', 'professional', 'enterprise'].includes(plan) ? plan : 'starter',
    userCount: 1,
    projectCount: 0,
    revenue: 0,
    subscription: {
      plan: 'trial',
      status: 'active',
      trialStartAt: now,
      trialEndsAt,
      paidUntil: null,
      billingMode: 'monthly' as PaymentMode,
      override: {
        enabled: false,
        type: 'custom',
        overrideEndsAt: null,
        reason: null,
        grantedBy: '',
        grantedAt: now,
      },
    } as CompanySubscription,
  });
  return ref.id;
}

export async function setCompanySubscriptionOverride(
  companyId: string,
  override: CompanySubscriptionOverride | null,
): Promise<void> {
  const ref = doc(db, 'companies', companyId);
  if (override === null) {
    await updateDoc(ref, {
      'subscription.override': {
        enabled: false,
        type: 'custom',
        overrideEndsAt: null,
        reason: null,
        grantedBy: null,
        grantedAt: serverTimestamp(),
      },
    });
    return;
  }

  await updateDoc(ref, {
    'subscription.override': {
      ...override,
      grantedAt: override.grantedAt ?? serverTimestamp(),
    },
  });
}

export type PaymentMode = 'monthly' | 'seasonal' | 'annual';

export async function setCompanyPaidPlan(
  companyId: string,
  plan: Exclude<SubscriptionPlan, 'trial'>,
  mode: PaymentMode,
): Promise<void> {
  const ref = doc(db, 'companies', companyId);
  const now = Timestamp.now();

  const daysByMode: Record<PaymentMode, number> = {
    monthly: 30,
    seasonal: 120,
    annual: 365,
  };

  const durationDays = daysByMode[mode] ?? 30;
  const paidUntil = Timestamp.fromMillis(now.toMillis() + durationDays * 24 * 60 * 60 * 1000);

  const legacyPlan =
    plan === 'basic'
      ? 'starter'
      : plan === 'pro'
        ? 'professional'
        : 'enterprise';

  await updateDoc(ref, {
    plan: legacyPlan,
    subscriptionPlan: plan,
    'subscription.plan': plan,
    'subscription.status': 'active',
    'subscription.billingMode': mode,
    'subscription.paidUntil': paidUntil,
  });
}

/** Write users/{uid} with role company-admin and companyId. Must use auth uid as doc id. */
export async function createCompanyUserProfile(params: {
  uid: string;
  companyId: string;
  name: string;
  email: string;
}) {
  const { uid, companyId, name, email } = params;
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, {
    id: uid,
    companyId,
    name,
    email,
    role: 'company-admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

