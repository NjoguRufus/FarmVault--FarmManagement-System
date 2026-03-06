import { collection, getDocs, addDoc, serverTimestamp, Timestamp, query, where } from '@/lib/firestore-stub';
import { db } from '@/lib/firebase';

export interface AuditLogDoc {
  id: string;
  createdAt: Date;
  actorEmail: string;
  actorUid: string;
  actionType: string;
  targetType: 'COMPANY' | 'USER' | 'EMPLOYEE' | string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate();
  if (typeof v === 'string') return new Date(v);
  return new Date();
}

/** Fetch audit logs. When companyId is provided, only that company's logs; otherwise all (developer only). */
export async function getAuditLogs(maxResults: number = 200, companyId?: string | null): Promise<AuditLogDoc[]> {
  const coll = collection(db, 'auditLogs');
  const q = companyId
    ? query(coll, where('companyId', '==', companyId))
    : coll;
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      createdAt: toDate(data.createdAt),
      actorEmail: data.actorEmail ?? '',
      actorUid: data.actorUid ?? '',
      actionType: data.actionType ?? '',
      targetType: data.targetType ?? '',
      targetId: data.targetId ?? '',
      metadata: data.metadata,
    } as AuditLogDoc;
  });
  list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return list.slice(0, maxResults);
}

/** Record an audit log entry. Pass companyId when the action is scoped to a company. */
export async function createAuditLog(params: {
  actorEmail: string;
  actorUid: string;
  actionType: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  companyId?: string | null;
}): Promise<string> {
  const payload: Record<string, unknown> = {
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: params.actionType,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata ?? null,
    createdAt: serverTimestamp(),
  };
  if (params.companyId) payload.companyId = params.companyId;
  const ref = await addDoc(collection(db, 'auditLogs'), payload);
  return ref.id;
}
