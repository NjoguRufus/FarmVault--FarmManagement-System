import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ChallengeTemplate, ChallengeTemplatePhase } from '@/types';

const COLLECTION = 'challengeTemplates';

function slug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

/** Deterministic doc id for upsert: companyId_cropType_preseason_slug(title) */
export function getChallengeTemplateId(
  companyId: string,
  cropType: string,
  phase: string,
  title: string
): string {
  const safeCrop = String(cropType).replace(/\s/g, '_');
  return `${companyId}_${safeCrop}_${phase}_${slug(title)}`;
}

export interface UpsertChallengeTemplateInput {
  companyId: string;
  cropType: string;
  phase: ChallengeTemplatePhase;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  defaultDueOffsetDays?: number;
  createdBy: string;
  whatWasDone?: string;
  plan2IfFails?: string;
  itemsUsedSummary?: string;
}

/** Create or update template (merge). Uses deterministic id to prevent duplicates. */
export async function upsertChallengeTemplate(input: UpsertChallengeTemplateInput): Promise<string> {
  const id = getChallengeTemplateId(input.companyId, input.cropType, input.phase, input.title);
  const ref = doc(db, COLLECTION, id);
  await setDoc(
    ref,
    {
      companyId: input.companyId,
      cropType: input.cropType,
      phase: input.phase,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      priority: input.priority ?? 'medium',
      defaultDueOffsetDays: input.defaultDueOffsetDays ?? null,
      isReusable: true,
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      whatWasDone: (input.whatWasDone ?? '').trim() || null,
      plan2IfFails: (input.plan2IfFails ?? '').trim() || null,
      itemsUsedSummary: (input.itemsUsedSummary ?? '').trim() || null,
    },
    { merge: true }
  );
  return id;
}

/** Fetch templates for company + crop + phase. orderBy createdAt desc. */
export async function getChallengeTemplates(
  companyId: string,
  cropType: string,
  phase: ChallengeTemplatePhase
): Promise<(ChallengeTemplate & { id: string })[]> {
  const q = query(
    collection(db, COLLECTION),
    where('companyId', '==', companyId),
    where('cropType', '==', cropType),
    where('phase', '==', phase),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChallengeTemplate & { id: string }));
}
