/**
 * Single source of truth for season challenges per project.
 * Used by: Project Details, Plan Season, Season Challenges page.
 * All read/write goes through this service so challenges stay in sync.
 */
import { db } from '@/lib/db';
import type { SeasonChallenge } from '@/types';

type DbRow = {
  id: string;
  company_id: string;
  project_id: string;
  crop_type: string;
  title: string;
  description: string;
  challenge_type: string | null;
  stage_index: number | null;
  stage_name: string | null;
  severity: string;
  status: string;
  date_identified: string;
  date_resolved: string | null;
  what_was_done: string | null;
  items_used: unknown;
  plan2_if_fails: string | null;
  source: string | null;
  source_plan_challenge_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

function toChallenge(row: DbRow): SeasonChallenge {
  return {
    id: row.id,
    projectId: row.project_id,
    companyId: row.company_id,
    cropType: row.crop_type as SeasonChallenge['cropType'],
    title: row.title,
    description: row.description,
    challengeType: (row.challenge_type as SeasonChallenge['challengeType']) ?? undefined,
    stageIndex: row.stage_index ?? undefined,
    stageName: row.stage_name ?? undefined,
    severity: (row.severity as SeasonChallenge['severity']) || 'medium',
    status: (row.status as SeasonChallenge['status']) || 'identified',
    dateIdentified: new Date(row.date_identified) as unknown as Date,
    dateResolved: row.date_resolved ? (new Date(row.date_resolved) as unknown as Date) : undefined,
    whatWasDone: row.what_was_done ?? undefined,
    itemsUsed: Array.isArray(row.items_used) ? (row.items_used as SeasonChallenge['itemsUsed']) : undefined,
    plan2IfFails: row.plan2_if_fails ?? undefined,
    source: row.source ?? undefined,
    sourcePlanChallengeId: row.source_plan_challenge_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdByName: row.created_by_name ?? undefined,
    createdAt: new Date(row.created_at) as unknown as Date,
    updatedAt: new Date(row.updated_at) as unknown as Date,
  };
}

const TABLE = 'season_challenges';

/**
 * List season challenges for a company, optionally scoped to one project.
 * Project-specific: pass projectId so Project Details and Plan Season only see that project.
 * Company-wide: omit projectId so Season Challenges page can show all or filter client-side.
 */
export async function listSeasonChallenges(
  companyId: string,
  projectId?: string | null
): Promise<SeasonChallenge[]> {
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] listSeasonChallenges', {
      companyId,
      projectId: projectId ?? 'all',
    });
  }
  try {
    let q = db
      .public()
      .from(TABLE)
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (projectId != null && projectId !== '') {
      q = q.eq('project_id', projectId);
    }

    const { data, error } = await q;

    if (error) {
      if (import.meta.env?.DEV) {
        console.warn('[seasonChallenges] listSeasonChallenges error', {
          companyId,
          projectId,
          error: error.message,
        });
      }
      return [];
    }

    const list = (data ?? []).map((row) => toChallenge(row as DbRow));
    if (import.meta.env?.DEV) {
      console.log('[seasonChallenges] listSeasonChallenges result', {
        companyId,
        projectId: projectId ?? 'all',
        count: list.length,
      });
    }
    return list;
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] listSeasonChallenges exception', err);
    }
    return [];
  }
}

export interface CreateSeasonChallengeInput {
  companyId: string;
  projectId: string;
  cropType: string;
  title: string;
  description: string;
  challengeType?: string;
  severity?: 'low' | 'medium' | 'high';
  status?: 'identified' | 'mitigating' | 'resolved';
  stageIndex?: number;
  stageName?: string;
  source?: string;
  sourcePlanChallengeId?: string;
  createdBy?: string;
  createdByName?: string;
}

export async function createSeasonChallenge(
  input: CreateSeasonChallengeInput
): Promise<SeasonChallenge | null> {
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] createSeasonChallenge', {
      projectId: input.projectId,
      title: input.title,
    });
  }
  try {
    const dateIdentified = new Date().toISOString().slice(0, 10);
    const { data, error } = await db
      .public()
      .from(TABLE)
      .insert({
        company_id: input.companyId,
        project_id: input.projectId,
        crop_type: input.cropType,
        title: input.title,
        description: input.description || '',
        challenge_type: input.challengeType ?? null,
        severity: input.severity ?? 'medium',
        status: input.status ?? 'identified',
        stage_index: input.stageIndex ?? null,
        stage_name: input.stageName ?? null,
        date_identified: dateIdentified,
        source: input.source ?? null,
        source_plan_challenge_id: input.sourcePlanChallengeId ?? null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('*')
      .single();

    if (error) {
      if (import.meta.env?.DEV) {
        console.warn('[seasonChallenges] createSeasonChallenge error', error.message);
      }
      throw error;
    }
    if (import.meta.env?.DEV) {
      console.log('[seasonChallenges] createSeasonChallenge success', (data as DbRow)?.id);
    }
    return data ? toChallenge(data as DbRow) : null;
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] createSeasonChallenge exception', err);
    }
    throw err;
  }
}

export async function updateSeasonChallenge(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    challengeType: string;
    severity: string;
    status: string;
    whatWasDone: string;
    plan2IfFails: string;
    itemsUsed: unknown;
    dateResolved: string | null;
  }>
): Promise<void> {
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] updateSeasonChallenge', { id });
  }
  const row: Record<string, unknown> = {};
  if (updates.title != null) row.title = updates.title;
  if (updates.description != null) row.description = updates.description;
  if (updates.challengeType != null) row.challenge_type = updates.challengeType;
  if (updates.severity != null) row.severity = updates.severity;
  if (updates.status != null) row.status = updates.status;
  if (updates.whatWasDone != null) row.what_was_done = updates.whatWasDone;
  if (updates.plan2IfFails != null) row.plan2_if_fails = updates.plan2IfFails;
  if (updates.itemsUsed != null) row.items_used = updates.itemsUsed;
  if (updates.dateResolved !== undefined) row.date_resolved = updates.dateResolved;

  if (Object.keys(row).length === 0) return;

  const { error } = await db.public().from(TABLE).update(row).eq('id', id);
  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] updateSeasonChallenge error', error.message);
    }
    throw error;
  }
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] updateSeasonChallenge success');
  }
}

export async function deleteSeasonChallenge(id: string): Promise<void> {
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] deleteSeasonChallenge', { id });
  }
  const { error } = await db.public().from(TABLE).delete().eq('id', id);
  if (error) {
    if (import.meta.env?.DEV) {
      console.warn('[seasonChallenges] deleteSeasonChallenge error', error.message);
    }
    throw error;
  }
  if (import.meta.env?.DEV) {
    console.log('[seasonChallenges] deleteSeasonChallenge success');
  }
}
