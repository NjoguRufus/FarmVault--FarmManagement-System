import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  db,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  type DocumentSnapshot,
  updateDoc,
  where,
  writeBatch,
} from '@/lib/documentLayer';
import { getCompany } from '@/services/companyService';
import { supabase } from '@/lib/supabase';
import type {
  LibraryRecord,
  CompanyRecord,
  CompanyRecordShare,
  RecordCategory,
} from '@/types';

/** PostgREST: call record RPCs on `public` so resolution targets one schema (avoids uuid/text overload mix-ups). */
function recordsPublicRpc() {
  return supabase.schema('public');
}

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

// ---------------------------------------------------------------------------
// Supabase-backed Farm Notebook / Records (company + developer)
// ---------------------------------------------------------------------------

function validateCompanyId(companyId: string | null | undefined): string | null {
  if (!companyId || companyId === null || companyId === undefined) {
    return null;
  }

  const trimmed = String(companyId).trim();
  if (trimmed === '' || trimmed.length === 0) {
    return null;
  }

  // Optional: Validate UUID format if your system uses UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(trimmed)) {
    console.warn('[records] Company ID does not look like a valid UUID:', trimmed);
    // Still return the trimmed value - it might be valid in your system
  }

  return trimmed;
}

export type RecordCropCard = {
  crop_id: string;
  crop_name: string;
  slug: string;
  is_global: boolean;
  records_count: number;
  last_updated_at: string | null;
};

/**
 * Notebook crop cards (company admin + developer): always show these crops at 0 records until notes exist.
 * Merged with `getCompanyRecordCrops` RPC results by crop_id.
 */
export const DEVELOPER_NOTEBOOK_DEFAULT_CROPS: readonly Pick<
  RecordCropCard,
  'crop_id' | 'crop_name' | 'slug'
>[] = [
  { crop_id: 'tomatoes', crop_name: 'Tomatoes', slug: 'tomatoes' },
  { crop_id: 'french-beans', crop_name: 'French Beans', slug: 'french-beans' },
  { crop_id: 'capsicum', crop_name: 'Capsicum', slug: 'capsicum' },
  { crop_id: 'maize', crop_name: 'Maize', slug: 'maize' },
  { crop_id: 'rice', crop_name: 'Rice', slug: 'rice' },
];

const DEVELOPER_NOTEBOOK_DEFAULT_CROP_IDS = new Set(
  DEVELOPER_NOTEBOOK_DEFAULT_CROPS.map((d) => d.crop_id),
);

/**
 * Merge RPC crop cards with default notebook crops (Map by crop_id).
 * Used for company admin records and developer notebook. Defaults first, then other crops A–Z.
 */
export function mergeDeveloperNotebookCropCardsWithDefaults(rpc: RecordCropCard[]): RecordCropCard[] {
  const byId = new Map<string, RecordCropCard>();

  for (const d of DEVELOPER_NOTEBOOK_DEFAULT_CROPS) {
    byId.set(d.crop_id, {
      crop_id: d.crop_id,
      crop_name: d.crop_name,
      slug: d.slug,
      is_global: true,
      records_count: 0,
      last_updated_at: null,
    });
  }

  for (const r of rpc) {
    const cid = (r.crop_id ?? '').trim();
    if (!cid) continue;
    const existing = byId.get(cid);
    const name = (r.crop_name ?? '').trim();
    const slug = (r.slug ?? '').trim();
    if (existing) {
      byId.set(cid, {
        ...existing,
        crop_name: name || existing.crop_name,
        slug: slug || existing.slug,
        records_count: r.records_count,
        last_updated_at: r.last_updated_at,
      });
    } else {
      byId.set(cid, { ...r, crop_id: cid });
    }
  }

  const defaultsOrdered = DEVELOPER_NOTEBOOK_DEFAULT_CROPS.map((d) => byId.get(d.crop_id)).filter(
    (c): c is RecordCropCard => c != null,
  );
  const dynamicSorted = [...byId.entries()]
    .filter(([id]) => !DEVELOPER_NOTEBOOK_DEFAULT_CROP_IDS.has(id))
    .map(([, card]) => card)
    .sort((a, b) => a.crop_name.localeCompare(b.crop_name));

  return [...defaultsOrdered, ...dynamicSorted];
}

/** Page title for /developer/records/:cropId when there are no rows (e.g. all companies, zero notes). */
export function developerNotebookCropDisplayName(cropId: string | null | undefined): string {
  const id = (cropId ?? '').trim();
  if (!id) return 'Crop records';
  const d = DEVELOPER_NOTEBOOK_DEFAULT_CROPS.find((c) => c.crop_id === id);
  if (d) return d.crop_name;
  return id
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export type RecordsFetchErrorKind = 'network' | 'rls' | 'schema' | 'unknown';

export type RecordsFetchErrorMeta = {
  kind: RecordsFetchErrorKind;
  code?: string;
};

/** Thrown by record crop loaders; inspect `recordsMeta` for a coarse category (dev UI). */
export type RecordsServiceError = Error & { recordsMeta?: RecordsFetchErrorMeta };

function classifyRecordsRpcError(err: {
  code?: string;
  message?: string;
  details?: string;
}): RecordsFetchErrorMeta {
  const code = err.code ?? '';
  const msg = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  // Postgres 42725 = ambiguous_function; PostgREST surfaces overload conflicts in message text.
  if (
    code === '42725' ||
    code === 'PGRST203' ||
    msg.includes('could not choose the best candidate function') ||
    msg.includes('ambiguous function')
  ) {
    return { kind: 'schema', code };
  }
  if (msg.includes('invalid input syntax for type uuid')) {
    return { kind: 'schema', code };
  }
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    msg.includes('not authorized') ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('rls')
  ) {
    return { kind: 'rls', code };
  }
  if (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('undefined table') ||
    msg.includes('undefined column')
  ) {
    return { kind: 'schema', code };
  }
  if (
    code === '' &&
    (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed'))
  ) {
    return { kind: 'network', code };
  }
  return { kind: 'unknown', code };
}

export function getRecordsServiceErrorMeta(err: unknown): RecordsFetchErrorMeta | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as RecordsServiceError).recordsMeta;
}

