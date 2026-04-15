import { supabase } from '@/lib/supabase';
import { db, requireCompanyId } from '@/lib/db';
import type { CropStage, Project } from '@/types';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { enqueueUnifiedNotification } from '@/services/unifiedNotificationPipeline';
import { logger } from "@/lib/logger";
import { ConcurrentUpdateConflictError, throwIfUpdateReturnedNoRows } from '@/lib/concurrentUpdate';

type DbProjectRow = {
  id: string;
  company_id: string;
  farm_id?: string | null;
  name: string;
  crop_type: string;
  environment: string;
  status: string;
  planting_date: string | null;
  expected_harvest_date: string | null;
  expected_end_date: string | null;
  field_size: number | null;
  field_unit: string | null;
  notes: string | null;
  planning: unknown | null;
  created_at: string;
  budget?: number | string | null;
  budget_pool_id?: string | null;
  row_version?: number | null;
};

type DbStageRow = {
  id: string;
  company_id: string;
  project_id: string;
  stage_key: string;
  stage_name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  progress: number;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
};

function parseDay(value: string | null | undefined): Date | undefined {
  if (value == null || String(value).trim() === '') return undefined;
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function deriveStageStatus(row: DbStageRow): CropStage['status'] {
  const progress = Number(row.progress ?? 0);
  if (progress >= 100) return 'completed';
  if (row.is_current) return 'in-progress';
  const start = parseDay(row.start_date);
  const end = parseDay(row.end_date);
  if (start && end) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setHours(0, 0, 0, 0);
    if (today > e) return 'completed';
    if (today >= s && today <= e) return 'in-progress';
  }
  return 'pending';
}

function mapProjectRow(row: DbProjectRow): Project {
  const plantingDate = row.planting_date ? new Date(row.planting_date) : undefined;
  const expectedEnd = row.expected_end_date ? new Date(row.expected_end_date) : undefined;

  return {
    id: row.id,
    name: row.name,
    companyId: row.company_id,
    farmId: row.farm_id ?? null,
    cropType: row.crop_type as any,
    cropTypeKey: row.crop_type,
    environmentType: row.environment as any,
    status: (row.status as Project['status']) || 'active',
    startDate: plantingDate ?? new Date(row.created_at),
    endDate: expectedEnd,
    location: row.notes ?? '',
    acreage: row.field_size ?? 0,
    budget: Number(row.budget ?? 0),
    createdAt: new Date(row.created_at),
    plantingDate,
    startingStageIndex: undefined,
    currentStage: undefined,
    stageSelected: undefined,
    stageAutoDetected: undefined,
    stageWasManuallyOverridden: undefined,
    daysSincePlanting: undefined,
    setupComplete: true,
    useBlocks: false,
    budgetPoolId: row.budget_pool_id ?? null,
    planning: (row.planning as Project['planning']) ?? undefined,
    rowVersion: row.row_version != null ? Number(row.row_version) : undefined,
  };
}

function mapStageRow(row: DbStageRow, stageIndex: number, cropType?: string): CropStage {
  return {
    id: row.id,
    projectId: row.project_id,
    companyId: row.company_id,
    cropType: (cropType ?? '') as Project['cropType'],
    stageName: row.stage_name,
    stageIndex,
    startDate: parseDay(row.start_date),
    endDate: parseDay(row.end_date),
    plannedStartDate: parseDay(row.planned_start_date),
    plannedEndDate: parseDay(row.planned_end_date),
    actualStartDate: parseDay(row.actual_start_date),
    actualEndDate: parseDay(row.actual_end_date),
    status: deriveStageStatus(row),
    notes: undefined,
    recalculated: false,
    recalculatedAt: undefined,
    recalculationReason: undefined,
  };
}

const STAGE_SELECT = `
  id,
  company_id,
  project_id,
  stage_key,
  stage_name,
  start_date,
  end_date,
  is_current,
  progress,
  planned_start_date,
  planned_end_date,
  actual_start_date,
  actual_end_date
`;

