import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  getCountFromServer,
  writeBatch,
  documentId,
  type DocumentSnapshot,
} from '@/lib/firestore-stub';
import { db } from '@/lib/firebase';
import { getCompany } from '@/services/companyService';
import type {
  LibraryRecord,
  CompanyRecord,
  CompanyRecordShare,
  RecordCategory,
} from '@/types';

const LIBRARY = 'records_library';
const SHARES = 'company_record_shares';
const COMPANY_RECORDS = 'company_records';
const CROPS = 'crops';
const PAGE_SIZE = 50;

const RECORD_CATEGORIES: RecordCategory[] = [
  'Timing',
  'Fertilizer',
  'Pests & Diseases',
  'Sprays',
  'Yield',
  'General',
];

export { RECORD_CATEGORIES };

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    const d = (v as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function mapLibraryRecord(id: string, data: Record<string, unknown>): LibraryRecord {
  return {
    id,
    cropId: String(data.cropId ?? ''),
    category: (data.category as RecordCategory) ?? 'General',
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
    highlights: Array.isArray(data.highlights) ? data.highlights.map(String) : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    status: (data.status as 'draft' | 'published') ?? 'draft',
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function mapCompanyRecord(id: string, data: Record<string, unknown>): CompanyRecord {
  return {
    id,
    companyId: String(data.companyId ?? ''),
    cropId: String(data.cropId ?? ''),
    category: (data.category as RecordCategory) ?? 'General',
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
    highlights: Array.isArray(data.highlights) ? data.highlights.map(String) : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    createdBy: String(data.createdBy ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function mapShare(id: string, data: Record<string, unknown>): CompanyRecordShare {
  return {
    id,
    companyId: String(data.companyId ?? ''),
    recordId: String(data.recordId ?? ''),
    cropId: String(data.cropId ?? ''),
    title: String(data.title ?? ''),
    category: (data.category as RecordCategory) ?? 'General',
    highlights: Array.isArray(data.highlights) ? data.highlights.map(String) : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    content: data.content != null ? String(data.content) : undefined,
    sharedBy: String(data.sharedBy ?? ''),
    sharedAt: data.sharedAt,
    visibility: (data.visibility as 'visible' | 'hidden') ?? 'visible',
    pinned: Boolean(data.pinned),
  };
}

// ---------- Library records (developer only) ----------
export async function getLibraryRecord(recordId: string): Promise<LibraryRecord | null> {
  const snap = await getDoc(doc(db, LIBRARY, recordId));
  if (!snap.exists()) return null;
  return mapLibraryRecord(snap.id, snap.data() as Record<string, unknown>);
}

export async function listLibraryRecordsByCrop(
  cropId: string,
  pageSize: number = PAGE_SIZE,
  lastDoc: DocumentSnapshot | null
): Promise<{ records: LibraryRecord[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const q = lastDoc
      ? query(
          collection(db, LIBRARY),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(pageSize)
        )
      : query(
          collection(db, LIBRARY),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    const records = snap.docs.map((d) => mapLibraryRecord(d.id, d.data() as Record<string, unknown>));
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { records, lastDoc: last };
  } catch (err) {
    console.error('listLibraryRecordsByCrop fallback (no index?):', err);
    // Fallback without orderBy to avoid index issues; still limited by crop and page size.
    const qFallback = query(
      collection(db, LIBRARY),
      where('cropId', '==', cropId),
      limit(pageSize)
    );
    const snap = await getDocs(qFallback);
    const records = snap.docs.map((d) => mapLibraryRecord(d.id, d.data() as Record<string, unknown>));
    // Fallback does not support reliable pagination with startAfter.
    return { records, lastDoc: null };
  }
}

export async function createLibraryRecord(params: {
  cropId: string;
  category: RecordCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  status: 'draft' | 'published';
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, LIBRARY), {
    cropId: params.cropId,
    category: params.category,
    title: params.title,
    content: params.content,
    highlights: params.highlights ?? [],
    tags: params.tags ?? [],
    status: params.status ?? 'draft',
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLibraryRecord(
  recordId: string,
  params: Partial<{
    category: RecordCategory;
    title: string;
    content: string;
    highlights: string[];
    tags: string[];
    status: 'draft' | 'published';
  }>
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (params.category != null) payload.category = params.category;
  if (params.title != null) payload.title = params.title;
  if (params.content != null) payload.content = params.content;
  if (params.highlights != null) payload.highlights = params.highlights;
  if (params.tags != null) payload.tags = params.tags;
  if (params.status != null) payload.status = params.status;
  await updateDoc(doc(db, LIBRARY, recordId), payload);
}

export async function deleteLibraryRecord(recordId: string): Promise<void> {
  await deleteDoc(doc(db, LIBRARY, recordId));
}

// ---------- Company records ----------
export async function listCompanyRecordsByCrop(
  companyId: string,
  cropId: string,
  pageSize: number = PAGE_SIZE,
  lastDoc: DocumentSnapshot | null
): Promise<{ records: CompanyRecord[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const q = lastDoc
      ? query(
          collection(db, COMPANY_RECORDS),
          where('companyId', '==', companyId),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(pageSize)
        )
      : query(
          collection(db, COMPANY_RECORDS),
          where('companyId', '==', companyId),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    const records = snap.docs.map((d) => mapCompanyRecord(d.id, d.data() as Record<string, unknown>));
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { records, lastDoc: last };
  } catch (err) {
    console.error('listCompanyRecordsByCrop fallback (no index?):', err);
    // Fallback: filter by cropId in memory, only using companyId in query to avoid composite index.
    const qFallback = query(
      collection(db, COMPANY_RECORDS),
      where('companyId', '==', companyId),
      limit(pageSize)
    );
    const snap = await getDocs(qFallback);
    const all = snap.docs.map((d) => mapCompanyRecord(d.id, d.data() as Record<string, unknown>));
    const records = all.filter((r) => r.cropId === cropId);
    // Fallback does not support reliable pagination with startAfter.
    return { records, lastDoc: null };
  }
}

export async function listCompanyRecordsByCropForDeveloper(
  cropId: string,
  pageSize: number = PAGE_SIZE,
  lastDoc: DocumentSnapshot | null
): Promise<{ records: CompanyRecord[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const q = lastDoc
      ? query(
          collection(db, COMPANY_RECORDS),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(pageSize)
        )
      : query(
          collection(db, COMPANY_RECORDS),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    const records = snap.docs.map((d) => mapCompanyRecord(d.id, d.data() as Record<string, unknown>));
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { records, lastDoc: last };
  } catch (err) {
    console.error('listCompanyRecordsByCropForDeveloper fallback (no index?):', err);
    // Fallback: simple single-field filter on cropId, no orderBy.
    const qFallback = query(
      collection(db, COMPANY_RECORDS),
      where('cropId', '==', cropId),
      limit(pageSize)
    );
    const snap = await getDocs(qFallback);
    const records = snap.docs.map((d) => mapCompanyRecord(d.id, d.data() as Record<string, unknown>));
    // Fallback does not support reliable pagination with startAfter.
    return { records, lastDoc: null };
  }
}

export async function createCompanyRecord(params: {
  companyId: string;
  cropId: string;
  category: RecordCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COMPANY_RECORDS), {
    companyId: params.companyId,
    cropId: params.cropId,
    category: params.category,
    title: params.title,
    content: params.content,
    highlights: params.highlights ?? [],
    tags: params.tags ?? [],
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCompanyRecord(
  recordId: string,
  params: Partial<{
    category: RecordCategory;
    title: string;
    content: string;
    highlights: string[];
    tags: string[];
  }>
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (params.category != null) payload.category = params.category;
  if (params.title != null) payload.title = params.title;
  if (params.content != null) payload.content = params.content;
  if (params.highlights != null) payload.highlights = params.highlights;
  if (params.tags != null) payload.tags = params.tags;
  await updateDoc(doc(db, COMPANY_RECORDS, recordId), payload);
}

export async function deleteCompanyRecord(recordId: string): Promise<void> {
  await deleteDoc(doc(db, COMPANY_RECORDS, recordId));
}

// ---------- Shares (denormalized for fast list) ----------
export async function listSharesByCropForCompany(
  companyId: string,
  cropId: string,
  pageSize: number = PAGE_SIZE,
  lastDoc: DocumentSnapshot | null
): Promise<{ shares: CompanyRecordShare[]; lastDoc: DocumentSnapshot | null }> {
  try {
    const q = lastDoc
      ? query(
          collection(db, SHARES),
          where('companyId', '==', companyId),
          where('cropId', '==', cropId),
          where('visibility', '==', 'visible'),
          orderBy('sharedAt', 'desc'),
          startAfter(lastDoc),
          limit(pageSize)
        )
      : query(
          collection(db, SHARES),
          where('companyId', '==', companyId),
          where('cropId', '==', cropId),
          where('visibility', '==', 'visible'),
          orderBy('sharedAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    const shares = snap.docs.map((d) => mapShare(d.id, d.data() as Record<string, unknown>));
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { shares, lastDoc: last };
  } catch (err) {
    console.error('listSharesByCropForCompany fallback (no index?):', err);
    // Fallback: filter in memory by crop + visibility, only using companyId in query to avoid composite index.
    const qFallback = query(
      collection(db, SHARES),
      where('companyId', '==', companyId),
      limit(pageSize)
    );
    const snap = await getDocs(qFallback);
    const all = snap.docs.map((d) => mapShare(d.id, d.data() as Record<string, unknown>));
    const shares = all.filter(
      (s) => s.cropId === cropId && s.visibility === 'visible'
    );
    // Fallback does not support reliable pagination with startAfter.
    return { shares, lastDoc: null };
  }
}

export async function upsertRecordShare(params: {
  companyId: string;
  recordId: string;
  cropId: string;
  title: string;
  category: RecordCategory;
  highlights: string[];
  tags: string[];
  sharedBy: string;
  content?: string;
  visibility?: 'visible' | 'hidden';
  pinned?: boolean;
}): Promise<string> {
  const existing = await getDocs(
    query(
      collection(db, SHARES),
      where('companyId', '==', params.companyId),
      where('recordId', '==', params.recordId)
    )
  );
  const payload: Record<string, unknown> = {
    companyId: params.companyId,
    recordId: params.recordId,
    cropId: params.cropId,
    title: params.title,
    category: params.category,
    highlights: params.highlights ?? [],
    tags: params.tags ?? [],
    sharedBy: params.sharedBy,
    sharedAt: serverTimestamp(),
    visibility: params.visibility ?? 'visible',
    pinned: params.pinned ?? false,
  };
  if (params.content != null) payload.content = params.content;
  if (existing.docs.length > 0) {
    await updateDoc(doc(db, SHARES, existing.docs[0].id), payload as Record<string, unknown>);
    return existing.docs[0].id;
  }
  const ref = await addDoc(collection(db, SHARES), payload);
  return ref.id;
}

// ---------- Counts (for crop cards) ----------
export async function getLibraryRecordCountByCrop(cropId: string): Promise<number> {
  const q = query(
    collection(db, LIBRARY),
    where('cropId', '==', cropId)
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function getCompanyRecordCountByCrop(cropId: string): Promise<number> {
  const q = query(
    collection(db, COMPANY_RECORDS),
    where('cropId', '==', cropId)
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function getSharedRecordCountForCompany(companyId: string, cropId: string): Promise<number> {
  try {
    const q = query(
      collection(db, SHARES),
      where('companyId', '==', companyId),
      where('cropId', '==', cropId),
      where('visibility', '==', 'visible')
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.error('getSharedRecordCountForCompany fallback (no index?):', err);
    // Fallback: approximate count by querying by companyId only and filtering in memory.
    const qFallback = query(
      collection(db, SHARES),
      where('companyId', '==', companyId)
    );
    const snap = await getDocs(qFallback);
    return snap.docs.reduce((count, d) => {
      const data = mapShare(d.id, d.data() as Record<string, unknown>);
      return count + (data.cropId === cropId && data.visibility === 'visible' ? 1 : 0);
    }, 0);
  }
}

export async function getCompanyRecordCountForCompany(companyId: string, cropId: string): Promise<number> {
  const q = query(
    collection(db, COMPANY_RECORDS),
    where('companyId', '==', companyId),
    where('cropId', '==', cropId)
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// ---------- Crops list ----------
export async function listCrops(limitCount: number = 50): Promise<{ id: string; name: string }[]> {
  const q = query(collection(db, CROPS), limit(limitCount));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({
    id: d.id,
    name: String((d.data() as Record<string, unknown>).name ?? d.id),
  }));

  // Stable display order for Records: tomatoes, french-beans, capsicum, watermelon, maize, rice
  const order: Record<string, number> = {
    tomatoes: 1,
    'french-beans': 2,
    capsicum: 3,
    watermelon: 4,
    maize: 5,
    rice: 6,
  };

  return items.sort((a, b) => {
    const aRank = order[a.id] ?? Number.MAX_SAFE_INTEGER;
    const bRank = order[b.id] ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });
}

export async function getCompanyName(companyId: string): Promise<string> {
  const company = await getCompany(companyId);
  return company?.name ?? companyId;
}

// ---------- Dev: seed ----------
const SEED_CROPS = [
  { id: 'tomatoes', name: 'Tomatoes' },
  { id: 'capsicum', name: 'Capsicum' },
  { id: 'watermelon', name: 'Watermelon' },
  { id: 'french-beans', name: 'French Beans' },
];

export async function seedRecordsData(createdBy: string): Promise<{ crops: number; records: number }> {
  let cropsCreated = 0;
  let recordsCreated = 0;
  for (const c of SEED_CROPS) {
    const cropRef = doc(db, CROPS, c.id);
    const cropSnap = await getDoc(cropRef);
    if (!cropSnap.exists()) {
      await setDoc(cropRef, { name: c.name, createdAt: serverTimestamp() }, { merge: true });
      cropsCreated++;
    }
    const sampleContent = `**${c.name} – Sample Record**\n\n- Key point one\n- Key point two\n\n> ⚠️ Important: This is sample content for testing.`;
    await addDoc(collection(db, LIBRARY), {
      cropId: c.id,
      category: 'General',
      title: `${c.name} – Getting Started`,
      content: sampleContent,
      highlights: ['Sample highlight 1', 'Sample highlight 2'],
      tags: ['sample', 'seed'],
      status: 'published',
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    recordsCreated++;
  }
  return { crops: cropsCreated, records: recordsCreated };
}

// ---------- Dev: purge (batched) ----------
const BATCH_SIZE = 400;

export async function purgeRecordsData(options: {
  includeCrops?: boolean;
  onProgress?: (collection: string, deleted: number, status: string) => void;
}): Promise<{ [coll: string]: number }> {
  const result: { [coll: string]: number } = {};
  const collectionsToPurge = [LIBRARY, SHARES, COMPANY_RECORDS, ...(options.includeCrops ? [CROPS] : [])];
  for (const collName of collectionsToPurge) {
    let total = 0;
    let lastDoc: DocumentSnapshot | null = null;
    let hasMore = true;
    while (hasMore) {
      const q = lastDoc
        ? query(collection(db, collName), orderBy(documentId()), startAfter(lastDoc), limit(BATCH_SIZE))
        : query(collection(db, collName), orderBy(documentId()), limit(BATCH_SIZE));
      const snap = await getDocs(q);
      if (snap.docs.length === 0) {
        hasMore = false;
        break;
      }
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += snap.docs.length;
      options.onProgress?.(collName, total, 'deleting');
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < BATCH_SIZE) hasMore = false;
    }
    result[collName] = total;
    options.onProgress?.(collName, total, 'done');
  }
  return result;
}
