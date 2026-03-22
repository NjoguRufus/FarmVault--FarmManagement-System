import { supabase } from '@/lib/supabase';
import { db, requireCompanyId } from '@/lib/db';
import type { CropStage, Project } from '@/types';

type DbProjectRow = {
  id: string;
  company_id: string;
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

function toDate(value: string | null): Date {
  return value ? new Date(value) : (undefined as unknown as Date);
}

function mapProjectRow(row: DbProjectRow): Project {
  const plantingDate = row.planting_date ? new Date(row.planting_date) : undefined;
  const expectedEnd = row.expected_end_date ? new Date(row.expected_end_date) : undefined;

  return {
    id: row.id,
    name: row.name,
    companyId: row.company_id,
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
  };
}

function mapStageRow(row: DbStageRow): CropStage {
  return {
    id: row.id,
    projectId: row.project_id,
    companyId: row.company_id,
    cropType: '' as any,
    stageName: row.stage_name,
    stageIndex: 0,
    startDate: row.start_date ? new Date(row.start_date) : undefined,
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    plannedStartDate: row.planned_start_date ? new Date(row.planned_start_date) : undefined,
    plannedEndDate: row.planned_end_date ? new Date(row.planned_end_date) : undefined,
    actualStartDate: row.actual_start_date ? new Date(row.actual_start_date) : undefined,
    actualEndDate: row.actual_end_date ? new Date(row.actual_end_date) : undefined,
    status: row.is_current ? 'in-progress' : 'pending',
    notes: undefined,
    recalculated: false,
    recalculatedAt: undefined,
    recalculationReason: undefined,
  };
}

export async function listProjects(companyId: string | null): Promise<Project[]> {
  if (!companyId) return [];

  const { data, error } = await db.projects()
    .from('projects')
    .select(
      `
      id,
      company_id,
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
      budget_pool_id
    `,
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const projects = (data ?? []).map((row) => mapProjectRow(row as DbProjectRow));
  if (import.meta.env.DEV) {
    console.log('[Projects Loaded]', projects.length);
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
      created_at
    `,
    )
    .eq('id', projectId)
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

export interface CreateProjectInput {
  companyId: string;
  createdBy: string;
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

  return mapProjectRow(data as DbProjectRow);
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'status' | 'location' | 'acreage' | 'budget'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name != null) payload.name = updates.name;
  if (updates.status != null) payload.status = updates.status;
  if (updates.location != null) payload.notes = updates.location;
  if (updates.acreage != null) payload.field_size = updates.acreage;
  if (updates.budget !== undefined) payload.budget = updates.budget;

  if (Object.keys(payload).length === 0) return;

  const { error } = await db.projects()
    .from('projects')
    .update(payload)
    .eq('id', projectId);

  if (error) {
    throw error;
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await db.projects().from('projects').delete().eq('id', projectId);
  if (error) {
    throw error;
  }
}

export async function listProjectStages(projectId: string): Promise<CropStage[]> {
  const { data, error } = await db.projects()
    .from('project_stages')
    .select(
      `
      id,
      company_id,
      project_id,
      stage_key,
      stage_name,
      start_date,
      end_date,
      is_current,
      progress
    `,
    )
    .eq('project_id', projectId)
    .order('start_date', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapStageRow(row as DbStageRow));
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

