import { supabase } from '@/lib/supabase';
import { resolveCompanyIdForWrite } from '@/lib/tenant';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import type { Supplier } from '@/types';

const TABLE = 'suppliers';

/** Matches public.suppliers (see supabase/migrations/20260310120000_fix_season_challenges_and_suppliers.sql). */
type DbRow = {
  id: string;
  company_id: string;
  name: string;
  contact: string | null;
  email: string | null;
  category: string | null;
  categories: string[] | null;
  rating: number | null;
  status: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  'id,company_id,name,contact,email,category,categories,rating,status,review_notes,created_at,updated_at' as const;

function toSupplier(row: DbRow): Supplier {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    contact: (row.contact ?? '').trim(),
    email: row.email ?? undefined,
    category: row.category ?? undefined,
    categories: row.categories ?? undefined,
    rating: row.rating ?? 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    reviewNotes: row.review_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSuppliers(companyId: string): Promise<Supplier[]> {
  if (import.meta.env?.DEV) {
    console.log('[suppliers] listSuppliers', {
      companyId,
      schema: 'public',
      table: TABLE,
      select: SELECT_COLUMNS,
    });
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (import.meta.env?.DEV) {
    console.log('[suppliers] listSuppliers response', {
      table: TABLE,
      schema: 'public',
      error,
      rows: Array.isArray(data) ? data.length : null,
    });
  }
  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[suppliers] listSuppliers error', { message: error.message });
    }
    throw error;
  }
  return (data ?? []).map((r) => toSupplier(r as DbRow));
}

export async function createSupplier(input: {
  companyId: string;
  name: string;
  contact?: string;
  email?: string;
  category?: string | null;
  categories?: string[] | null;
  rating?: number;
  status?: string;
  reviewNotes?: string | null;
}): Promise<Supplier> {
  const companyId = await resolveCompanyIdForWrite(input.companyId);
  const categories =
    input.categories && input.categories.length > 0 ? input.categories : null;
  const primaryCategory =
    input.category?.trim() ||
    (categories && categories.length ? categories[0] : null) ||
    null;

  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    contact: input.contact?.trim() || null,
    email: input.email?.trim() || null,
    category: primaryCategory,
    categories,
    rating: input.rating ?? 0,
    status: input.status ?? 'active',
    review_notes: input.reviewNotes?.trim() || null,
  };

  if (import.meta.env?.DEV) {
    console.log('[suppliers] createSupplier', { schema: 'public', table: TABLE, payload });
  }

  const { data, error } = await supabase.from(TABLE).insert(payload).select(SELECT_COLUMNS).single();
  if (import.meta.env?.DEV) {
    console.log('[suppliers] createSupplier response', {
      table: TABLE,
      schema: 'public',
      error,
      data,
    });
  }
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      const normalizedName = input.name.trim();
      const { data: existing } = await supabase
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq('company_id', companyId)
        .ilike('name', normalizedName)
        .maybeSingle();
      if (existing) {
        return toSupplier(existing as DbRow);
      }
    }
    if (import.meta.env?.DEV) {
      console.warn('[suppliers] createSupplier error', { message: error.message });
    }
    throw error;
  }
  const created = toSupplier(data as DbRow);
  captureEvent(AnalyticsEvents.SUPPLIER_CREATED, {
    company_id: companyId,
    supplier_id: created.id,
    module_name: 'projects',
  });
  return created;
}

export async function updateSupplier(
  companyId: string,
  supplierId: string,
  patch: {
    name?: string;
    contact?: string | null;
    email?: string | null;
    category?: string | null;
    categories?: string[] | null;
    rating?: number;
    reviewNotes?: string | null;
    status?: string | null;
  },
): Promise<Supplier> {
  const resolvedCompanyId = await resolveCompanyIdForWrite(companyId);
  const row: Record<string, unknown> = {};

  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.contact !== undefined) row.contact = patch.contact?.trim() || null;
  if (patch.email !== undefined) row.email = patch.email?.trim() || null;
  if (patch.category !== undefined) row.category = patch.category?.trim() || null;
  if (patch.categories !== undefined) {
    row.categories = patch.categories.length > 0 ? patch.categories : null;
  }
  if (patch.rating !== undefined) row.rating = Math.round(patch.rating);
  if (patch.reviewNotes !== undefined) {
    row.review_notes = patch.reviewNotes?.trim() || null;
  }
  if (patch.status !== undefined) row.status = patch.status;

  if (Object.keys(row).length === 0) {
    const { data: current, error: fetchErr } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq('id', supplierId)
      .eq('company_id', resolvedCompanyId)
      .single();
    if (fetchErr) throw fetchErr;
    return toSupplier(current as DbRow);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq('id', supplierId)
    .eq('company_id', resolvedCompanyId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[suppliers] updateSupplier error', { message: error.message });
    }
    throw error;
  }
  return toSupplier(data as DbRow);
}
