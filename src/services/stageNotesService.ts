import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { StageNote } from '@/types';

const COLLECTION = 'stageNotes';

export async function addStageNote(params: {
  companyId: string;
  projectId: string;
  stageId: string;
  text: string;
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    companyId: params.companyId,
    projectId: params.projectId,
    stageId: params.stageId,
    text: params.text.trim(),
    createdAt: serverTimestamp(),
    createdBy: params.createdBy,
  });
  return ref.id;
}

/** Fetch stage notes, most recent first. limit 10, pagination via lastDoc. */
export async function getStageNotes(
  companyId: string,
  projectId: string,
  stageId: string,
  pageSize: number,
  lastDoc: DocumentSnapshot | null
): Promise<{ notes: (StageNote & { id: string })[]; lastDoc: DocumentSnapshot | null }> {
  const q = lastDoc
    ? query(
        collection(db, COLLECTION),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
        where('stageId', '==', stageId),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      )
    : query(
        collection(db, COLLECTION),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
        where('stageId', '==', stageId),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
  const snap = await getDocs(q);
  const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StageNote & { id: string }));
  const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return { notes, lastDoc: last };
}
