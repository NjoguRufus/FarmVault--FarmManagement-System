import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
  limit as fsLimit,
  onSnapshot,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ActivityLogStatus = 'info' | 'success' | 'warning' | 'danger';

export type ActivityLogType =
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_SUBMITTED'
  | 'TASK_APPROVED'
  | 'TASK_REJECTED'
  | 'PAYMENT_MARKED'
  | 'INVENTORY_RESTOCK'
  | 'INVENTORY_USAGE'
  | 'EXPENSE_RECORDED'
  | 'EXPENSE_ADDED'
  | 'HARVEST_WEIGH_ADDED'
  | 'HARVEST_BUYER_SET'
  | 'HARVEST_PAYMENT_BATCHED'
  | 'HARVEST_WALLET_DEDUCT'
  | string;

export interface ActivityLogDoc {
  id: string;
  companyId: string;
  projectId: string | null;
  projectName: string | null;
  actorId: string;
  actorName: string | null;
  actorRole?: string | null;
  type: ActivityLogType;
  message: string;
  status: ActivityLogStatus;
  createdAt: Date | null;
  clientCreatedAt: number | null;
  meta?: Record<string, unknown> | null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof (value as Timestamp).toDate === 'function') {
    const d = (value as Timestamp).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function logActivity(params: {
  companyId: string;
  projectId?: string | null;
  projectName?: string | null;
  actorId: string;
  actorName?: string | null;
  actorRole?: string | null;
  type: ActivityLogType;
  message: string;
  status?: ActivityLogStatus;
  meta?: Record<string, unknown>;
}): Promise<string | null> {
  if (!params.companyId || !params.actorId) {
    return null;
  }

  const now = Date.now();

  const docRef = await addDoc(collection(db, 'activityLogs'), {
    companyId: params.companyId,
    projectId: params.projectId ?? null,
    projectName: params.projectName ?? null,
    actorId: params.actorId,
    actorName: params.actorName ?? null,
    actorRole: params.actorRole ?? null,
    type: params.type,
    message: params.message,
    status: params.status ?? 'info',
    createdAt: serverTimestamp(),
    clientCreatedAt: now,
    meta: params.meta ?? null,
  });

  return docRef.id;
}

export interface SubscribeActivityOptions {
  limit?: number;
  projectId?: string | null;
}

export function subscribeActivity(
  companyId: string | null | undefined,
  options: SubscribeActivityOptions | null,
  callback: (logs: ActivityLogDoc[]) => void,
): Unsubscribe | null {
  if (!companyId) return null;

  const limit = options?.limit && options.limit > 0 ? options.limit : 15;
  const projectId = options?.projectId;

  const constraints: QueryConstraint[] = [
    where('companyId', '==', companyId),
    ...(projectId ? [where('projectId', '==', projectId)] : []),
    orderBy('createdAt', 'desc'),
    fsLimit(limit),
  ];

  const q = query(collection(db, 'activityLogs'), ...constraints);

  return onSnapshot(q, (snap) => {
    const items: ActivityLogDoc[] = snap.docs.map((doc) => {
      const data = doc.data() as any;
      const createdAt = toDate(data.createdAt);
      const clientCreatedAt =
        typeof data.clientCreatedAt === 'number' ? data.clientCreatedAt : null;
      return {
        id: doc.id,
        companyId: String(data.companyId ?? ''),
        projectId: (data.projectId as string | null) ?? null,
        projectName: (data.projectName as string | null) ?? null,
        actorId: String(data.actorId ?? ''),
        actorName: (data.actorName as string | null) ?? null,
        actorRole: (data.actorRole as string | null) ?? null,
        type: (data.type as ActivityLogType) ?? 'UNKNOWN',
        message: String(data.message ?? ''),
        status: (data.status as ActivityLogStatus) ?? 'info',
        createdAt,
        clientCreatedAt,
        meta: (data.meta as Record<string, unknown> | null) ?? null,
      };
    });

    items.sort((a, b) => {
      const aTime =
        (a.createdAt ? a.createdAt.getTime() : undefined) ??
        (typeof a.clientCreatedAt === 'number' ? a.clientCreatedAt : 0);
      const bTime =
        (b.createdAt ? b.createdAt.getTime() : undefined) ??
        (typeof b.clientCreatedAt === 'number' ? b.clientCreatedAt : 0);
      return bTime - aTime;
    });

    callback(items);
  });
}