function sortStageRows(rows: DbStageRow[]): DbStageRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.start_date ? new Date(`${a.start_date}T12:00:00`).getTime() : 0;
    const tb = b.start_date ? new Date(`${b.start_date}T12:00:00`).getTime() : 0;
    if (ta !== tb) return ta - tb;
    const ea = a.end_date ? new Date(`${a.end_date}T12:00:00`).getTime() : 0;
    const eb = b.end_date ? new Date(`${b.end_date}T12:00:00`).getTime() : 0;
    if (ea !== eb) return ea - eb;
    return String(a.stage_name ?? '').localeCompare(String(b.stage_name ?? ''));
  });
}

function mapSortedStageRows(rows: DbStageRow[], cropType?: string): CropStage[] {
  return sortStageRows(rows).map((row, index) => mapStageRow(row, index, cropType));
}

export async function listProjects(companyId: string | null): Promise<Project[]> {
  if (!companyId) return [];

  const { data, error } = await db.projects()
    .from('projects')
    .select(
      `
      id,
      company_id,
      farm_id,
      name,
      crop_type,
      environment,
      status,
      planting_date,
      expected_harvest_date,
      expected_end_date,
      field_size,
      field_unit,
      notes,
      planning,
      created_at,
      budget,
      budget_pool_id,
      row_version
    `,
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const projects = (data ?? []).map((row) => mapProjectRow(row as DbProjectRow));
  if (import.meta.env.DEV) {
    logger.log('[Projects Loaded]', projects.length);
  }
  return projects;
}

export async function getProject(
  projectId: string,
  options?: { companyId?: string | null },
): Promise<Project | null> {
  const companyId = options?.companyId ?? null;
  const { data, error } = await supabase
    .schema('projects')
    .from('projects')
    .select(
      `
      id,
      company_id,
      farm_id,
      name,
      crop_type,
      environment,
      status,
      planting_date,
      expected_harvest_date,
      expected_end_date,
      field_size,
      field_unit,
      notes,
      planning,
      created_at,
      row_version
    `,
    )
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) {
      const isRls = error.code === '42501' || /row-level security|RLS|policy/i.test(error.message ?? '');
      console.warn('[getProject] Project not found or access denied', {
        projectId,
        companyId,
        errorCode: error.code,
        errorMessage: error.message,
        rlsError: isRls,
      });
    }
    throw error;
  }

  if (!data) {
    if (import.meta.env.DEV) {
      console.warn('[getProject] Project not found (no row)', { projectId, companyId });
    }
    return null;
  }
  return mapProjectRow(data as DbProjectRow);
}

/** Developer-only: bypass tenant RLS and fetch a project by id (SECURITY DEFINER RPC). */
export async function developerGetProjectById(projectId: string): Promise<Project | null> {
  const id = String(projectId ?? '').trim();
  if (!id) return null;

  const { data, error } = await supabase.rpc('developer_get_project_by_id', {
    p_project_id: id,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[developerGetProjectById] failed', { projectId: id, errorCode: error.code, errorMessage: error.message });
    }
    throw error;
  }

  if (!data) return null;
  return mapProjectRow(data as DbProjectRow);
}

