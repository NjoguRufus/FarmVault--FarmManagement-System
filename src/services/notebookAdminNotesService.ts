import { supabase } from '@/lib/supabase';

export type NotebookNoteTargetType = 'ALL' | 'COMPANY' | 'CROP' | 'USER';

export type FarmNotebookAdminNoteRow = {
  id: string;
  title: string;
  content: string;
  crop_id: string | null;
  company_id: string | null;
  target_user_id: string | null;
  target_type: NotebookNoteTargetType;
  created_by_admin: boolean;
  created_at: string | null;
};

function normTargetType(v: string): NotebookNoteTargetType {
  const u = String(v ?? '').trim().toUpperCase();
  if (u === 'ALL' || u === 'COMPANY' || u === 'CROP' || u === 'USER') return u;
  return 'COMPANY';
}

function mapNoteRow(raw: Record<string, unknown>): FarmNotebookAdminNoteRow | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    content: String(raw.content ?? ''),
    crop_id: raw.crop_id != null ? String(raw.crop_id) : null,
    company_id: raw.company_id != null ? String(raw.company_id) : null,
    target_user_id: raw.target_user_id != null ? String(raw.target_user_id) : null,
    target_type: normTargetType(String(raw.target_type ?? '')),
    created_by_admin: Boolean(raw.created_by_admin),
    created_at: raw.created_at != null ? String(raw.created_at) : null,
  };
}

export async function listFarmNotebookAdminNotes(
  companyId: string,
  cropId?: string | null,
): Promise<FarmNotebookAdminNoteRow[]> {
  const cid = (companyId ?? '').trim();
  if (!cid) return [];

  const params: { p_company_id: string; p_crop_id?: string | null } = { p_company_id: cid };
  const crop = (cropId ?? '').trim();
  if (crop) params.p_crop_id = crop;

  const { data, error } = await supabase.rpc('rpc_list_farm_notebook_admin_notes', params);
  if (error) {
    throw new Error(error.message ?? 'Failed to load admin notes');
  }
  if (!Array.isArray(data)) return [];
  const out: FarmNotebookAdminNoteRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const m = mapNoteRow(row as Record<string, unknown>);
    if (m) out.push(m);
  }
  return out;
}

export async function sendFarmNotebookAdminNote(input: {
  targetType: NotebookNoteTargetType;
  title: string;
  content: string;
  companyId?: string | null;
  cropId?: string | null;
  targetUserId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_admin_send_farm_notebook_note', {
    p_target_type: input.targetType,
    p_title: input.title,
    p_content: input.content,
    p_company_id: input.companyId ?? null,
    p_crop_id: input.cropId ?? null,
    p_target_user_id: input.targetUserId ?? null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to send note');
  }
  if (data == null) return '';
  return String(data);
}
