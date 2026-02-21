import { auth, db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const LEDGER_COLLECTION = 'projectWalletLedger';
const META_COLLECTION = 'projectWalletMeta';
const LEGACY_WALLET_COLLECTION = 'harvestWallets';

export type WalletEntryType = 'CREDIT' | 'DEBIT';
export type WalletRefType = 'COLLECTION' | 'PICKER' | 'ADJUSTMENT' | 'MANUAL';

export interface ProjectWalletLedgerEntry {
  id: string;
  companyId: string;
  projectId: string;
  type: WalletEntryType;
  amount: number;
  reason: string;
  refType?: WalletRefType;
  refId?: string;
  createdAt?: unknown;
  createdAtLocal: number;
  createdByUid: string;
  createdByName: string;
  idempotencyKey?: string;
  meta?: Record<string, unknown>;
  pending?: boolean;
  fromCache?: boolean;
}

export interface WalletSummary {
  cashReceivedTotal: number;
  cashPaidOutTotal: number;
  currentBalance: number;
}

export interface WalletEntryMeta {
  refType?: WalletRefType;
  refId?: string;
  createdByUid?: string;
  createdByName?: string;
  idempotencyKey?: string;
  [key: string]: unknown;
}

const EMPTY_SUMMARY: WalletSummary = {
  cashReceivedTotal: 0,
  cashPaidOutTotal: 0,
  currentBalance: 0,
};

function getProjectWalletMetaId(projectId: string, companyId: string): string {
  return `${companyId}_${projectId}`;
}

function normalizeAmount(amount: number): number {
  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('Amount must be greater than 0.');
  }
  return normalized;
}

function resolveActor(meta?: WalletEntryMeta): { uid: string; name: string } {
  const uid =
    (meta?.createdByUid as string | undefined) ??
    auth.currentUser?.uid ??
    'system';

  const name =
    (meta?.createdByName as string | undefined) ??
    auth.currentUser?.displayName ??
    auth.currentUser?.email ??
    'System';

  return { uid, name };
}

function mapLedgerDoc(docSnap: {
  id: string;
  data: () => any;
  metadata?: { hasPendingWrites: boolean; fromCache: boolean };
}): ProjectWalletLedgerEntry {
  const data = docSnap.data() ?? {};
  return {
    id: docSnap.id,
    companyId: String(data.companyId ?? ''),
    projectId: String(data.projectId ?? ''),
    type: (data.type as WalletEntryType) ?? 'DEBIT',
    amount: Number(data.amount ?? 0),
    reason: String(data.reason ?? ''),
    refType: data.refType as WalletRefType | undefined,
    refId: data.refId as string | undefined,
    createdAt: data.createdAt,
    createdAtLocal: Number(data.createdAtLocal ?? 0),
    createdByUid: String(data.createdByUid ?? ''),
    createdByName: String(data.createdByName ?? ''),
    idempotencyKey: data.idempotencyKey as string | undefined,
    meta: (data.meta as Record<string, unknown> | undefined) ?? undefined,
    pending: Boolean(docSnap.metadata?.hasPendingWrites),
    fromCache: Boolean(docSnap.metadata?.fromCache),
  };
}

async function getLedgerEntriesOnce(projectId: string, companyId: string): Promise<ProjectWalletLedgerEntry[]> {
  const snap = await getDocs(
    query(
      collection(db, LEDGER_COLLECTION),
      where('companyId', '==', companyId),
      where('projectId', '==', projectId),
    ),
  );
  return snap.docs.map((d) => mapLedgerDoc(d));
}

async function hasIdempotencyKey(
  projectId: string,
  companyId: string,
  idempotencyKey?: string,
): Promise<boolean> {
  if (!idempotencyKey) return false;
  const entries = await getLedgerEntriesOnce(projectId, companyId);
  return entries.some((e) => e.idempotencyKey === idempotencyKey);
}

