import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@/lib/firestore-stub';
import { db } from '@/lib/firebase';
import { normalizeCropTypeKey, type CropCatalogDoc, type CropKnowledge } from '@/knowledge/cropCatalog';

const CROP_CATALOG_COLLECTION = 'cropCatalog';
let hasLoggedCropCatalogPermissionError = false;

type CropCatalogCallback = (data: CropCatalogDoc[]) => void;

type AddCropInput = Omit<CropKnowledge, 'id'> & { id?: string };
type UpdateCropInput = Partial<Omit<CropKnowledge, 'id'>> & { companyId: string };

function mapCropDoc(id: string, data: any): CropCatalogDoc {
  return {
    id,
    companyId: String(data.companyId || ''),
    cropTypeKey: String(data.cropTypeKey || ''),
    displayName: String(data.displayName || ''),
    category: data.category === 'field_crop' ? 'field_crop' : 'horticulture',
    baseCycleDays: Number(data.baseCycleDays || 0),
    supportsEnvironment: Boolean(data.supportsEnvironment),
    environmentModifiers: {
      open_field: {
        dayAdjustment: Number(data.environmentModifiers?.open_field?.dayAdjustment || 0),
      },
      ...(data.environmentModifiers?.greenhouse
        ? {
            greenhouse: {
              dayAdjustment: Number(data.environmentModifiers.greenhouse.dayAdjustment || 0),
            },
          }
        : {}),
    },
    stages: Array.isArray(data.stages)
      ? data.stages.map((stage: any) => ({
          key: String(stage.key || ''),
          label: String(stage.label || ''),
          baseDayStart: Number(stage.baseDayStart || 0),
          baseDayEnd: Number(stage.baseDayEnd || 0),
        }))
      : [],
  };
}

export function subscribeCropCatalog(companyId: string, onData: CropCatalogCallback) {
  if (!companyId) {
    onData([]);
    return () => undefined;
  }

  const q = query(
    collection(db, CROP_CATALOG_COLLECTION),
    where('companyId', '==', companyId),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      hasLoggedCropCatalogPermissionError = false;
      const rows = snapshot.docs.map((d) => mapCropDoc(d.id, d.data()));
      onData(rows);
    },
    (error) => {
      const code = String((error as { code?: string } | null)?.code || '');
      if (code === 'permission-denied') {
        if (!hasLoggedCropCatalogPermissionError) {
          hasLoggedCropCatalogPermissionError = true;
          console.warn(
            'Crop catalog access denied by Firestore rules. Showing built-in crops only.',
          );
        }
      } else {
        console.error('Failed to subscribe crop catalog:', error);
      }
      onData([]);
    },
  );
}

export async function addCropToCatalog(companyId: string, data: AddCropInput) {
  if (!companyId) throw new Error('companyId is required.');
  const normalizedCropTypeKey = normalizeCropTypeKey(data.cropTypeKey);
  if (!normalizedCropTypeKey) throw new Error('cropTypeKey is required.');

  const payload = {
    ...data,
    cropTypeKey: normalizedCropTypeKey,
    id: data.id || normalizedCropTypeKey,
    companyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, CROP_CATALOG_COLLECTION), payload);
  return ref.id;
}

export async function updateCropInCatalog(docId: string, data: UpdateCropInput) {
  if (!docId) throw new Error('docId is required.');
  if (!data.companyId) throw new Error('companyId is required for update.');

  const ref = doc(db, CROP_CATALOG_COLLECTION, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Crop catalog entry not found.');

  const existingCompanyId = String(snap.data()?.companyId || '');
  if (existingCompanyId !== data.companyId) {
    throw new Error('Company mismatch. Update denied.');
  }

  const { companyId: _, ...rest } = data;
  const updates: Record<string, unknown> = {};
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined) {
      if (key === 'cropTypeKey') {
        const normalized = normalizeCropTypeKey(String(value || ''));
        if (!normalized) return;
        updates[key] = normalized;
        return;
      }
      updates[key] = value;
    }
  });
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCropFromCatalog(docId: string, companyId?: string) {
  if (!docId) throw new Error('docId is required.');

  const ref = doc(db, CROP_CATALOG_COLLECTION, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Crop catalog entry not found.');
  const existingCompanyId = String(snap.data()?.companyId || '');
  if (!existingCompanyId) throw new Error('Invalid crop catalog entry: missing companyId.');
  if (companyId && existingCompanyId !== companyId) {
    throw new Error('Company mismatch. Delete denied.');
  }

  await deleteDoc(ref);
}
