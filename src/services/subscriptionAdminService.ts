import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from '@/lib/documentLayer';
import { auth, db } from '@/lib/documentLayer';
import {
  type PaymentMode,
  type SubscriptionPlan,
  setCompanySubscriptionOverride,
} from '@/services/companyService';

export type CompanySubscriptionStatus = 'trial' | 'active' | 'expired' | 'override' | 'pending';

export interface CompanySubscriptionOverrideRecord {
  enabled: boolean;
  type?: 'full_free' | 'timed_free';
  startAt?: Timestamp | null;
  endAt?: Timestamp | null;
  note?: string | null;
  grantedByUid?: string | null;
}

export interface CompanySubscriptionRecord {
  companyId: string;
  planId?: Exclude<SubscriptionPlan, 'trial'>;
  planName?: string;
  billingMode?: PaymentMode;
  status: CompanySubscriptionStatus;
  trialStartedAt?: Timestamp | null;
  trialEndsAt?: Timestamp | null;
  currentPeriodStart?: Timestamp | null;
  currentPeriodEnd?: Timestamp | null;
  lastPaymentId?: string | null;
  updatedAt?: Timestamp | null;
  updatedByUid?: string | null;
  override?: CompanySubscriptionOverrideRecord;
}

export type DeveloperActionType =
  | 'APPROVE_PAYMENT'
  | 'REJECT_PAYMENT'
  | 'GRANT_OVERRIDE'
  | 'REMOVE_OVERRIDE';

export interface DeveloperActionLogEntry {
  type: DeveloperActionType;
  companyId: string;
  paymentId?: string | null;
  meta?: Record<string, unknown>;
  createdAt: unknown;
  createdByUid: string;
}

export async function logDeveloperAction(params: {
  type: DeveloperActionType;
  companyId: string;
  paymentId?: string | null;
  meta?: Record<string, unknown>;
}) {
  const { type, companyId, paymentId = null, meta = {} } = params;
  const createdByUid = auth.currentUser?.uid;
  if (!createdByUid) {
    return;
  }

  await addDoc(collection(db, 'developerActionsLog'), {
    type,
    companyId,
    paymentId,
    meta,
    createdAt: serverTimestamp(),
    createdByUid,
  } satisfies DeveloperActionLogEntry);
}

export async function getCompanySubscription(
  companyId: string,
): Promise<CompanySubscriptionRecord | null> {
  const ref = doc(db, 'companySubscriptions', companyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { companyId, ...(snap.data() as Omit<CompanySubscriptionRecord, 'companyId'>) };
}

export async function grantSubscriptionOverride(params: {
  companyId: string;
  type: 'full_free' | 'timed_free';
  durationDays: number;
  note?: string | null;
}) {
  const { companyId, type, durationDays, note = null } = params;
  const reviewerUid = auth.currentUser?.uid ?? null;
  const now = Timestamp.now();
  const endAt = Timestamp.fromMillis(
    now.toMillis() + durationDays * 24 * 60 * 60 * 1000,
  );

  const override: CompanySubscriptionOverrideRecord = {
    enabled: true,
    type,
    startAt: now,
    endAt,
    note,
    grantedByUid: reviewerUid,
  };

  await setDoc(
    doc(db, 'companySubscriptions', companyId),
    {
      companyId,
      status: 'override' as CompanySubscriptionStatus,
      override,
      updatedAt: serverTimestamp(),
      updatedByUid: reviewerUid,
    } satisfies Partial<CompanySubscriptionRecord>,
    { merge: true },
  );

  // Keep embedded subscription override in sync for useSubscriptionStatus()
  await setCompanySubscriptionOverride(companyId, {
    enabled: true,
    type: type === 'full_free' ? 'full_free' : 'custom',
    overrideEndsAt: endAt,
    reason: note,
    grantedBy: reviewerUid ?? undefined,
    grantedAt: now,
  });

  await logDeveloperAction({
    type: 'GRANT_OVERRIDE',
    companyId,
    paymentId: null,
    meta: { type, durationDays, note },
  });
}

export async function removeSubscriptionOverride(companyId: string) {
  const reviewerUid = auth.currentUser?.uid ?? null;
  const ref = doc(db, 'companySubscriptions', companyId);
  const snap = await getDoc(ref);
  const data = (snap.exists() ? (snap.data() as CompanySubscriptionRecord) : null) ?? null;

  const now = Timestamp.now();
  let nextStatus: CompanySubscriptionStatus = 'expired';
  const currentEnd = data?.currentPeriodEnd;
  if (currentEnd && currentEnd.toMillis() > now.toMillis()) {
    nextStatus = 'active';
  }

  await setDoc(
    ref,
    {
      status: nextStatus,
      override: {
        ...(data?.override ?? {}),
        enabled: false,
      },
      updatedAt: serverTimestamp(),
      updatedByUid: reviewerUid,
    } satisfies Partial<CompanySubscriptionRecord>,
    { merge: true },
  );

  await setCompanySubscriptionOverride(companyId, null);

  await logDeveloperAction({
    type: 'REMOVE_OVERRIDE',
    companyId,
    paymentId: null,
    meta: {},
  });
}