function normalizeRecordCropCards(data: unknown): RecordCropCard[] {
  if (data == null) return [];
  if (!Array.isArray(data)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[records] fv_notebook_list_crops_ctx returned non-array', typeof data);
    }
    return [];
  }
  const out: RecordCropCard[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const cropId = String(row.crop_id ?? '').trim();
    if (!cropId) continue;
    const cropNameRaw = row.crop_name;
    const cropName =
      cropNameRaw != null && String(cropNameRaw).trim() !== ''
        ? String(cropNameRaw).trim()
        : cropId;
    const slugRaw = row.slug;
    const slug =
      slugRaw != null && String(slugRaw).trim() !== '' ? String(slugRaw).trim() : cropId;
    const n = Number(row.records_count);
    const recordsCount = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    const lu = row.last_updated_at;
    let lastUpdated: string | null = null;
    if (lu != null && lu !== '') {
      if (typeof lu === 'string') lastUpdated = lu;
      else lastUpdated = String(lu);
    }
    out.push({
      crop_id: cropId,
      crop_name: cropName,
      slug,
      is_global: Boolean(row.is_global),
      records_count: recordsCount,
      last_updated_at: lastUpdated,
    });
  }
  return out;
}

export type CropRecordRow = {
  record_id: string;
  company_id: string;
  crop_id: string;
  crop_name: string;
  title: string;
  content_preview: string;
  source_type: 'company' | 'developer';
  created_by: string | null;
  developer_sender_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  attachments_count: number;
  company_name?: string | null;
};

export type CropRecordDetailAttachment = {
  id: string;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  created_at: string | null;
};

export type CropRecordDetail = {
  record_id: string;
  company_id: string;
  company_name: string | null;
  crop_id: string;
  crop_name: string;
  title: string;
  content: string | null;
  source_type: 'company' | 'developer';
  created_by: string | null;
  developer_sender_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  attachments: CropRecordDetailAttachment[];
};

export type PagedCropRecordsResponse = {
  rows: CropRecordRow[];
  total: number;
};

// ------------------------------ Crop Intelligence ----------------------------

export type CropIntelligenceResponse = {
  crop: {
    crop_id: string;
    crop_name: string;
    slug: string;
    is_global: boolean;
  };
  profile: {
    id?: string;
    maturity_min_days?: number | null;
    maturity_max_days?: number | null;
    best_timing_notes?: string | null;
    harvest_window_notes?: string | null;
    seasonal_notes?: string | null;
    fertilizer_notes?: string | null;
    market_notes?: string | null;
    irrigation_notes?: string | null;
    general_notes?: string | null;
  };
  challenges: Array<{
    id: string;
    challenge_name: string;
    challenge_type: string;
    severity: string | null;
    notes: string | null;
  }>;
  practices: Array<{
    id: string;
    title: string;
    practice_type: string;
    notes: string | null;
  }>;
  chemicals: Array<{
    id: string;
    chemical_name: string;
    purpose: string | null;
    dosage: string | null;
    stage_notes: string | null;
    phi_notes: string | null;
    mix_notes: string | null;
  }>;
  timing_windows: Array<{
    id: string;
    title: string;
    planting_start: string | null;
    planting_end: string | null;
    harvest_start: string | null;
    harvest_end: string | null;
    duration_notes: string | null;
    notes: string | null;
  }>;
  record_summary: {
    records_count?: number;
    company_notes_count?: number;
    developer_notes_count?: number;
    latest_record_at?: string | null;
  };
};

export type CropRecordInsightsResponse = {
  summary: {
    total_records: number;
    company_notes: number;
    developer_notes: number;
    distinct_companies: number;
    latest_record_at: string | null;
  };
  recent_notes: Array<{
    record_id: string;
    company_id: string;
    crop_id: string;
    title: string;
    content_preview: string;
    source_type: string;
    created_at: string | null;
  }>;
};

function normalisePagedResponse(data: unknown): PagedCropRecordsResponse {
  const payload = (data as PagedCropRecordsResponse | null) ?? { rows: [], total: 0 };
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    total: typeof payload.total === 'number' ? payload.total : 0,
  };
}

function normaliseRecordDetail(data: unknown): CropRecordDetail | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    const first = data[0] as CropRecordDetail | undefined;
    return first ?? null;
  }
  const d = data as CropRecordDetail;
  return {
    ...d,
    attachments: Array.isArray(d.attachments) ? d.attachments : [],
  };
}

