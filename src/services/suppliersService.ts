import { supabase } from '@/lib/supabase';
import { resolveCompanyIdForWrite } from '@/lib/tenant';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import type { Supplier } from '@/types';

const TABLE = 'suppliers';

/**
 * Row shape from PostgREST — some deployments have no `categories` column (only `category` TEXT).
 * We always persist multi-select as comma-separated `category` and read `categories` when present.
 */
type DbRow = Record<string, unknown> & {
  id: string;
  company_id: string;
  name: string;
  contact?: string | null;
  email?: string | null;
  category?: string | null;
  categories?: string[] | null;
  rating?: number | null;
  status?: string | null;
  review_notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

function parseCategoriesFromCategoryField(raw: string | null | undefined): string[] {
  if (raw == null || !String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function categoryListToDbValue(categories: string[] | null | undefined, single: string | null | undefined): string | null {
  if (categories && categories.length > 0) return categories.join(', ');
  if (single?.trim()) return single.trim();
  return null;
}

function toSupplier(row: DbRow): Supplier {
  const fromArray =
    Array.isArray(row.categories) && (row.categories as string[]).length > 0
      ? (row.categories as string[])
      : null;
  const parsed = fromArray ?? parseCategoriesFromCategoryField(row.category as string | null | undefined);

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    contact: String(row.contact ?? '').trim(),
    email: (row.email as string | null | undefined) ?? undefined,
    category: parsed[0] ?? (row.category as string | undefined) ?? undefined,
    categories: parsed.length > 0 ? parsed : undefined,
    rating: (row.rating as number | null | undefined) ?? 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    reviewNotes: (row.review_notes as string | null | undefined) ?? undefined,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}

/** Avoid listing columns that may be missing from older DBs (e.g. `categories`). */
function selectAll() {
  return '*';
}

/** PostgREST when the table cache has no such column (legacy DB). */
function missingColumnFromPgrst204(message: string): string | null {
  const m = message.match(/Could not find the '([^']+)' column/);
  return m ? m[1] : null;
}

const INSERT_REQUIRED_KEYS = new Set(['company_id', 'name']);

async function insertSupplierRow(payload: Record<string, unknown>) {
  let body = { ...payload };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await supabase.from(TABLE).insert(body).select(selectAll()).single();
    if (!error && data) return data as DbRow;
    const code = (error as { code?: string })?.code;
    const msg = String((error as { message?: string })?.message ?? '');
    if (code === 'PGRST204') {
      const col = missingColumnFromPgrst204(msg);
      if (col && Object.prototype.hasOwnProperty.call(body, col) && !INSERT_REQUIRED_KEYS.has(col)) {
        const next = { ...body };
        delete next[col];
        body = next;
        if (import.meta.env?.DEV) {
          console.warn(`[suppliers] insert: dropping unknown column "${col}" and retrying (run DB migration to add it)`);
        }
        continue;
      }
    }
    throw error;
  }
  throw new Error('[suppliers] insert: too many PGRST204 retries');
}

async function updateSupplierRow(
  supplierId: string,
  resolvedCompanyId: string,
  patchRow: Record<string, unknown>,
): Promise<DbRow> {
  let row = { ...patchRow };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (Object.keys(row).length === 0) {
      const { data: current, error: fetchErr } = await supabase
        .from(TABLE)
        .select(selectAll())
        .eq('id', supplierId)
        .eq('company_id', resolvedCompanyId)
        .single();
      if (fetchErr) throw fetchErr;
      return current as DbRow;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq('id', supplierId)
      .eq('company_id', resolvedCompanyId)
      .select(selectAll())
      .single();
    if (!error && data) return data as DbRow;
    const code = (error as { code?: string })?.code;
    const msg = String((error as { message?: string })?.message ?? '');
    if (code === 'PGRST204') {
      const col = missingColumnFromPgrst204(msg);
      if (col && Object.prototype.hasOwnProperty.call(row, col)) {
        const next = { ...row };
        delete next[col];
        row = next;
        if (import.meta.env?.DEV) {
          console.warn(`[suppliers] update: dropping unknown column "${col}" and retrying`);
        }
        continue;
      }
    }
    throw error;
  }
  throw new Error('[suppliers] update: too many PGRST204 retries');
}

export async function listSuppliers(companyId: string): Promise<Supplier[]> {
  if (import.meta.env?.DEV) {
    console.log('[suppliers] listSuppliers', { companyId, table: TABLE, select: '*' });
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select(selectAll())
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (import.meta.env?.DEV) {
    console.log('[suppliers] listSuppliers response', {
      table: TABLE,
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
  const categoryDb = categoryListToDbValue(input.categories ?? null, input.category ?? null);

  const payload: Record<string, unknown> = {
    company_id: companyId,
    name: input.name.trim(),
  };
  const c = input.contact?.trim();
  if (c) payload.contact = c;
  const e = input.email?.trim();
  if (e) payload.email = e;
  if (categoryDb) payload.category = categoryDb;
  payload.rating = input.rating ?? 0;
  payload.status = input.status ?? 'active';
  const rn = input.reviewNotes?.trim();
  if (rn) payload.review_notes = rn;

  if (import.meta.env?.DEV) {
    console.log('[suppliers] createSupplier', { table: TABLE, payload });
  }

  let data: DbRow;
  try {
    data = await insertSupplierRow(payload);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      const normalizedName = input.name.trim();
      const { data: existing } = await supabase
        .from(TABLE)
        .select(selectAll())
        .eq('company_id', companyId)
        .ilike('name', normalizedName)
        .maybeSingle();
      if (existing) {
        return toSupplier(existing as DbRow);
      }
    }
    if (import.meta.env?.DEV) {
      console.warn('[suppliers] createSupplier error', {
        message: (error as { message?: string })?.message,
      });
    }
    throw error;
  }
  if (import.meta.env?.DEV) {
    console.log('[suppliers] createSupplier response', { data });
  }
  const created = toSupplier(data);
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
  if (patch.category !== undefined || patch.categories !== undefined) {
    row.category = categoryListToDbValue(patch.categories ?? null, patch.category ?? null);
  }
  if (patch.rating !== undefined) row.rating = Math.round(patch.rating);
  if (patch.reviewNotes !== undefined) {
    row.review_notes = patch.reviewNotes?.trim() || null;
  }
  if (patch.status !== undefined) row.status = patch.status;

  const data = await updateSupplierRow(supplierId, resolvedCompanyId, row);
  return toSupplier(data);
}
