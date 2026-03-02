import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  writeBatch,
  documentId,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { LibraryNote, CompanyNote, CompanyNoteShare, CropDoc } from '@/types';
import type { NoteCategory } from '@/types';

const CROPS = 'crops';
const NOTES_LIBRARY = 'notes_library';
const COMPANY_NOTE_SHARES = 'company_note_shares';
const COMPANY_NOTES = 'company_notes';

// ---------- Crops ----------

export async function getCrops(): Promise<CropDoc[]> {
  const snap = await getDocs(collection(db, CROPS));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CropDoc));
}

export async function seedCrop(cropId: string, name: string): Promise<void> {
  const ref = doc(db, CROPS, cropId);
  await setDoc(ref, { name, createdAt: serverTimestamp() }, { merge: true });
}

export async function createCropIfMissing(cropId: string, name: string): Promise<void> {
  const ref = doc(db, CROPS, cropId);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, { name, createdAt: serverTimestamp() });
  }
}

// ---------- Notes library (developer only) ----------

export interface CreateLibraryNoteInput {
  cropId: string;
  category: NoteCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  status: 'draft' | 'published';
  createdBy: string;
}

export async function createLibraryNote(input: CreateLibraryNoteInput): Promise<string> {
  const ref = await addDoc(collection(db, NOTES_LIBRARY), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLibraryNote(
  noteId: string,
  data: Partial<CreateLibraryNoteInput>
): Promise<void> {
  const ref = doc(db, NOTES_LIBRARY, noteId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export async function deleteLibraryNote(noteId: string): Promise<void> {
  await deleteDoc(doc(db, NOTES_LIBRARY, noteId));
}

export async function getLibraryNotes(cropId?: string): Promise<(LibraryNote & { id: string })[]> {
  let q = query(
    collection(db, NOTES_LIBRARY),
    orderBy('updatedAt', 'desc'),
    limit(500)
  );
  if (cropId) {
    q = query(
      collection(db, NOTES_LIBRARY),
      where('cropId', '==', cropId),
      orderBy('updatedAt', 'desc'),
      limit(200)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryNote & { id: string }));
}

// ---------- Company notes ----------

export interface CreateCompanyNoteInput {
  companyId: string;
  cropId: string;
  category: NoteCategory;
  title: string;
  content: string;
  highlights: string[];
  tags: string[];
  createdBy: string;
}

export async function createCompanyNote(input: CreateCompanyNoteInput): Promise<string> {
  const ref = await addDoc(collection(db, COMPANY_NOTES), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCompanyNote(
  noteId: string,
  data: Partial<Omit<CreateCompanyNoteInput, 'companyId'>>,
  companyId: string
): Promise<void> {
  const ref = doc(db, COMPANY_NOTES, noteId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export async function deleteCompanyNote(noteId: string): Promise<void> {
  await deleteDoc(doc(db, COMPANY_NOTES, noteId));
}

export async function getCompanyNotes(companyId: string, cropId?: string): Promise<(CompanyNote & { id: string })[]> {
  let q = query(
    collection(db, COMPANY_NOTES),
    where('companyId', '==', companyId),
    orderBy('updatedAt', 'desc'),
    limit(200)
  );
  if (cropId) {
    q = query(
      collection(db, COMPANY_NOTES),
      where('companyId', '==', companyId),
      where('cropId', '==', cropId),
      orderBy('updatedAt', 'desc'),
      limit(200)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyNote & { id: string }));
}

/** Paginated company notes for faster initial load. orderBy createdAt desc, limit 30, Load more via lastDoc. */
export async function getCompanyNotesPaginated(
  companyId: string,
  cropId: string | undefined,
  pageSize: number,
  lastDoc: DocumentSnapshot | null
): Promise<{ notes: (CompanyNote & { id: string })[]; lastDoc: DocumentSnapshot | null }> {
  if (cropId) {
    const q = lastDoc
      ? query(
          collection(db, COMPANY_NOTES),
          where('companyId', '==', companyId),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(pageSize)
        )
      : query(
          collection(db, COMPANY_NOTES),
          where('companyId', '==', companyId),
          where('cropId', '==', cropId),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyNote & { id: string }));
    const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { notes, lastDoc: last };
  }
  const q = lastDoc
    ? query(
        collection(db, COMPANY_NOTES),
        where('companyId', '==', companyId),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      )
    : query(
        collection(db, COMPANY_NOTES),
        where('companyId', '==', companyId),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
  const snap = await getDocs(q);
  const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyNote & { id: string }));
  const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return { notes, lastDoc: last };
}

/** Developer: get all company notes (all companies). */
export async function getAllCompanyNotes(cropId?: string): Promise<(CompanyNote & { id: string; companyName?: string })[]> {
  let q = query(
    collection(db, COMPANY_NOTES),
    orderBy('updatedAt', 'desc'),
    limit(300)
  );
  if (cropId) {
    q = query(
      collection(db, COMPANY_NOTES),
      where('cropId', '==', cropId),
      orderBy('updatedAt', 'desc'),
      limit(200)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyNote & { id: string; companyName?: string }));
}

// ---------- Company note shares ----------

export async function getSharesForCompany(companyId: string): Promise<(CompanyNoteShare & { id: string })[]> {
  const snap = await getDocs(
    query(
      collection(db, COMPANY_NOTE_SHARES),
      where('companyId', '==', companyId),
      where('visibility', '==', 'visible'),
      limit(500)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyNoteShare & { id: string }));
}

export async function getShareByCompanyAndNote(companyId: string, noteId: string): Promise<(CompanyNoteShare & { id: string }) | null> {
  const snap = await getDocs(
    query(
      collection(db, COMPANY_NOTE_SHARES),
      where('companyId', '==', companyId),
      where('noteId', '==', noteId),
      limit(1)
    )
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as CompanyNoteShare & { id: string };
}

/** Upsert share: create or update (enforce uniqueness companyId + noteId). */
export async function upsertShare(params: {
  companyId: string;
  noteId: string;
  cropId: string;
  sharedBy: string;
  visibility?: 'visible' | 'hidden';
  pinned?: boolean;
}): Promise<string> {
  const existing = await getShareByCompanyAndNote(params.companyId, params.noteId);
  const payload = {
    companyId: params.companyId,
    noteId: params.noteId,
    cropId: params.cropId,
    sharedBy: params.sharedBy,
    sharedAt: serverTimestamp(),
    visibility: params.visibility ?? 'visible',
    pinned: params.pinned ?? false,
  };
  if (existing) {
    await updateDoc(doc(db, COMPANY_NOTE_SHARES, existing.id), payload);
    return existing.id;
  }
  const ref = await addDoc(collection(db, COMPANY_NOTE_SHARES), payload);
  return ref.id;
}

export async function shareNotesToCompany(params: {
  companyId: string;
  noteIds: string[];
  sharedBy: string;
  getCropIdForNote: (noteId: string) => string;
}): Promise<void> {
  const batch = writeBatch(db);
  for (const noteId of params.noteIds) {
    const cropId = params.getCropIdForNote(noteId);
    const existing = await getShareByCompanyAndNote(params.companyId, noteId);
    const data = {
      companyId: params.companyId,
      noteId,
      cropId,
      sharedBy: params.sharedBy,
      sharedAt: serverTimestamp(),
      visibility: 'visible' as const,
      pinned: false,
    };
    if (existing) {
      batch.update(doc(db, COMPANY_NOTE_SHARES, existing.id), data);
    } else {
      const ref = doc(collection(db, COMPANY_NOTE_SHARES));
      batch.set(ref, data);
    }
  }
  await batch.commit();
}

export async function getLibraryNote(noteId: string): Promise<(LibraryNote & { id: string }) | null> {
  const snap = await getDoc(doc(db, NOTES_LIBRARY, noteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as LibraryNote & { id: string };
}

/** For company admin: fetch library notes that have been shared to this company. */
export async function getSharedLibraryNotesForCompany(companyId: string): Promise<(LibraryNote & { id: string })[]> {
  try {
    const shares = await getSharesForCompany(companyId);
    if (!shares.length) return [];

    const noteIds = shares.map((s) => s.noteId).filter(Boolean);
    if (noteIds.length === 0) return [];

    // Firestore "in" queries are limited to 10 IDs per query.
    const chunks: string[][] = [];
    for (let i = 0; i < noteIds.length; i += 10) {
      chunks.push(noteIds.slice(i, i + 10));
    }

    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, NOTES_LIBRARY),
            where(documentId(), 'in', chunk)
          )
        )
      )
    );

    const notesById = new Map<string, LibraryNote & { id: string }>();
    for (const snap of snaps) {
      for (const d of snap.docs) {
        notesById.set(d.id, { id: d.id, ...d.data() } as LibraryNote & { id: string });
      }
    }

    // Preserve the original share ordering where possible.
    return noteIds
      .map((id) => notesById.get(id))
      .filter((n): n is LibraryNote & { id: string } => !!n);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('getSharedLibraryNotesForCompany failed', err);
    }
    throw err;
  }
}

export async function getCompanyNote(noteId: string): Promise<(CompanyNote & { id: string }) | null> {
  const snap = await getDoc(doc(db, COMPANY_NOTES, noteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CompanyNote & { id: string };
}
