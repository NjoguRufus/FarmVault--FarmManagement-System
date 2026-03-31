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
import { supabase } from '@/lib/supabase';
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

// ---------------------------------------------------------------------------
// Supabase-backed Farm Notebook / Records (company + developer)
// ---------------------------------------------------------------------------

export type RecordCropCard = {
  crop_id: string;
  crop_name: string;
  slug: string;
  is_global: boolean;
  records_count: number;
  last_updated_at: string | null;
};

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

export async function getCompanyRecordCrops(companyId: string): Promise<RecordCropCard[]> {
  const { data, error } = await supabase.rpc('list_company_record_crops', {
    p_company_id: companyId,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to load record crops');
  }
  return (data as RecordCropCard[] | null) ?? [];
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
  const { error } = await supabase.rpc('create_company_record_crop', {
    p_company_id: companyId,
    p_name: name,
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
  const { data, error } = await supabase.rpc('list_crop_records', {
    p_company_id: companyId,
    p_crop_id: cropId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to load crop records');
  }
  return normalisePagedResponse(data);
}

export async function getCropRecordDetail(recordId: string): Promise<CropRecordDetail | null> {
  const { data, error } = await supabase.rpc('get_crop_record_detail', {
    p_record_id: recordId,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to load record detail');
  }
  return normaliseRecordDetail(data);
}

export async function createCompanyCropRecord(
  companyId: string,
  cropId: string,
  title: string,
  content: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_company_crop_record', {
    p_company_id: companyId,
    p_crop_id: cropId,
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
  const { error } = await supabase.rpc('update_crop_record', {
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
  const { error } = await supabase.rpc('add_crop_record_attachment', {
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

  const { data, error } = await supabase.rpc('dev_list_crop_records', {
    p_company_id: companyId,
    p_crop_id: cropId,
    p_source_type: sourceType,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load developer records');
  }
  return normalisePagedResponse(data);
}

export async function sendDeveloperCropRecordToCompany(
  companyId: string,
  cropId: string,
  title: string,
  content: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('dev_send_crop_record_to_company', {
    p_company_id: companyId,
    p_crop_id: cropId,
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

export async function getCropIntelligence(cropId: string): Promise<CropIntelligenceResponse | null> {
  const { data, error } = await supabase.rpc('get_crop_intelligence', {
    p_crop_id: cropId,
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
  const { data, error } = await supabase.rpc('get_crop_record_insights', {
    p_crop_id: cropId,
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
  const { error } = await supabase.rpc('upsert_crop_knowledge_profile', {
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
  const { error } = await supabase.rpc('add_crop_knowledge_challenge', {
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
  const { error } = await supabase.rpc('add_crop_knowledge_practice', {
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
  const { error } = await supabase.rpc('add_crop_knowledge_chemical', {
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
  const { error } = await supabase.rpc('add_crop_knowledge_timing_window', {
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