// ------------------------------ Company-side -------------------------------

function rpcNullableTextParam(value: string | null | undefined): string | null {
  return validateCompanyId(value);
}

/**
 * Load notebook crop cards for one company, or `null` for all companies (developers only; RPC enforces is_developer()).
 * Never pass `""` — use `null` for “all companies”.
 * Always merges canonical default crops (Tomatoes, French Beans, Capsicum, Maize, Rice) with RPC data.
 */
export async function getCompanyRecordCrops(companyId: string | null | undefined): Promise<RecordCropCard[]> {
  const rpc = recordsPublicRpc();

  if (companyId === undefined || companyId === null) {
    const { data, error } = await rpc.rpc('fv_notebook_list_crops_ctx', { p_ctx: {} });
    if (error) {
      const meta = classifyRecordsRpcError(error);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[records] notebook list crops RPC failed (all companies)', {
          kind: meta.kind,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
      }
      const wrapped = new Error(error.message ?? 'Failed to load record crops') as RecordsServiceError;
      wrapped.recordsMeta = meta;
      throw wrapped;
    }
    return mergeDeveloperNotebookCropCardsWithDefaults(normalizeRecordCropCards(data));
  }

  const trimmed = String(companyId).trim();
  if (!trimmed) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[records] getCompanyRecordCrops: empty string is invalid; use null for all companies');
    }
    return [];
  }

  const { data, error } = await rpc.rpc('fv_notebook_list_crops_ctx', {
    p_ctx: { p_company_id: trimmed },
  });

  if (error) {
    const meta = classifyRecordsRpcError(error);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[records] notebook list crops RPC failed', {
        kind: meta.kind,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        companyId: trimmed,
      });
    }
    const wrapped = new Error(error.message ?? 'Failed to load record crops') as RecordsServiceError;
    wrapped.recordsMeta = meta;
    throw wrapped;
  }
  return mergeDeveloperNotebookCropCardsWithDefaults(normalizeRecordCropCards(data));
}

export type CompanyNotebookRecentRow = {
  id: string;
  title: string;
  crop_id: string;
  source_type: string;
  created_at: string | null;
  content_preview: string;
};

export async function listRecentCompanyNotebookRecords(
  companyId: string,
  limit = 50,
): Promise<CompanyNotebookRecentRow[]> {

  const cid = rpcNullableTextParam(companyId);
  if (!cid) return [];

  const { data, error } = await supabase
    .from('company_records')
    .select('id, title, content, crop_id, source_type, created_at, visibility')
    .eq('company_id', cid)
    .eq('visibility', 'visible')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    throw new Error(error.message ?? 'Failed to load recent notes');
  }

  if (!Array.isArray(data)) return [];

  return data.map((row) => {
    const content = String((row as { content?: string }).content ?? '');
    const preview =
      content.length > 160 ? `${content.slice(0, 157)}…` : content;

    return {
      id: String((row as { id: string }).id),
      title: String((row as { title?: string }).title ?? ''),
      crop_id: String((row as { crop_id?: string }).crop_id ?? ''),
      source_type: String((row as { source_type?: string }).source_type ?? 'company'),
      created_at:
        (row as { created_at?: string | null }).created_at != null
          ? String((row as { created_at?: string | null }).created_at)
          : null,
      content_preview: preview,
    };
  });
}

export type ResolvedRecordCrop = {
  crop_id: string;
  crop_name: string;
  slug: string;
  is_global: boolean;
};

function looksLikeSlug(value: string): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  // Heuristic: our slugs are lowercase, often contain hyphens.
  // Accept raw ids too (e.g. "tomatoes").
  return v === v.toLowerCase() && !/\s/.test(v);
}

/**
 * Resolve a crop identifier that may be either:
 * - `crop_id` (slug like "french-beans")
 * - `crop_name` (display like "French Beans")
 *
 * This exists to keep crop note surfaces consistent when routes/params
 * accidentally pass names instead of slugs.
 */
export async function resolveRecordCrop(
  companyId: string,
  cropIdOrName: string,
): Promise<ResolvedRecordCrop | null> {
  const raw = (cropIdOrName ?? '').trim();
  if (!companyId || !raw) return null;

  // Source of truth for available crops in the notebook is the same RPC used for crop cards.
  // Never throw from this helper: it should be safe to use opportunistically.
  let crops: RecordCropCard[] = [];
  try {
    crops = await getCompanyRecordCrops(companyId);
  } catch (err) {
    console.warn('resolveRecordCrop: failed to load company record crops; skipping resolution', err);
    return null;
  }

  // Fast path: exact id match (slug/id).
  const byId = crops.find((c) => c.crop_id === raw);
  if (byId) return byId;

  // Heuristic: if it looks like a slug but not found, still try name match.
  const rawLower = raw.toLowerCase();
  const byName = crops.find((c) => (c.crop_name ?? '').trim().toLowerCase() === rawLower);
  if (byName) return byName;

  // Some routes might pass `slug` instead of `crop_id` (depending on DB shape); handle both.
  const bySlug = looksLikeSlug(raw) ? crops.find((c) => c.slug === raw) : undefined;
  return bySlug ?? null;
}