export interface CreateProjectInput {
  companyId: string;
  createdBy: string;
  farmId: string;
  name: string;
  cropType: string;
  plantingDate: string; // YYYY-MM-DD
  environment: string;
  expectedHarvestDate?: string | null;
  expectedEndDate?: string | null;
  fieldSize?: number | null;
  fieldUnit?: string;
  notes?: string | null;
  /** Allocated budget (KES) when not using a shared pool. */
  budget?: number | null;
  /** When set, expenses draw from this finance.budget_pools row. */
  budgetPoolId?: string | null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const companyId = requireCompanyId(input.companyId);
  const { data, error } = await db.projects()
    .from('projects')
    .insert({
      company_id: companyId,
      farm_id: input.farmId,
      created_by: input.createdBy,
      name: input.name,
      crop_type: input.cropType,
      environment: input.environment,
      status: 'active',
      planting_date: input.plantingDate,
      expected_harvest_date: input.expectedHarvestDate ?? null,
      expected_end_date: input.expectedEndDate ?? null,
      field_size: input.fieldSize ?? null,
      field_unit: input.fieldUnit ?? 'acres',
      notes: input.notes ?? null,
      budget: input.budget ?? 0,
      budget_pool_id: input.budgetPoolId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const created = mapProjectRow(data as DbProjectRow);
  captureEvent(AnalyticsEvents.PROJECT_CREATED, {
    company_id: companyId,
    project_id: created.id,
    project_name: created.name,
    crop_type: created.cropTypeKey ?? String(input.cropType),
    module_name: 'projects',
  });
  return created;
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'status' | 'location' | 'acreage' | 'budget'>>,
  options?: { expectedRowVersion?: number | null },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name != null) payload.name = updates.name;
  if (updates.status != null) payload.status = updates.status;
  if (updates.location != null) payload.notes = updates.location;
  if (updates.acreage != null) payload.field_size = updates.acreage;
  if (updates.budget !== undefined) payload.budget = updates.budget;

  if (Object.keys(payload).length === 0) return;

  const v = options?.expectedRowVersion;
  if (v == null || !Number.isFinite(Number(v))) {
    throw new ConcurrentUpdateConflictError(
      'Record updated by another user. Please refresh the page and try again.',
    );
  }

  let q = db.projects()
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .is('deleted_at', null)
    .eq('row_version', Number(v));

  const { data, error } = await q.select('id');
  throwIfUpdateReturnedNoRows(data, error);

  captureEvent(AnalyticsEvents.PROJECT_UPDATED, {
    project_id: projectId,
    module_name: 'projects',
  });
}

export async function deleteProject(
  projectId: string,
  options?: { expectedRowVersion?: number | null },
): Promise<void> {
  const deletedAt = new Date().toISOString();
  const v = options?.expectedRowVersion;
  if (v == null || !Number.isFinite(Number(v))) {
    throw new ConcurrentUpdateConflictError(
      'Record updated by another user. Please refresh the page and try again.',
    );
  }
  let q = db
    .projects()
    .from('projects')
    .update({ deleted_at: deletedAt })
    .eq('id', projectId)
    .is('deleted_at', null)
    .eq('row_version', Number(v));
  const { data, error } = await q.select('id');
  throwIfUpdateReturnedNoRows(data, error);
  captureEvent(AnalyticsEvents.PROJECT_ARCHIVED, {
    project_id: projectId,
    module_name: 'projects',
  });
}

export async function listProjectStages(
  projectId: string,
  options?: { cropType?: string },
): Promise<CropStage[]> {
  const { data, error } = await db.projects()
    .from('project_stages')
    .select(STAGE_SELECT)
    .eq('project_id', projectId)
    .order('start_date', { ascending: true });

  if (error) {
    throw error;
  }

  let cropType = options?.cropType;
  if (cropType == null) {
    const { data: prow } = await db.projects()
      .from('projects')
      .select('crop_type')
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle();
    cropType = (prow as { crop_type?: string } | null)?.crop_type;
  }

  return mapSortedStageRows((data ?? []) as DbStageRow[], cropType);
}

/** All `projects.project_stages` rows for a company (dashboards, crop stages list). */
export async function listCompanyProjectStages(companyId: string): Promise<CropStage[]> {
  const cid = requireCompanyId(companyId);
  const { data, error } = await db.projects()
    .from('project_stages')
    .select(STAGE_SELECT)
    .eq('company_id', cid)
    .order('project_id', { ascending: true })
    .order('start_date', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbStageRow[];
  const byProject = new Map<string, DbStageRow[]>();
  for (const row of rows) {
    const list = byProject.get(row.project_id) ?? [];
    list.push(row);
    byProject.set(row.project_id, list);
  }

  const out: CropStage[] = [];
  for (const [, group] of byProject) {
    out.push(...mapSortedStageRows(group));
  }

  const projectIds = [...new Set(out.map((s) => s.projectId))];
  if (projectIds.length === 0) return out;

  const { data: prows, error: projErr } = await db.projects()
    .from('projects')
    .select('id,crop_type')
    .in('id', projectIds)
    .is('deleted_at', null);
  if (projErr || !prows?.length) return out;

  const cmap = new Map((prows as { id: string; crop_type: string }[]).map((p) => [p.id, p.crop_type]));
  return out.map((s) => ({
    ...s,
    cropType: (cmap.get(s.projectId) ?? s.cropType) as Project['cropType'],
  }));
}

export async function updateProjectStageRecord(
  stageId: string,
  patch: {
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean;
    progress?: number;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.startDate !== undefined) payload.start_date = patch.startDate;
  if (patch.endDate !== undefined) payload.end_date = patch.endDate;
  if (patch.isCurrent !== undefined) payload.is_current = patch.isCurrent;
  if (patch.progress !== undefined) payload.progress = patch.progress;
  if (Object.keys(payload).length === 0) return;

  const { error } = await db.projects().from('project_stages').update(payload).eq('id', stageId);
  if (error) {
    throw error;
  }
}

export async function insertProjectStage(input: {
  companyId: string;
  projectId: string;
  stageKey: string;
  stageName: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
}): Promise<CropStage> {
  const companyId = requireCompanyId(input.companyId);
  const { data, error } = await db.projects()
    .from('project_stages')
    .insert({
      company_id: companyId,
      project_id: input.projectId,
      stage_key: input.stageKey,
      stage_name: input.stageName,
      start_date: input.startDate,
      end_date: input.endDate,
      is_current: input.isCurrent,
      progress: 0,
    })
    .select(STAGE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const row = data as DbStageRow;
  return mapStageRow(row, 0, undefined);
}

/**
 * Mark one stage complete (today), clear `is_current` on all project stages, then activate the next row or insert it.
 */
export async function completeProjectStageAndAdvanceNext(params: {
  companyId: string;
  projectId: string;
  completedStageId: string;
  next?: {
    stageKey: string;
    stageName: string;
    endDate: string | null;
  };
}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const stages = await listProjectStages(params.projectId);
  const orderedIds = stages.map((s) => s.id);
  const completedIdx = orderedIds.indexOf(params.completedStageId);
  if (completedIdx < 0) {
    throw new Error('Stage not found for project');
  }

  await db.projects()
    .from('project_stages')
    .update({ is_current: false })
    .eq('project_id', params.projectId);

  await updateProjectStageRecord(params.completedStageId, {
    endDate: today,
    progress: 100,
    isCurrent: false,
  });

  const nextStage = stages[completedIdx + 1] ?? null;
  if (nextStage && !String(nextStage.id).startsWith('placeholder')) {
    const end =
      params.next?.endDate ??
      (nextStage.endDate ? nextStage.endDate.toISOString().slice(0, 10) : null);
    await updateProjectStageRecord(nextStage.id, {
      startDate: today,
      endDate: end,
      isCurrent: true,
      progress: 0,
    });
    return;
  }

  if (params.next) {
    await insertProjectStage({
      companyId: params.companyId,
      projectId: params.projectId,
      stageKey: params.next.stageKey,
      stageName: params.next.stageName,
      startDate: today,
      endDate: params.next.endDate,
      isCurrent: true,
    });
  }

  try {
    if (typeof window !== 'undefined') {
      const refreshed = await listProjectStages(params.projectId);
      const cur = refreshed.find((s) => s.status === 'in-progress');
      if (cur) {
        enqueueUnifiedNotification({
          tier: 'insights',
          kind: 'insight_crop_stage',
          title: 'Crop stage updated',
          body: `Current stage: ${cur.stageName}.`,
          path: '/crop-stages',
          toastType: 'info',
        });
      }
    }
  } catch {
    /* non-fatal */
  }
}

export async function updateStageDates(
  stageId: string,
  updates: {
    plannedStart?: string | null;
    plannedEnd?: string | null;
    actualStart?: string | null;
    actualEnd?: string | null;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};

  if (updates.plannedStart !== undefined) {
    payload.planned_start_date = updates.plannedStart;
  }
  if (updates.plannedEnd !== undefined) {
    payload.planned_end_date = updates.plannedEnd;
  }
  if (updates.actualStart !== undefined) {
    payload.actual_start_date = updates.actualStart;
  }
  if (updates.actualEnd !== undefined) {
    payload.actual_end_date = updates.actualEnd;
  }

  if (Object.keys(payload).length === 0) return;

  const { error } = await db.projects()
    .from('project_stages')
    .update(payload)
    .eq('id', stageId);

  if (error) {
    throw error;
  }
}