export function computeWalletSummary(ledgerEntries: ProjectWalletLedgerEntry[]): WalletSummary {
  const summary = { ...EMPTY_SUMMARY };

  ledgerEntries.forEach((entry) => {
    const amount = Number(entry.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (entry.type === 'CREDIT') {
      summary.cashReceivedTotal += amount;
      summary.currentBalance += amount;
      return;
    }

    if (entry.type === 'DEBIT') {
      summary.cashPaidOutTotal += amount;
      summary.currentBalance -= amount;
    }
  });

  return {
    cashReceivedTotal: Math.max(0, summary.cashReceivedTotal),
    cashPaidOutTotal: Math.max(0, summary.cashPaidOutTotal),
    currentBalance: summary.currentBalance,
  };
}

export async function ensureProjectWalletMigration(projectId: string, companyId: string): Promise<void> {
  if (!projectId || !companyId) return;

  const metaRef = doc(db, META_COLLECTION, getProjectWalletMetaId(projectId, companyId));
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data()?.migrated === true) return;

  const existingLedger = await getDocs(
    query(
      collection(db, LEDGER_COLLECTION),
      where('companyId', '==', companyId),
      where('projectId', '==', projectId),
      limit(1),
    ),
  );

  // Ledger already exists: mark migration done and stop.
  if (!existingLedger.empty) {
    await setDoc(
      metaRef,
      {
        migrated: true,
        migratedAt: serverTimestamp(),
        migrationSource: 'existing-ledger',
      },
      { merge: true },
    );
    return;
  }

  const legacySnap = await getDocs(
    query(
      collection(db, LEGACY_WALLET_COLLECTION),
      where('companyId', '==', companyId),
      where('projectId', '==', projectId),
    ),
  );

  let legacyReceived = 0;
  let legacyPaidOut = 0;

  legacySnap.docs.forEach((d) => {
    const data = d.data() ?? {};
    legacyReceived += Number(data.cashReceivedTotal ?? data.cashReceived ?? 0);
    legacyPaidOut += Number(data.cashPaidOutTotal ?? data.totalPaidOut ?? 0);
  });

  const nowLocal = Date.now();
  const batch = writeBatch(db);

  if (legacyReceived > 0) {
    const creditRef = doc(collection(db, LEDGER_COLLECTION));
    batch.set(creditRef, {
      companyId,
      projectId,
      type: 'CREDIT',
      amount: legacyReceived,
      reason: 'Legacy wallet migration: cash received',
      refType: 'ADJUSTMENT',
      refId: 'migration',
      createdAt: serverTimestamp(),
      createdAtLocal: nowLocal,
      createdByUid: 'system-migration',
      createdByName: 'System Migration',
      meta: {
        migratedFrom: LEGACY_WALLET_COLLECTION,
        legacyWalletCount: legacySnap.size,
      },
    });
  }

  if (legacyPaidOut > 0) {
    const debitRef = doc(collection(db, LEDGER_COLLECTION));
    batch.set(debitRef, {
      companyId,
      projectId,
      type: 'DEBIT',
      amount: legacyPaidOut,
      reason: 'Legacy wallet migration: cash paid out',
      refType: 'ADJUSTMENT',
      refId: 'migration',
      createdAt: serverTimestamp(),
      createdAtLocal: nowLocal,
      createdByUid: 'system-migration',
      createdByName: 'System Migration',
      meta: {
        migratedFrom: LEGACY_WALLET_COLLECTION,
        legacyWalletCount: legacySnap.size,
      },
    });
  }

  batch.set(
    metaRef,
    {
      migrated: true,
      migratedAt: serverTimestamp(),
      legacyWalletCount: legacySnap.size,
      migratedCashReceivedTotal: legacyReceived,
      migratedCashPaidOutTotal: legacyPaidOut,
    },
    { merge: true },
  );

  await batch.commit();
}

async function addWalletEntry(
  type: WalletEntryType,
  projectId: string,
  companyId: string,
  amount: number,
  reason: string,
  meta?: WalletEntryMeta,
): Promise<string> {
  if (!projectId || !companyId) {
    throw new Error('Project and company are required.');
  }

  const normalizedAmount = normalizeAmount(amount);
  await ensureProjectWalletMigration(projectId, companyId);

  const idempotencyKey =
    typeof meta?.idempotencyKey === 'string' && meta.idempotencyKey.trim().length > 0
      ? meta.idempotencyKey.trim()
      : undefined;

  if (await hasIdempotencyKey(projectId, companyId, idempotencyKey)) {
    return idempotencyKey as string;
  }

  const { uid, name } = resolveActor(meta);
  const {
    refType,
    refId,
    createdByUid: _createdByUid,
    createdByName: _createdByName,
    idempotencyKey: _idempotencyKey,
    ...metaRest
  } = meta ?? {};

  const payload: Record<string, unknown> = {
    companyId,
    projectId,
    type,
    amount: normalizedAmount,
    reason: reason?.trim?.() || 'Wallet entry',
    createdAt: serverTimestamp(),
    createdAtLocal: Date.now(),
    createdByUid: uid,
    createdByName: name,
  };

  if (refType) payload.refType = refType;
  if (refId) payload.refId = refId;
  if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
  if (Object.keys(metaRest).length > 0) payload.meta = metaRest;

  const ref = await addDoc(collection(db, LEDGER_COLLECTION), payload);
  return ref.id;
}

export async function addWalletCredit(
  projectId: string,
  companyId: string,
  amount: number,
  reason: string,
  meta?: WalletEntryMeta,
): Promise<string> {
  return addWalletEntry('CREDIT', projectId, companyId, amount, reason, meta);
}

export async function addWalletDebit(
  projectId: string,
  companyId: string,
  amount: number,
  reason: string,
  meta?: WalletEntryMeta,
): Promise<string> {
  return addWalletEntry('DEBIT', projectId, companyId, amount, reason, meta);
}

export async function getWalletSummaryOnce(projectId: string, companyId: string): Promise<WalletSummary> {
  if (!projectId || !companyId) return { ...EMPTY_SUMMARY };
  await ensureProjectWalletMigration(projectId, companyId);
  const entries = await getLedgerEntriesOnce(projectId, companyId);
  return computeWalletSummary(entries);
}

export function subscribeWalletLedger(
  projectId: string,
  companyId: string,
  callback: (entries: ProjectWalletLedgerEntry[]) => void,
): () => void {
  if (!projectId || !companyId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, LEDGER_COLLECTION),
    where('companyId', '==', companyId),
    where('projectId', '==', projectId),
  );

  // Fire and forget: migration writes will flow through this listener.
  void ensureProjectWalletMigration(projectId, companyId).catch((err) => {
    console.error('[projectWallet] migration check failed', err);
  });

  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      callback(snap.docs.map((d) => mapLedgerDoc(d)));
    },
    (err) => {
      console.error('[projectWallet] subscribe failed', err);
      callback([]);
    },
  );
}