export async function createCompanyRecordCrop(companyId: string, name: string): Promise<void> {
  const id = rpcNullableTextParam(companyId);
  if (!id) {
    throw new Error('Company workspace is required.');
  }
  const nm = String(name ?? '').trim();
  if (!nm) {
    throw new Error('Crop name is required.');
  }
  const { error } = await recordsPublicRpc().rpc('create_company_record_crop', {
    p_company_id: id,
    p_name: nm,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to create crop');
  }
}

export async function getCropRecords(
  companyId: string,
  cropId: string,
  limit = 20,
  offset = 0,
): Promise<PagedCropRecordsResponse> {

  const cid = rpcNullableTextParam(companyId);
  const cCrop = rpcNullableTextParam(cropId);

  if (!cid || !cCrop) {
    console.warn('[records] blocked empty params', { cid, cCrop });
    return { rows: [], total: 0 };
  }

  console.log('[records] getCropRecords ->', { cid, cCrop });

  const { data, error } = await recordsPublicRpc().rpc('list_crop_records', {
    p_company_id: cid,
    p_crop_id: cCrop,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load crop records');
  }

  return normalisePagedResponse(data);
}

export async function getCropRecordDetail(recordId: string): Promise<CropRecordDetail | null> {
  const { data, error } = await recordsPublicRpc().rpc('get_crop_record_detail', {
    p_record_id: recordId,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to load record detail');
  }
  return normaliseRecordDetail(data);
}

const COMPANY_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject Clerk ids (`user_…`) and other junk before RPCs / inserts that cast company_id to uuid. */
function isNotebookTenantUuid(value: string | null | undefined): boolean {
  const t = String(value ?? '').trim();
  // Clerk ids look like `user_...` and will never be a valid UUID for company_id FK checks.
  // Be extra defensive: reject any value containing `_` (UUIDs never contain underscores).
  if (!t || t.includes('_') || t.toLowerCase().startsWith('user_')) return false;
  if (COMPANY_ID_UUID_RE.test(t)) return true;
  return /^[0-9a-f]{32}$/i.test(t);
}

async function verifyNotebookMembershipForCompany(
  clerkUserId: string,
  companyUuid: string,
): Promise<boolean> {
  const uid = String(clerkUserId ?? '').trim();
  const cid = String(companyUuid ?? '').trim();
  if (!uid || !isNotebookTenantUuid(cid)) return false;

  const { data: coreRow, error: coreErr } = await supabase
    .schema('core')
    .from('company_members')
    .select('company_id')
    .eq('clerk_user_id', uid)
    .eq('company_id', cid)
    .limit(1)
    .maybeSingle();

  if (!coreErr && coreRow?.company_id != null) {
    return true;
  }

  const { data: pubRow, error: pubErr } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', uid)
    .eq('company_id', cid)
    .limit(1)
    .maybeSingle();

  return !pubErr && pubRow?.company_id != null;
}

/** Same source as AuthContext / RLS session company (uuid text). */
async function resolveCompanyIdFromCurrentContextRpc(): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_context');
  if (error || data == null) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  const raw =
    row && typeof row === 'object' && 'company_id' in row
      ? (row as { company_id?: unknown }).company_id
      : null;
  const cid = raw != null ? String(raw).trim() : '';
  return isNotebookTenantUuid(cid) ? cid : null;
}

/**
 * RPCs such as create_company_crop_record need the tenant UUID (company_id), not Clerk user.id.
 * Resolve from membership: core.company_members (clerk_user_id), then public.company_members (user_id).
 * When preferredCompanyId is a UUID (active workspace), require a row for that company.
 */
async function resolveNotebookCompanyIdFromMembership(
  userId: string,
  preferredCompanyId?: string | null,
): Promise<string | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) {
    return null;
  }

  const prefRaw =
    preferredCompanyId != null ? String(preferredCompanyId).trim() : '';
  const pref = COMPANY_ID_UUID_RE.test(prefRaw) ? prefRaw : '';

  let qCore = supabase
    .schema('core')
    .from('company_members')
    .select('company_id')
    .eq('clerk_user_id', uid);
  if (pref) {
    qCore = qCore.eq('company_id', pref);
  }
  const { data: coreRow, error: coreErr } = await qCore
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (coreErr && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[records] core.company_members lookup failed', coreErr);
  }
  if (coreRow?.company_id != null) {
    return String(coreRow.company_id);
  }

  let qPub = supabase.from('company_members').select('company_id').eq('user_id', uid);
  if (pref) {
    qPub = qPub.eq('company_id', pref);
  }
  const { data: membership, error } = await qPub
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[records] company_members lookup failed', error);
    }
    return null;
  }

  if (membership?.company_id == null) {
    return null;
  }

  return String(membership.company_id);
}

