import { supabase } from '@/lib/supabase';
import type { Supplier } from '@/types';

const TABLE = 'suppliers';

type DbRow = {
  id: string;
  company_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toSupplier(row: DbRow): Supplier {
  const contactPieces = [
    row.contact_person || '',
    row.phone || '',
    row.location || '',
  ]
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    contact: contactPieces.join(' • ') || '',
    contactPerson: row.contact_person ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Legacy / not backed by DB columns are left undefined
  };
}

export async function listSuppliers(companyId: string): Promise<Supplier[]> {
  if (import.meta.env?.DEV) {
    console.log('[suppliers] listSuppliers', {
      companyId,
      schema: 'public',
      table: TABLE,
      select: ['id', 'company_id', 'name', 'contact_person', 'phone', 'email', 'location', 'notes', 'created_by', 'created_at', 'updated_at'],
    });
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,company_id,name,contact_person,phone,email,location,notes,created_by,created_at,updated_at')
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
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  notes?: string;
  createdBy?: string;
}): Promise<Supplier> {
  const payload = {
    company_id: input.companyId,
    name: input.name.trim(),
    contact_person: input.contactPerson?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: input.createdBy ?? null,
  };

  if (import.meta.env?.DEV) {
    console.log('[suppliers] createSupplier', { schema: 'public', table: TABLE, payload });
  }

  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();
  if (import.meta.env?.DEV) {
    console.log('[suppliers] createSupplier response', {
      table: TABLE,
      schema: 'public',
      error,
      data,
    });
  }
  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[suppliers] createSupplier error', { message: error.message });
    }
    throw error;
  }
  return toSupplier(data as DbRow);
}

