import { addDoc, collection, doc, getDoc, query, where, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from '@/lib/firestore-stub';
import { auth, db } from '@/lib/firebase';
import {
  type SubscriptionPlan,
  type PaymentMode,
  setCompanyPaidPlan,
} from '@/services/companyService';
import { logDeveloperAction } from '@/services/subscriptionAdminService';

export type SubscriptionPaymentStatus = 'pending' | 'approved' | 'rejected';

export interface SubscriptionPaymentDoc {
  id?: string;
  companyId: string;
  companyName: string;
  plan: Exclude<SubscriptionPlan, 'trial'>;
  mode: PaymentMode;
  amount: number;
  mpesaName: string;
  phone: string;
  transactionCode: string;
  status: SubscriptionPaymentStatus;
  createdAt: unknown;
  approvedAt?: unknown;
  rejectedAt?: unknown;
  // Extended admin billing fields (for landing/admin consistency)
  planId?: string;
  planName?: string;
  billingMode?: PaymentMode;
  currency?: string;
  paymentMethod?: string;
  mpesaPayerName?: string;
  mpesaPhone?: string;
  mpesaReceipt?: string;
  createdByUid?: string;
  reviewedAt?: unknown;
  reviewedByUid?: string;
  reviewNote?: string;
}

export async function createSubscriptionPayment(params: {
  companyId: string;
  companyName?: string | null;
  plan: Exclude<SubscriptionPlan, 'trial'>;
  mode: PaymentMode;
  amount: number;
  mpesaName: string;
  phone: string;
  transactionCode: string;
}) {
  const {
    companyId,
    companyName,
    plan,
    mode,
    amount,
    mpesaName,
    phone,
    transactionCode,
  } = params;

  const nameToStore = companyName || companyId;
  const currentUserId = auth.currentUser?.uid ?? null;
  const planId = plan;
  const planName =
    plan === 'basic' ? 'Basic' : plan === 'pro' ? 'Pro' : 'Enterprise';

  // Prevent duplicate pending submissions within 30 minutes
  const now = Timestamp.now();
  const cutoff = Timestamp.fromMillis(now.toMillis() - 30 * 60 * 1000);
  const recentPendingSnap = await getDocs(
    query(
      collection(db, 'subscriptionPayments'),
      where('companyId', '==', companyId),
      where('status', '==', 'pending'),
      where('createdAt', '>=', cutoff),
    ),
  );
  if (!recentPendingSnap.empty) {
    throw new Error(
      'You already submitted a payment recently. Please wait 30 minutes before submitting again.',
    );
  }

  await addDoc(collection(db, 'subscriptionPayments'), {
    companyId,
    companyName: nameToStore,
    plan,
    mode,
    amount,
    mpesaName,
    phone,
    transactionCode,
    // New normalized fields for admin billing
    planId,
    planName,
    billingMode: mode,
    currency: 'KES',
    paymentMethod: 'mpesa_manual',
    mpesaPayerName: mpesaName,
    mpesaPhone: phone,
    mpesaReceipt: transactionCode,
    createdByUid: currentUserId,
    status: 'pending' as SubscriptionPaymentStatus,
    createdAt: serverTimestamp(),
  });

  const companyRef = doc(db, 'companies', companyId);
  const companySnap = await getDoc(companyRef);
  const existing = companySnap.exists() ? companySnap.data() : {};
  const existingSubscription = (existing.subscription && typeof existing.subscription === 'object')
    ? { ...existing.subscription }
    : {};
  await setDoc(
    companyRef,
    {
      subscription: {
        ...existingSubscription,
        status: 'pending_payment',
      },
    },
    { merge: true },
  );
}

export async function approveSubscriptionPayment(
  payment: SubscriptionPaymentDoc & { id: string },
  reviewNote?: string,
) {
  const reviewerUid = auth.currentUser?.uid ?? null;
  const planId = ((payment.planId as Exclude<SubscriptionPlan, 'trial'>) ?? payment.plan) as Exclude<SubscriptionPlan, 'trial'>;
  const mode = (payment.billingMode ?? payment.mode) as PaymentMode;
  const planName =
    payment.planName ||
    (planId === 'basic' ? 'Basic' : planId === 'pro' ? 'Pro' : 'Enterprise');
  const now = Timestamp.now();
  const daysByMode: Record<PaymentMode, number> = {
    monthly: 30,
    seasonal: 120,
    annual: 365,
  };
  const durationDays = daysByMode[mode] ?? 30;
  const periodEnd = Timestamp.fromMillis(
    now.toMillis() + durationDays * 24 * 60 * 60 * 1000,
  );

  // Detect first-ever approved payment for this company for conversion metrics
  let isFirstPayment = false;
  const existingApprovedSnap = await getDocs(
    query(
      collection(db, 'subscriptionPayments'),
      where('companyId', '==', payment.companyId),
      where('status', '==', 'approved'),
    ),
  );
  if (existingApprovedSnap.empty) {
    isFirstPayment = true;
  }

  await setCompanyPaidPlan(payment.companyId, planId, mode);

  // Upsert companySubscriptions/{companyId} for admin billing view
  await setDoc(
    doc(db, 'companySubscriptions', payment.companyId),
    {
      companyId: payment.companyId,
      planId,
      planName,
      billingMode: mode,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      lastPaymentId: payment.id,
      updatedAt: serverTimestamp(),
      updatedByUid: reviewerUid,
    },
    { merge: true },
  );

  await updateDoc(doc(db, 'subscriptionPayments', payment.id), {
    status: 'approved',
    approvedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    reviewedByUid: reviewerUid,
    reviewNote: reviewNote ?? null,
    ...(isFirstPayment ? { isFirstPayment: true } : {}),
  });

  await logDeveloperAction({
    type: 'APPROVE_PAYMENT',
    companyId: payment.companyId,
    paymentId: payment.id,
    meta: {
      planId,
      planName,
      billingMode: mode,
      amount: payment.amount,
      reviewNote: reviewNote ?? null,
    },
  });
}

export async function rejectSubscriptionPayment(paymentId: string, reviewNote?: string) {
  const reviewerUid = auth.currentUser?.uid ?? null;
  const paymentRef = doc(db, 'subscriptionPayments', paymentId);
  await updateDoc(paymentRef, {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    reviewedByUid: reviewerUid,
    reviewNote: reviewNote ?? null,
  });

  const snap = await getDoc(paymentRef);
  if (snap.exists()) {
    const data = snap.data() as SubscriptionPaymentDoc;
    await logDeveloperAction({
      type: 'REJECT_PAYMENT',
      companyId: data.companyId,
      paymentId,
      meta: {
        amount: data.amount,
        planId: data.planId ?? data.plan,
        billingMode: data.billingMode ?? data.mode,
        reviewNote: reviewNote ?? null,
      },
    });
  }
}