export async function createCompanyCropRecord(
  clerkUserId: string,
  cropId: string,
  title: string,
  content: string,
  preferredCompanyId?: string | null,
): Promise<string> {
  const prefRaw = preferredCompanyId != null ? String(preferredCompanyId).trim() : '';

  // IMPORTANT:
  // Some environments have `company_records.company_id` as uuid, so Postgres will cast the RPC's text
  // value into uuid during insert. Never send Clerk ids like `user_...` here.
  //
  // For normal company-admin flows, pass null and let the RPC use public.current_company_id() (uuid)
  // from the session. For developer flows targeting a specific company, pass a verified UUID.
  let companyIdForRpc: string | null = null;
  if (isNotebookTenantUuid(prefRaw) && (await verifyNotebookMembershipForCompany(clerkUserId, prefRaw))) {
    companyIdForRpc = prefRaw;
  } else {
    companyIdForRpc = null;
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[records] create_company_crop_record RPC params', {
      preferredCompanyId: prefRaw || null,
      p_company_id: companyIdForRpc,
    });
  }

  const { data, error } = await recordsPublicRpc().rpc('create_company_crop_record', {
    p_company_id: companyIdForRpc,
    p_crop_id: rpcNullableTextParam(cropId),
    p_title: title,
    p_content: content,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to create record');
  }
  let recordId = '';
  if (!data) {
    recordId = '';
  } else if (typeof data === 'string') {
    recordId = data;
  } else if (Array.isArray(data)) {
    const first = data[0] as { record_id?: string } | undefined;
    recordId = first?.record_id ?? '';
  } else {
    const obj = data as { record_id?: string };
    recordId = obj.record_id ?? '';
  }

  // Best-effort: extract crop intelligence from the newly created note.
  // Errors here should not block record creation.
  try {
    await extractAndStoreCropIntelligenceFromText(cropId, content);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('extractAndStoreCropIntelligenceFromText (create) failed', err);
  }

  return recordId;
}

export async function updateCropRecord(
  recordId: string,
  title?: string,
  content?: string,
): Promise<void> {
  const { error } = await recordsPublicRpc().rpc('update_crop_record', {
    p_record_id: recordId,
    p_title: title ?? null,
    p_content: content ?? null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to update record');
  }

  // Best-effort: if updated content is provided, re-run intelligence extraction for this crop.
  if (content && content.trim()) {
    try {
      const detail = await getCropRecordDetail(recordId);
      if (detail && detail.crop_id) {
        await extractAndStoreCropIntelligenceFromText(detail.crop_id, content);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('extractAndStoreCropIntelligenceFromText (update) failed', err);
    }
  }
}

export async function addCropRecordAttachment(
  recordId: string,
  fileUrl: string,
  fileName?: string,
  fileType?: string,
): Promise<void> {
  const { error } = await recordsPublicRpc().rpc('add_crop_record_attachment', {
    p_record_id: recordId,
    p_file_url: fileUrl,
    p_file_name: fileName ?? null,
    p_file_type: fileType ?? null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to add attachment');
  }
}

// ------------------------------ Developer-side -----------------------------

export interface DeveloperRecordsFilter {
  companyId?: string | null;
  cropId?: string | null;
  sourceType?: 'company' | 'developer' | null;
  limit?: number;
  offset?: number;
}

export async function getDeveloperCropRecords(
  filters: DeveloperRecordsFilter = {},
): Promise<PagedCropRecordsResponse> {
  const {
    companyId = null,
    cropId = null,
    sourceType = null,
    limit = 20,
    offset = 0,
  } = filters;

  const devCid = rpcNullableTextParam(companyId);
  const devCrop = rpcNullableTextParam(cropId);

  // Always pass all parameters so PostgREST applies SQL defaults correctly for "all companies" (null).
  const { data, error } = await recordsPublicRpc().rpc('dev_list_crop_records', {
    p_limit: limit,
    p_offset: offset,
    p_company_id: devCid,
    p_crop_id: devCrop,
    p_source_type: sourceType,
  });

  if (error) {
    const meta = classifyRecordsRpcError(error);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[records] dev_list_crop_records failed', {
        kind: meta.kind,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        filters,
      });
    }
    const wrapped = new Error(error.message ?? 'Failed to load developer records') as RecordsServiceError;
    wrapped.recordsMeta = meta;
    throw wrapped;
  }
  return normalisePagedResponse(data);
}

/** All distinct notebook crops (companies + developer + canonical), developer-only RPC. */
export async function listDeveloperNotebookCropsAll(): Promise<{ crop_id: string; crop_name: string }[]> {
  const { data, error } = await recordsPublicRpc().rpc('dev_list_all_notebook_crops');
  if (error) {
    throw new Error(error.message ?? 'Failed to load notebook crops');
  }
  const rows = (Array.isArray(data) ? data : []) as { crop_id?: string; crop_name?: string | null }[];
  return rows
    .map((r) => ({
      crop_id: String(r.crop_id ?? '').trim(),
      crop_name: String(r.crop_name ?? r.crop_id ?? '').trim() || String(r.crop_id ?? ''),
    }))
    .filter((r) => r.crop_id.length > 0);
}

