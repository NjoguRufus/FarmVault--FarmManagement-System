import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  DocumentData,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  where,
} from '@/lib/documentLayer';
import { db } from '@/lib/documentLayer';
import type {
  SubscriptionPaymentDoc,
  SubscriptionPaymentStatus,
} from '@/services/subscriptionPaymentService';

export type AdminPaymentStatusTab = SubscriptionPaymentStatus;
export type AdminBillingModeFilter = 'all' | 'monthly' | 'seasonal' | 'annual';
export type AdminPlanFilter = 'all' | 'basic' | 'pro';
export type AdminDateRangeFilter = '7' | '30' | 'all';

export interface AdminPaymentsFilterState {
  status: AdminPaymentStatusTab;
  search: string;
  billingMode: AdminBillingModeFilter;
  plan: AdminPlanFilter;
  dateRange: AdminDateRangeFilter;
}

export interface UseAdminSubscriptionPaymentsResult {
  payments: (SubscriptionPaymentDoc & { id: string })[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

const PAGE_SIZE = 30;

function buildDateRangeLowerBound(range: AdminDateRangeFilter): Timestamp | null {
  if (range === 'all') return null;
  const now = new Date();
  const days = range === '7' ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return Timestamp.fromDate(from);
}

export function useAdminSubscriptionPayments(
  filters: AdminPaymentsFilterState,
): UseAdminSubscriptionPaymentsResult {
  const [payments, setPayments] = useState<(SubscriptionPaymentDoc & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const unsubscribeRef = useRef<() => void>();

  // Base query subscription for the current filters
  useEffect(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    setIsLoading(true);
    setError(null);
    setPayments([]);
    setHasMore(false);
    lastDocRef.current = null;

    const constraints: any[] = [where('status', '==', filters.status as SubscriptionPaymentStatus)];

    if (filters.billingMode !== 'all') {
      constraints.push(where('billingMode', '==', filters.billingMode));
    }

    if (filters.plan !== 'all') {
      constraints.push(where('planId', '==', filters.plan));
    }

    const lowerBound = buildDateRangeLowerBound(filters.dateRange);
    if (lowerBound) {
      constraints.push(where('createdAt', '>=', lowerBound));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(PAGE_SIZE));

    const q = query(collection(db, 'subscriptionPayments'), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...(docSnap.data() as SubscriptionPaymentDoc),
            } satisfies SubscriptionPaymentDoc & { id: string }),
        );
        setPayments(docs);
        setIsLoading(false);
        setError(null);
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
        setHasMore(snapshot.size === PAGE_SIZE);
      },
      (err) => {
        console.error('[useAdminSubscriptionPayments] Snapshot error', err);
        setError(err as Error);
        setIsLoading(false);
      },
    );

    unsubscribeRef.current = unsubscribe;
    return () => {
      unsubscribe();
      unsubscribeRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.billingMode, filters.plan, filters.dateRange]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !lastDocRef.current) return;
    setIsLoadingMore(true);
    try {
      const constraints: any[] = [where('status', '==', filters.status as SubscriptionPaymentStatus)];

      if (filters.billingMode !== 'all') {
        constraints.push(where('billingMode', '==', filters.billingMode));
      }

      if (filters.plan !== 'all') {
        constraints.push(where('planId', '==', filters.plan));
      }

      const lowerBound = buildDateRangeLowerBound(filters.dateRange);
      if (lowerBound) {
        constraints.push(where('createdAt', '>=', lowerBound));
      }

      constraints.push(orderBy('createdAt', 'desc'));
      constraints.push(startAfter(lastDocRef.current));
      constraints.push(limit(PAGE_SIZE));

      const q = query(collection(db, 'subscriptionPayments'), ...constraints);
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(
        (docSnap) =>
          ({
            id: docSnap.id,
            ...(docSnap.data() as SubscriptionPaymentDoc),
          } satisfies SubscriptionPaymentDoc & { id: string }),
      );

      if (docs.length > 0) {
        setPayments((prev) => [...prev, ...docs]);
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1] ?? lastDocRef.current;
        setHasMore(docs.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[useAdminSubscriptionPayments] loadMore error', err);
      setError(err as Error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [filters, hasMore, isLoadingMore]);

  const filteredPayments = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    if (!search) return payments;
    return payments.filter((p) => {
      const companyName = (p.companyName || '').toString().toLowerCase();
      const payerName =
        (p.mpesaPayerName || p.mpesaName || '').toString().toLowerCase();
      return companyName.includes(search) || payerName.includes(search);
    });
  }, [payments, filters.search]);

  return {
    payments: filteredPayments,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  };
}

