/**
 * Company custom crops — Supabase `public.record_crop_catalog`.
 * Merged with built-ins in `useCropCatalog` for project creation and dashboards.
 */

import { supabase } from '@/lib/supabase';
import { db, requireCompanyId } from '@/lib/db';
import {
  buildCustomCropTemplateForCatalog,
  normalizeCropTypeKey,
  type CropCatalogDoc,
  type CropKnowledge,
} from '@/knowledge/cropCatalog';

type CropCatalogCallback = (data: CropCatalogDoc[]) => void;

type AddCropInput = Omit<CropKnowledge, 'id'> & { id?: string };
type UpdateCropInput = Partial<Omit<CropKnowledge, 'id'>> & { companyId: string };

function mapRowToCropCatalogDoc(row: {
  id: string;
  name: string;
  slug: string;
  company_id: string | null;
}): CropCatalogDoc {
  const cropTypeKey = normalizeCropTypeKey(row.slug);
  const name = String(row.name ?? '').trim();
  const tmpl = buildCustomCropTemplateForCatalog(name || cropTypeKey.replace(/_/g, ' '), cropTypeKey);
  return {
    id: row.id,
    companyId: String(row.company_id ?? ''),
    ...tmpl,
    displayName: name || tmpl.displayName,
    cropTypeKey,
  };
}

async function fetchCompanyCropCatalog(companyId: string): Promise<CropCatalogDoc[]> {
  const { data, error } = await db
    .public()
    .from('record_crop_catalog')
    .select('id,name,slug,company_id,created_at')
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) {
    console.error('[cropCatalog] fetch failed', error);
    return [];
  }
  return ((data ?? []) as { id: string; name: string; slug: string; company_id: string | null }[]).map(
    mapRowToCropCatalogDoc,
  );
}

/**
 * Subscribe to this company's custom crops (initial fetch + Supabase Realtime).
 */
export function subscribeCropCatalog(companyId: string, onData: CropCatalogCallback): () => void {
  if (!companyId) {
    onData([]);
    return () => undefined;
  }

  let cancelled = false;

  const push = (rows: CropCatalogDoc[]) => {
    if (!cancelled) onData(rows);
  };

  void (async () => {
    push(await fetchCompanyCropCatalog(companyId));
  })();

  const channel = supabase
    .channel(`record_crop_catalog:${companyId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'record_crop_catalog',
        filter: `company_id=eq.${companyId}`,
      },
      () => {
        void (async () => {
          push(await fetchCompanyCropCatalog(companyId));
        })();
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

function slugFromNormalizedCropKey(normalizedKey: string): string {
  return normalizedKey.replace(/_/g, '-');
}

export async function addCropToCatalog(companyId: string, data: AddCropInput): Promise<string> {
  const tenant = requireCompanyId(companyId);
  const normalizedCropTypeKey = normalizeCropTypeKey(data.cropTypeKey);
  if (!normalizedCropTypeKey) throw new Error('cropTypeKey is required.');

  const displayName = (data.displayName ?? '').trim() || normalizedCropTypeKey.replace(/_/g, ' ');
  const slug = slugFromNormalizedCropKey(normalizedCropTypeKey);

  const { data: row, error } = await db
    .public()
    .from('record_crop_catalog')
    .insert({
      company_id: tenant,
      name: displayName,
      slug,
      created_by: 'user',
    })
    .select('id')
    .single();

  if (error) throw error;
  const id = String((row as { id?: string })?.id ?? '');
  if (!id) throw new Error('Insert succeeded but no id was returned.');
  return id;
}

export async function updateCropInCatalog(docId: string, data: UpdateCropInput): Promise<void> {
  if (!docId) throw new Error('docId is required.');
  const tenant = requireCompanyId(data.companyId);

  const patch: Record<string, unknown> = {};
  if (data.displayName !== undefined) patch.name = String(data.displayName).trim();
  if (data.cropTypeKey !== undefined) {
    const n = normalizeCropTypeKey(data.cropTypeKey);
    if (!n) throw new Error('Invalid cropTypeKey.');
    patch.slug = slugFromNormalizedCropKey(n);
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await db
    .public()
    .from('record_crop_catalog')
    .update(patch)
    .eq('id', docId)
    .eq('company_id', tenant);
  if (error) throw error;
}

export async function deleteCropFromCatalog(docId: string, companyId: string): Promise<void> {
  if (!docId) throw new Error('docId is required.');
  const tenant = requireCompanyId(companyId);
  const { error } = await db.public().from('record_crop_catalog').delete().eq('id', docId).eq('company_id', tenant);
  if (error) throw error;
}
