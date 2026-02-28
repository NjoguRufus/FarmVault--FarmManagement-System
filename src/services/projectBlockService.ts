import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ProjectBlock } from '@/types';

const COLLECTION = 'projectBlocks';

export interface CreateBlockInput {
  companyId: string;
  projectId: string;
  blockName: string;
  acreage: number;
  plantingDate: Date;
  expectedEndDate?: Date;
  currentStage?: string;
  seasonProgress?: number;
}

export async function createProjectBlock(input: CreateBlockInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    companyId: input.companyId,
    projectId: input.projectId,
    blockName: input.blockName.trim(),
    acreage: Number(input.acreage) || 0,
    plantingDate: input.plantingDate ? Timestamp.fromDate(input.plantingDate) : null,
    expectedEndDate: input.expectedEndDate
      ? Timestamp.fromDate(input.expectedEndDate)
      : null,
    currentStage: input.currentStage ?? null,
    seasonProgress: input.seasonProgress ?? 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getProjectBlocks(
  companyId: string,
  projectId: string
): Promise<ProjectBlock[]> {
  const q = query(
    collection(db, COLLECTION),
    where('companyId', '==', companyId),
    where('projectId', '==', projectId),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt,
  })) as ProjectBlock[];
}
