import { supabase } from '@/lib/supabase';
import type { ChallengeTemplate } from '@/types';
import { logger } from "@/lib/logger";

const TABLE = 'challenge_templates';

type DbRow = {
  id: string;
  company_id: string;
  crop_type: string;
  title: string;
  description: string | null;
  challenge_type: string | null;
  severity: string | null;
  recommended_action: string | null;
  recommended_input: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function toTemplate(row: DbRow): ChallengeTemplate & { id: string } {
  return {
    id: row.id,
    companyId: row.company_id,
    cropType: row.crop_type,
    title: row.title,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    challengeType: row.challenge_type ?? undefined,
    severity: (row.severity as ChallengeTemplate['severity']) ?? undefined,
    recommendedAction: row.recommended_action ?? undefined,
    recommendedInput: row.recommended_input ?? undefined,
  };
}

export interface UpsertChallengeTemplateInput {
  companyId: string;
  cropType: string;
  title: string;
  description?: string;
  createdBy: string;
  challengeType?: string;
  severity?: 'low' | 'medium' | 'high';
  recommendedAction?: string;
  recommendedInput?: string;
}

/** Insert-or-update template based on unique (company_id, crop_type, title). */
export async function upsertChallengeTemplate(
  input: UpsertChallengeTemplateInput
): Promise<{ id: string; isUpdate: boolean }> {
  const basePayload = {
    company_id: input.companyId,
    crop_type: input.cropType,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    created_by: input.createdBy,
    challenge_type: input.challengeType ?? null,
    severity: input.severity ?? null,
    recommended_action: (input.recommendedAction ?? '').trim() || null,
    recommended_input: (input.recommendedInput ?? '').trim() || null,
  };

  if (import.meta.env?.DEV) {
    logger.log('[challengeTemplates] upsertChallengeTemplate start', {
      table: TABLE,
      schema: 'public',
      payload: basePayload,
    });
  }

  // 1) Check if a template already exists for (company_id, crop_type, title)
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE)
    .select('*')
    .eq('company_id', input.companyId)
    .eq('crop_type', input.cropType)
    .eq('title', input.title.trim())
    .maybeSingle();

  if (import.meta.env?.DEV) {
    logger.log('[challengeTemplates] upsertChallengeTemplate existing lookup', {
      companyId: input.companyId,
      cropType: input.cropType,
      title: input.title.trim(),
      existingId: (existing as DbRow | null)?.id ?? null,
      fetchError,
    });
  }

  if (fetchError && fetchError.code !== 'PGRST116') {
    // Log but do not throw; fall back to insert path.
    if (import.meta.env?.DEV) {
      console.warn('[challengeTemplates] upsertChallengeTemplate lookup error (non-fatal)', fetchError.message);
    }
  }

  // 2) If exists, update it
  if (existing) {
    const existingRow = existing as DbRow;
    const { data, error } = await supabase
      .from(TABLE)
      .update(basePayload)
      .eq('id', existingRow.id)
      .select('*')
      .single();

    if (import.meta.env?.DEV) {
      logger.log('[challengeTemplates] upsertChallengeTemplate update response', {
        table: TABLE,
        schema: 'public',
        id: existingRow.id,
        data,
        error,
      });
    }

    if (error) {
      if (import.meta.env?.DEV) {
        console.warn('[challengeTemplates] upsertChallengeTemplate update error', error.message);
      }
      throw error;
    }

    return { id: existingRow.id, isUpdate: true };
  }

  // 3) Otherwise, insert a new template (let DB generate UUID)
  const { data, error } = await supabase
    .from(TABLE)
    .insert(basePayload)
    .select('*')
    .single();

  if (import.meta.env?.DEV) {
    logger.log('[challengeTemplates] upsertChallengeTemplate insert response', {
      table: TABLE,
      schema: 'public',
      data,
      error,
    });
  }

  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[challengeTemplates] upsertChallengeTemplate insert error', error.message);
    }
    throw error;
  }

  const row = data as DbRow | null;
  return { id: row?.id ?? '', isUpdate: false };
}

/** Fetch templates for company + crop. orderBy createdAt desc. */
export async function getChallengeTemplates(
  companyId: string,
  cropType: string
): Promise<(ChallengeTemplate & { id: string })[]> {
  if (import.meta.env?.DEV) {
    logger.log('[challengeTemplates] getChallengeTemplates', {
      table: TABLE,
      schema: 'public',
      companyId,
      cropType,
    });
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('company_id', companyId)
    .eq('crop_type', cropType)
    .order('created_at', { ascending: false });

  if (import.meta.env?.DEV) {
    logger.log('[challengeTemplates] getChallengeTemplates response', {
      table: TABLE,
      schema: 'public',
      error,
      rows: Array.isArray(data) ? data.length : null,
    });
  }

  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[challengeTemplates] getChallengeTemplates error', {
        companyId,
        cropType,
        error: error.message,
      });
    }
    return [];
  }

  return (data ?? []).map((row) => toTemplate(row as DbRow));
}
