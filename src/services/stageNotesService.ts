import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { StageNote } from '@/types';

type DbStageNoteRow = {
  id: string;
  company_id: string;
  project_id: string;
  stage_id: string | null;
  note: string;
  created_at: string;
  created_by: string;
};

export async function addStageNote(params: {
  companyId: string;
  projectId: string;
  stageId: string;
  text: string;
  createdBy: string;
}): Promise<string> {
  const { data, error } = await db
    .projects()
    .from('stage_notes')
    .insert({
      company_id: params.companyId,
      project_id: params.projectId,
      stage_id: params.stageId,
      note: params.text.trim(),
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return (data as { id: string }).id;
}

/** Fetch stage notes, most recent first. limit N, pagination via created_at cursor. */
export async function getStageNotes(
  _companyId: string,
  projectId: string,
  stageId: string,
  pageSize: number,
  lastCursor: string | null,
): Promise<{ notes: (StageNote & { id: string })[]; lastCursor: string | null }> {
  let query = db
    .projects()
    .from('stage_notes')
    .select(
      `
      id,
      company_id,
      project_id,
      stage_id,
      note,
      created_at,
      created_by
    `,
    )
    .eq('project_id', projectId)
    .eq('stage_id', stageId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize);

  if (lastCursor) {
    query = query.lt('created_at', lastCursor);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbStageNoteRow[];
  const notes = rows.map(
    (row) =>
      ({
        id: row.id,
        stageId: row.stage_id ?? '',
        projectId: row.project_id,
        companyId: row.company_id,
        text: row.note,
        createdAt: row.created_at,
        createdBy: row.created_by,
      }) as StageNote & { id: string },
  );

  const nextCursor =
    rows.length === pageSize ? rows[rows.length - 1]?.created_at ?? null : null;

  return { notes, lastCursor: nextCursor };
}