/** Developer / FarmVault template row (visible across dev dashboard; not a company record until pushed). */
export async function createDeveloperCropRecordTemplate(
  cropId: string,
  title: string,
  content: string,
): Promise<string> {
  const cid = String(cropId ?? '').trim();
  if (!cid) throw new Error('Crop is required');
  const { data, error } = await recordsPublicRpc().rpc('dev_create_crop_record_template', {
    p_crop_id: cid,
    p_title: title.trim(),
    p_content: content.trim(),
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to save developer note');
  }
  if (!data) return '';
  const obj = data as { record_id?: string };
  return obj.record_id ?? '';
}

export async function sendDeveloperCropRecordToCompany(
  companyId: string,
  cropId: string,
  title: string,
  content: string,
): Promise<string> {
  const { data, error } = await recordsPublicRpc().rpc('dev_send_crop_record_to_company', {
    p_company_id: rpcNullableTextParam(companyId),
    p_crop_id: rpcNullableTextParam(cropId),
    p_title: title,
    p_content: content,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to send note to company');
  }
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    const first = data[0] as { record_id?: string } | undefined;
    return first?.record_id ?? '';
  }
  const obj = data as { record_id?: string };
  return obj.record_id ?? '';
}

/** Create a developer-originated company record, then upload and link attachments. */
export async function sendDeveloperCropRecordToCompanyWithAttachments(
  companyId: string,
  cropId: string,
  title: string,
  content: string,
  files: File[],
): Promise<string> {
  const recordId = await sendDeveloperCropRecordToCompany(companyId, cropId, title, content);
  if (!recordId || files.length === 0) return recordId;

  for (const file of files) {
    const uploaded = await uploadRecordAttachment(file, 'developer', companyId, cropId, recordId);
    await addCropRecordAttachment(recordId, uploaded.fileUrl, uploaded.fileName, uploaded.fileType);
  }
  return recordId;
}

export async function getCropIntelligence(cropId: string): Promise<CropIntelligenceResponse | null> {

  const safeCrop = rpcNullableTextParam(cropId);
  if (!safeCrop) return null;

  const { data, error } = await recordsPublicRpc().rpc('get_crop_intelligence', {
    p_crop_id: safeCrop,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load crop intelligence');
  }

  if (!data) return null;
  if (Array.isArray(data)) {
    return (data[0] as CropIntelligenceResponse | undefined) ?? null;
  }

  return data as CropIntelligenceResponse;
}

export async function getCropRecordInsights(cropId: string): Promise<CropRecordInsightsResponse | null> {

  const safeCrop = rpcNullableTextParam(cropId);
  if (!safeCrop) return null;

  const { data, error } = await recordsPublicRpc().rpc('get_crop_record_insights', {
    p_crop_id: safeCrop,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load crop record insights');
  }

  if (!data) return null;

  return data as CropRecordInsightsResponse;
}

// ------------------------------ Crop Intelligence mutations ------------------

export type CropKnowledgeProfileForm = {
  maturityMinDays: number | null;
  maturityMaxDays: number | null;
  bestTimingNotes: string;
  harvestWindowNotes: string;
  seasonalNotes: string;
  fertilizerNotes: string;
  marketNotes: string;
  irrigationNotes: string;
  generalNotes: string;
};

export type CropKnowledgeChallengeForm = {
  challengeName: string;
  challengeType: 'pest' | 'disease' | 'seasonal' | 'climate' | 'market' | 'general';
  severity: 'low' | 'medium' | 'high' | 'critical' | '';
  notes: string;
};

export type CropKnowledgePracticeForm = {
  title: string;
  practiceType:
    | 'planting'
    | 'fertilizer'
    | 'foliar'
    | 'spray'
    | 'harvest'
    | 'irrigation'
    | 'timing'
    | 'general';
  notes: string;
};

export type CropKnowledgeChemicalForm = {
  chemicalName: string;
  purpose: string;
  dosage: string;
  stageNotes: string;
  phiNotes: string;
  mixNotes: string;
};

export type CropKnowledgeTimingWindowForm = {
  title: string;
  plantingStart: string;
  plantingEnd: string;
  harvestStart: string;
  harvestEnd: string;
  durationNotes: string;
  notes: string;
};

export async function upsertCropKnowledgeProfile(
  cropId: string,
  form: CropKnowledgeProfileForm,
): Promise<void> {
  const { error } = await recordsPublicRpc().rpc('upsert_crop_knowledge_profile', {
    p_crop_id: cropId,
    p_maturity_min_days: form.maturityMinDays,
    p_maturity_max_days: form.maturityMaxDays,
    p_best_timing_notes: form.bestTimingNotes || null,
    p_harvest_window_notes: form.harvestWindowNotes || null,
    p_seasonal_notes: form.seasonalNotes || null,
    p_fertilizer_notes: form.fertilizerNotes || null,
    p_market_notes: form.marketNotes || null,
    p_irrigation_notes: form.irrigationNotes || null,
    p_general_notes: form.generalNotes || null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to save crop profile');
  }
}

export async function addCropKnowledgeChallenge(
  cropId: string,
  form: CropKnowledgeChallengeForm,
): Promise<void> {
  const { error } = await recordsPublicRpc().rpc('add_crop_knowledge_challenge', {
    p_crop_id: cropId,
    p_challenge_name: form.challengeName,
    p_challenge_type: form.challengeType,
    p_severity: form.severity || null,
    p_notes: form.notes || null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to add challenge');
  }
}

export async function addCropKnowledgePractice(
  cropId: string,
  form: CropKnowledgePracticeForm,
): Promise<void> {
  const { error } = await recordsPublicRpc().rpc('add_crop_knowledge_practice', {
    p_crop_id: cropId,
    p_title: form.title,
    p_practice_type: form.practiceType,
    p_notes: form.notes || null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to add practice');
  }
}

export async function addCropKnowledgeChemical(
  cropId: string,
  form: CropKnowledgeChemicalForm,
): Promise<void> {
  const { error } = await recordsPublicRpc().rpc('add_crop_knowledge_chemical', {
    p_crop_id: cropId,
    p_chemical_name: form.chemicalName,
    p_purpose: form.purpose || null,
    p_dosage: form.dosage || null,
    p_stage_notes: form.stageNotes || null,
    p_phi_notes: form.phiNotes || null,
    p_mix_notes: form.mixNotes || null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to add chemical');
  }
}

export async function addCropKnowledgeTimingWindow(
  cropId: string,
  form: CropKnowledgeTimingWindowForm,
): Promise<void> {
  const { error } = await recordsPublicRpc().rpc('add_crop_knowledge_timing_window', {
    p_crop_id: cropId,
    p_title: form.title,
    p_planting_start: form.plantingStart || null,
    p_planting_end: form.plantingEnd || null,
    p_harvest_start: form.harvestStart || null,
    p_harvest_end: form.harvestEnd || null,
    p_duration_notes: form.durationNotes || null,
    p_notes: form.notes || null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to add timing window');
  }
}

// ------------------------------ Automatic Crop Intelligence extraction --------

type ParsedMaturity = {
  minDays: number | null;
  maxDays: number | null;
};

type ParsedChallenge = {
  name: string;
  type: CropKnowledgeChallengeForm['challengeType'];
  notes?: string;
};

type ParsedChemical = {
  name: string;
  dosage?: string;
  purposeOrStage?: string;
};

type ParsedPractice = {
  title: string;
  type: CropKnowledgePracticeForm['practiceType'];
  notes?: string;
};

type ParsedTimingWindow = {
  title: string;
  datePhrase: string;
};

function extractMaturityDays(text: string): ParsedMaturity | null {
  const lower = text.toLowerCase();
  // Patterns like "48-50 days" or "48 to 50 days"
  const rangeMatch =
    lower.match(/(\d{2,3})\s*(?:-|to|–)\s*(\d{2,3})\s*days/) ||
    lower.match(/maturity\s+(\d{2,3})\s*(?:-|to|–)\s*(\d{2,3})\s*days/);
  if (rangeMatch) {
    const min = Number.parseInt(rangeMatch[1], 10);
    const max = Number.parseInt(rangeMatch[2], 10);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { minDays: Math.min(min, max), maxDays: Math.max(min, max) };
    }
  }

  // Single value like "maturity 60 days"
  const singleMatch = lower.match(/maturity[^0-9]{0,10}(\d{2,3})\s*days/);
  if (singleMatch) {
    const days = Number.parseInt(singleMatch[1], 10);
    if (Number.isFinite(days)) {
      return { minDays: days, maxDays: days };
    }
  }

  return null;
}

function extractChallenges(text: string): ParsedChallenge[] {
  const lower = text.toLowerCase();
  const candidates: Array<[string, CropKnowledgeChallengeForm['challengeType']]> = [
    ['thrips', 'pest'],
    ['mites', 'pest'],
    ['caterpillars', 'pest'],
    ['powdery mildew', 'disease'],
    ['blight', 'disease'],
    ['high temperatures', 'climate'],
    ['heat stress', 'climate'],
    ['water scarcity', 'climate'],
    ['drought', 'climate'],
  ];

  const found: ParsedChallenge[] = [];
  const seen = new Set<string>();

  for (const [keyword, type] of candidates) {
    if (lower.includes(keyword)) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        name: keyword,
        type,
        notes: null as unknown as string | undefined,
      });
    }
  }

  return found;
}

function extractChemicals(text: string): ParsedChemical[] {
  const results: ParsedChemical[] = [];
  const lower = text.toLowerCase();

  // Simple list of known chemical name hints; keep conservative.
  const known = ['abamectin', 'carbendazim', 'metacop', 'tracer', 'thiovit'];

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    for (const chem of known) {
      if (!lineLower.includes(chem)) continue;

      // Try to grab dosage like "100ml per drum" or "50 g/acre"
      const dosageMatch = lineLower.match(
        /(\d+\.?\d*\s*(?:ml|l|litre|litres|g|kg)\s*(?:per|\/)\s*(?:acre|ha|hectare|drum|tank))/,
      );

      results.push({
        name: chem,
        dosage: dosageMatch ? dosageMatch[1] : undefined,
        purposeOrStage: undefined,
      });
    }
  }

  // De-duplicate by name + dosage within a single note.
  const deduped = new Map<string, ParsedChemical>();
  for (const c of results) {
    const key = `${c.name.toLowerCase()}::${(c.dosage ?? '').toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, c);
    }
  }

  return Array.from(deduped.values());
}

function extractPractices(text: string): ParsedPractice[] {
  const lower = text.toLowerCase();
  const results: ParsedPractice[] = [];

  const addIfPresent = (
    phrase: string,
    type: CropKnowledgePracticeForm['practiceType'],
    title: string,
  ) => {
    if (lower.includes(phrase)) {
      results.push({ title, type, notes: null as unknown as string | undefined });
    }
  };

  addIfPresent('weekly', 'general', 'Weekly routine practice');
  addIfPresent('every week', 'general', 'Weekly routine practice');
  addIfPresent('during flowering', 'timing', 'During flowering');
  addIfPresent('at flowering', 'timing', 'At flowering');
  addIfPresent('after germination', 'timing', 'After germination');
  addIfPresent('do not mix', 'spray', 'Mixing / compatibility caution');
  addIfPresent('do not tank mix', 'spray', 'Mixing / compatibility caution');

  const deduped = new Map<string, ParsedPractice>();
  for (const p of results) {
    const key = `${p.type}::${p.title.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, p);
    }
  }

  return Array.from(deduped.values());
}

function extractTimingWindows(text: string): ParsedTimingWindow[] {
  const results: ParsedTimingWindow[] = [];

  const monthNames =
    'january|february|march|april|may|june|july|august|september|october|november|december';
  const dateRegex = new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\b`, 'gi');

  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = dateRegex.exec(text)) !== null) {
    const phrase = match[0];
    results.push({
      title: 'Timing mentioned in notes',
      datePhrase: phrase,
    });
  }

  return results;
}

/**
 * Best-effort, deterministic extraction of crop intelligence from a free-text note.
 * This should be conservative: skip when in doubt, never invent values.
 */
export async function extractAndStoreCropIntelligenceFromText(
  cropId: string,
  content: string,
): Promise<void> {
  const text = (content ?? '').trim();
  if (!cropId || !text) return;

  const maturity = extractMaturityDays(text);
  const challenges = extractChallenges(text);
  const chemicals = extractChemicals(text);
  const practices = extractPractices(text);
  const timing = extractTimingWindows(text);

  // If nothing parsed, skip.
  if (!maturity && challenges.length === 0 && chemicals.length === 0 && practices.length === 0 && timing.length === 0) {
    return;
  }

  // Profile: only maturity for now.
  if (maturity) {
    const profileForm: CropKnowledgeProfileForm = {
      maturityMinDays: maturity.minDays,
      maturityMaxDays: maturity.maxDays,
      bestTimingNotes: '',
      harvestWindowNotes: '',
      seasonalNotes: '',
      fertilizerNotes: '',
      marketNotes: '',
      irrigationNotes: '',
      generalNotes: '',
    };
    try {
      await upsertCropKnowledgeProfile(cropId, profileForm);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('upsertCropKnowledgeProfile (auto) failed', err);
    }
  }

  // Challenges.
  for (const ch of challenges) {
    const form: CropKnowledgeChallengeForm = {
      challengeName: ch.name,
      challengeType: ch.type,
      severity: '',
      notes: ch.notes ?? '',
    };
    try {
      await addCropKnowledgeChallenge(cropId, form);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('addCropKnowledgeChallenge (auto) failed', ch.name, err);
    }
  }

  // Chemicals.
  for (const chem of chemicals) {
    const form: CropKnowledgeChemicalForm = {
      chemicalName: chem.name,
      purpose: chem.purposeOrStage ?? '',
      dosage: chem.dosage ?? '',
      stageNotes: '',
      phiNotes: '',
      mixNotes: '',
    };
    try {
      await addCropKnowledgeChemical(cropId, form);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('addCropKnowledgeChemical (auto) failed', chem.name, err);
    }
  }

  // Practices.
  for (const practice of practices) {
    const form: CropKnowledgePracticeForm = {
      title: practice.title,
      practiceType: practice.type,
      notes: practice.notes ?? '',
    };
    try {
      await addCropKnowledgePractice(cropId, form);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('addCropKnowledgePractice (auto) failed', practice.title, err);
    }
  }

  // Timing windows – we only store the date phrases as generic timing notes for now.
  for (const t of timing) {
    const form: CropKnowledgeTimingWindowForm = {
      title: t.title,
      plantingStart: '',
      plantingEnd: '',
      harvestStart: '',
      harvestEnd: '',
      durationNotes: '',
      notes: t.datePhrase,
    };
    try {
      await addCropKnowledgeTimingWindow(cropId, form);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('addCropKnowledgeTimingWindow (auto) failed', t.datePhrase, err);
    }
  }
}

export type RecordAttachmentMode = 'company' | 'developer';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'] as const;

export async function uploadRecordAttachment(
  file: File,
  mode: RecordAttachmentMode,
  companyId: string,
  cropId: string,
  recordId: string,
): Promise<{ fileUrl: string; fileName: string; fileType: string }> {
  const originalName = file.name || 'attachment';
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw new Error('Unsupported file type. Allowed: jpg, png, webp, pdf.');
  }

  const safeCompanyId = companyId || 'unknown-company';
  const safeCropId = cropId || 'unknown-crop';
  const prefix = mode === 'developer' ? 'developer-records' : 'company-records';
  const timestamp = Date.now();
  const path = `${prefix}/${safeCompanyId}/${safeCropId}/${recordId}/${timestamp}-${originalName}`;

  const { data, error } = await supabase.storage.from('record-notes').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to upload attachment');
  }

  const storedPath = data?.path ?? path;
  const { data: publicData } = supabase.storage.from('record-notes').getPublicUrl(storedPath);
  const publicUrl = publicData.publicUrl;

  return {
    fileUrl: publicUrl,
    fileName: originalName,
    fileType: file.type || `application/${ext}`,
  };
}