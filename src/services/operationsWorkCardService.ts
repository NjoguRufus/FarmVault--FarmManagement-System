import { db, requireCompanyId } from '@/lib/db';

export type WorkCardStatus = 'planned' | 'submitted' | 'approved' | 'rejected' | 'paid';

export interface WorkCardPayment {
  isPaid: boolean;
  amount?: number | null;
  method?: 'cash' | 'mpesa' | 'bank' | 'other' | null;
  paidAt?: string | null; // ISO string from Supabase
  paidByUserId?: string | null;
  paidByName?: string | null;
}

export interface WorkCard {
  id: string;
  companyId: string;
  projectId: string | null;

  stageId: string | null;
  stageIndex: number | null;
  stageName: string | null;
  blockId: string | null;
  blockName: string | null;

  workTitle: string;
  workCategory: string;

  plannedDate: string | null; // ISO date string
  plannedWorkers: number;
  plannedRatePerPerson: number;
  plannedTotal: number;
  notes: string | null;

  actualDate: string | null;
  actualWorkers: number | null;
  actualRatePerPerson: number | null;
  actualTotal: number | null;
  executionNotes: string | null;
  managerId: string | null;
  managerName: string | null;

  allocatedManagerId: string | null;

  payment: WorkCardPayment;

  status: WorkCardStatus;

  createdByAdminId: string;
  createdByAdminName: string | null;
  createdByManagerId: string | null;

  createdAt: string;
  updatedAt: string | null;

  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;

  rejectionReason: string | null;
  rejectedByUserId: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
}

type WorkCardRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  status: string | null;
  allocated_manager_id: string | null;
  payload: any;
  created_at: string;
  updated_at: string;
};

export type CreateWorkCardInput = {
  companyId: string;
  projectId: string;
  stageId?: string | null;
  stageIndex?: number | null;
  stageName?: string | null;
  blockId?: string | null;
  blockName?: string | null;
  workTitle: string;
  workCategory: string;
  plannedDate: string | null;
  plannedWorkers: number;
  plannedRatePerPerson: number;
  notes?: string | null;
  allocatedManagerId: string | null;
  createdByAdminId: string;
  createdByAdminName?: string | null;
  createdByManagerId?: string | null;
  actorUserId: string;
  actorUserName?: string | null;
};

export type UpdateWorkCardInput = {
  id: string;
  workTitle?: string;
  workCategory?: string;
  plannedDate?: string | null;
  plannedWorkers?: number;
  plannedRatePerPerson?: number;
  notes?: string | null;
  stageId?: string | null;
  stageIndex?: number | null;
  stageName?: string | null;
  blockId?: string | null;
  blockName?: string | null;
  allocatedManagerId?: string | null;
  actorUserId: string;
  actorUserName?: string | null;
};

export type SubmitExecutionInput = {
  id: string;
  actualDate: string;
  actualWorkers: number;
  actualRatePerPerson: number;
  executionNotes?: string | null;
  managerId: string;
  managerName: string;
  actorUserId: string;
  actorUserName?: string | null;
};

export type ApproveWorkCardInput = {
  id: string;
  actorUserId: string;
  actorUserName?: string | null;
};

export type RejectWorkCardInput = {
  id: string;
  rejectionReason: string;
  actorUserId: string;
  actorUserName?: string | null;
};

export type MarkWorkCardPaidInput = {
  id: string;
  amount?: number;
  method: 'cash' | 'mpesa' | 'bank' | 'other';
  paidAt: string;
  actorUserId: string;
  actorUserName?: string | null;
};

const WORK_CARDS_TABLE = 'work_cards';
const AUDIT_LOGS_TABLE = 'audit_logs';

type AuditAction =
  | 'WORK_CREATED'
  | 'WORK_UPDATED'
  | 'WORK_SUBMITTED'
  | 'WORK_APPROVED'
  | 'WORK_REJECTED'
  | 'WORK_PAID';

const AUDIT_ACTION_MESSAGES: Record<AuditAction, string> = {
  WORK_CREATED: 'Work card created',
  WORK_UPDATED: 'Work card updated',
  WORK_SUBMITTED: 'Work card submitted',
  WORK_APPROVED: 'Work card approved',
  WORK_REJECTED: 'Work card rejected',
  WORK_PAID: 'Work card paid',
};

async function logAuditEvent(params: {
  companyId: string;
  workCardId: string;
  projectId?: string | null; // currently unused but kept for future schema evolution
  action: AuditAction;
  userId: string;
  userName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const companyId = requireCompanyId(params.companyId);
  const metadataPayload = params.metadata != null && typeof params.metadata === 'object' ? params.metadata : {};
  const message = (params.metadata && typeof (params.metadata as { message?: string }).message === 'string')
    ? (params.metadata as { message: string }).message
    : AUDIT_ACTION_MESSAGES[params.action];

  const auditPayload = {
    company_id: companyId,
    work_card_id: params.workCardId,
    actor_id: params.userId,
    event_type: params.action,
    message,
    payload: metadataPayload,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('ops.audit_logs payload', auditPayload);
  }

  const { error } = await db
    .ops()
    .from(AUDIT_LOGS_TABLE)
    .insert(auditPayload);

  if (error) {
    // Audit failures should not break main flow but should be visible in logs.
    // eslint-disable-next-line no-console
    console.error('[operations] Failed to log audit event', params.action, error);
  }
}

function computePlannedTotal(workers: number, rate: number): number {
  return Math.max(0, workers) * Math.max(0, rate);
}

/** Ensure optional UUID is never the string "undefined" or "null" sent to Postgres. */
function normalizeOptionalUuid(v: string | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '' || t === 'undefined' || t === 'null') return null;
  return t;
}

function computeActualTotal(workers: number | null, rate: number | null): number | null {
  if (workers == null || rate == null) return null;
  if (workers <= 0 || rate <= 0) return null;
  return workers * rate;
}

function mapRowToWorkCard(row: WorkCardRow): WorkCard {
  const payload = row.payload ?? {};
  const payment: WorkCardPayment = {
    isPaid: Boolean(payload.payment?.isPaid),
    amount: payload.payment?.amount ?? null,
    method: payload.payment?.method ?? null,
    paidAt: payload.payment?.paidAt ?? null,
    paidByUserId: payload.payment?.paidByUserId ?? null,
    paidByName: payload.payment?.paidByName ?? null,
  };

  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,

    stageId: payload.stageId ?? null,
    stageIndex: payload.stageIndex ?? null,
    stageName: payload.stageName ?? null,
    blockId: payload.blockId ?? null,
    blockName: payload.blockName ?? null,

    workTitle: payload.workTitle ?? '',
    workCategory: payload.workCategory ?? '',

    plannedDate: payload.plannedDate ?? null,
    plannedWorkers: payload.plannedWorkers ?? 0,
    plannedRatePerPerson: payload.plannedRatePerPerson ?? 0,
    plannedTotal: payload.plannedTotal ?? 0,
    notes: payload.notes ?? null,

    actualDate: payload.actualDate ?? null,
    actualWorkers: payload.actualWorkers ?? null,
    actualRatePerPerson: payload.actualRatePerPerson ?? null,
    actualTotal: payload.actualTotal ?? null,
    executionNotes: payload.executionNotes ?? null,
    managerId: payload.managerId ?? null,
    managerName: payload.managerName ?? null,

    allocatedManagerId: row.allocated_manager_id,

    payment,

    status: (row.status as WorkCardStatus) ?? 'planned',

    createdByAdminId: payload.createdByAdminId ?? '',
    createdByAdminName: payload.createdByAdminName ?? null,
    createdByManagerId: payload.createdByManagerId ?? null,

    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,

    approvedByUserId: payload.approvedByUserId ?? null,
    approvedByName: payload.approvedByName ?? null,
    approvedAt: payload.approvedAt ?? null,

    rejectionReason: payload.rejectionReason ?? null,
    rejectedByUserId: payload.rejectedByUserId ?? null,
    rejectedByName: payload.rejectedByName ?? null,
    rejectedAt: payload.rejectedAt ?? null,
  };
}

async function getRowById(id: string): Promise<WorkCardRow | null> {
  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .eq('id', id)
    .maybeSingle<WorkCardRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function getWorkCardById(id: string): Promise<WorkCard | null> {
  const row = await getRowById(id);
  if (!row) return null;
  return mapRowToWorkCard(row);
}

export async function createWorkCard(input: CreateWorkCardInput): Promise<WorkCard> {
  const companyId = requireCompanyId(input.companyId);

  const plannedTotal = computePlannedTotal(input.plannedWorkers, input.plannedRatePerPerson);

  const payload = {
    stageId: input.stageId ?? null,
    stageIndex: input.stageIndex ?? null,
    stageName: input.stageName ?? null,
    blockId: input.blockId ?? null,
    blockName: input.blockName ?? null,

    workTitle: input.workTitle,
    workCategory: input.workCategory,
    plannedDate: input.plannedDate,
    plannedWorkers: input.plannedWorkers,
    plannedRatePerPerson: input.plannedRatePerPerson,
    plannedTotal,
    notes: input.notes ?? null,

    actualDate: null,
    actualWorkers: null,
    actualRatePerPerson: null,
    actualTotal: null,
    executionNotes: null,
    managerId: null,
    managerName: null,

    payment: {
      isPaid: false,
      amount: null,
      method: null,
      paidAt: null,
      paidByUserId: null,
      paidByName: null,
    } as WorkCardPayment,

    createdByAdminId: input.createdByAdminId,
    createdByAdminName: input.createdByAdminName ?? null,
    createdByManagerId: input.createdByManagerId ?? null,

    approvedByUserId: null,
    approvedByName: null,
    approvedAt: null,

    rejectionReason: null,
    rejectedByUserId: null,
    rejectedByName: null,
    rejectedAt: null,
  };

  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .insert({
      company_id: companyId,
      project_id: input.projectId,
      title: input.workTitle,
      status: 'planned',
      allocated_manager_id: input.allocatedManagerId,
      payload,
    })
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .single<WorkCardRow>();

  if (error) {
    throw error;
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[operationsWorkCardService] createWorkCard insert result', {
      id: data.id,
      project_id: data.project_id,
      status: data.status,
      company_id: data.company_id,
    });
  }

  await logAuditEvent({
    companyId,
    workCardId: data.id,
    projectId: input.projectId,
    action: 'WORK_CREATED',
    userId: input.actorUserId,
    userName: input.actorUserName,
    metadata: {
      workTitle: input.workTitle,
      projectId: input.projectId,
    },
  });

  return mapRowToWorkCard(data);
}

export async function updateWorkCard(input: UpdateWorkCardInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'planned') {
    throw new Error('Only planned cards can be edited in Phase 1');
  }

  const payload = {
    ...row.payload,
    workTitle: input.workTitle ?? card.workTitle,
    workCategory: input.workCategory ?? card.workCategory,
    plannedDate: input.plannedDate ?? card.plannedDate,
    plannedWorkers: input.plannedWorkers ?? card.plannedWorkers,
    plannedRatePerPerson: input.plannedRatePerPerson ?? card.plannedRatePerPerson,
    plannedTotal: computePlannedTotal(
      input.plannedWorkers ?? card.plannedWorkers,
      input.plannedRatePerPerson ?? card.plannedRatePerPerson,
    ),
    notes: input.notes ?? card.notes,
    stageId: input.stageId ?? card.stageId,
    stageIndex: input.stageIndex ?? card.stageIndex,
    stageName: input.stageName ?? card.stageName,
    blockId: input.blockId ?? card.blockId,
    blockName: input.blockName ?? card.blockName,
  };

  const allocatedManagerId = normalizeOptionalUuid(
    input.allocatedManagerId !== undefined ? input.allocatedManagerId : card.allocatedManagerId
  );

  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: card.status,
      allocated_manager_id: allocatedManagerId,
      payload,
    })
    .eq('id', input.id)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .single<WorkCardRow>();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_UPDATED',
    userId: input.actorUserId,
    userName: input.actorUserName,
  });

  return mapRowToWorkCard(data);
}

export async function deleteWorkCard(params: { id: string; actorUserId: string }): Promise<void> {
  const row = await getRowById(params.id);
  if (!row) {
    throw new Error('Work card not found');
  }
  const card = mapRowToWorkCard(row);
  if (card.status !== 'planned') {
    throw new Error('Only planned work cards can be deleted');
  }
  const { error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .delete()
    .eq('id', params.id);
  if (error) throw error;
}

export async function submitExecution(input: SubmitExecutionInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'planned') {
    throw new Error('Only planned cards can be submitted');
  }

  if (card.allocatedManagerId && card.allocatedManagerId !== input.managerId) {
    throw new Error('You are not allowed to submit this work card');
  }

  if (input.actualWorkers <= 0 || input.actualRatePerPerson <= 0) {
    throw new Error('Actual workers and rate must be greater than zero');
  }

  const actualTotal = computeActualTotal(input.actualWorkers, input.actualRatePerPerson);

  const payload = {
    ...row.payload,
    actualDate: input.actualDate,
    actualWorkers: input.actualWorkers,
    actualRatePerPerson: input.actualRatePerPerson,
    actualTotal,
    executionNotes: input.executionNotes ?? null,
    managerId: input.managerId,
    managerName: input.managerName,
  };

  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: 'submitted',
      payload,
    })
    .eq('id', input.id)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .single<WorkCardRow>();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_SUBMITTED',
    userId: input.actorUserId,
    userName: input.actorUserName,
  });

  return mapRowToWorkCard(data);
}

export async function approveWorkCard(input: ApproveWorkCardInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'submitted') {
    throw new Error('Only submitted cards can be approved');
  }

  if (!card.actualWorkers || !card.actualRatePerPerson || card.actualWorkers <= 0 || card.actualRatePerPerson <= 0) {
    throw new Error('Cannot approve card without valid actual workers and rate');
  }

  const payload = {
    ...row.payload,
    approvedByUserId: input.actorUserId,
    approvedByName: input.actorUserName ?? null,
    approvedAt: new Date().toISOString(),
  };

  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: 'approved',
      payload,
    })
    .eq('id', input.id)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .single<WorkCardRow>();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_APPROVED',
    userId: input.actorUserId,
    userName: input.actorUserName,
  });

  return mapRowToWorkCard(data);
}

export async function rejectWorkCard(input: RejectWorkCardInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'submitted') {
    throw new Error('Only submitted cards can be rejected');
  }

  if (!input.rejectionReason || input.rejectionReason.trim().length === 0) {
    throw new Error('Rejection reason is required');
  }

  const payload = {
    ...row.payload,
    rejectionReason: input.rejectionReason,
    rejectedByUserId: input.actorUserId,
    rejectedByName: input.actorUserName ?? null,
    rejectedAt: new Date().toISOString(),
  };

  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: 'rejected',
      payload,
    })
    .eq('id', input.id)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .single<WorkCardRow>();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_REJECTED',
    userId: input.actorUserId,
    userName: input.actorUserName,
    metadata: { rejectionReason: input.rejectionReason },
  });

  return mapRowToWorkCard(data);
}

export async function markWorkCardPaid(input: MarkWorkCardPaidInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'approved') {
    throw new Error('Only approved cards can be marked as paid');
  }

  if (card.payment.isPaid) {
    throw new Error('Card is already marked as paid');
  }

  const baseAmount =
    input.amount ??
    card.actualTotal ??
    computeActualTotal(card.actualWorkers ?? null, card.actualRatePerPerson ?? null) ??
    card.plannedTotal;

  if (!baseAmount || baseAmount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const payment: WorkCardPayment = {
    isPaid: true,
    amount: baseAmount,
    method: input.method,
    paidAt: input.paidAt,
    paidByUserId: input.actorUserId,
    paidByName: input.actorUserName ?? null,
  };

  const payload = {
    ...row.payload,
    payment,
  };

  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: 'paid',
      payload,
    })
    .eq('id', input.id)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .single<WorkCardRow>();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_PAID',
    userId: input.actorUserId,
    userName: input.actorUserName,
    metadata: { amount: baseAmount, method: input.method },
  });

  return mapRowToWorkCard(data);
}

export async function getWorkCardsForCompany(params: {
  companyId: string;
  projectId?: string | null;
}): Promise<WorkCard[]> {
  const companyId = requireCompanyId(params.companyId);

  let query = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }

  const { data, error } = await query.returns<WorkCardRow[]>();
  if (error) throw error;

  const cards = (data ?? []).map(mapRowToWorkCard);
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[operationsWorkCardService] getWorkCardsForCompany', {
      companyId,
      projectId: params.projectId ?? 'all',
      count: cards.length,
      ids: cards.map((c) => c.id),
    });
  }
  return cards;
}

export async function getWorkCardsForManager(params: {
  companyId: string;
  managerId: string;
  projectId?: string | null;
}): Promise<WorkCard[]> {
  const companyId = requireCompanyId(params.companyId);

  let query = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .select('id, company_id, project_id, status, allocated_manager_id, payload, created_at, updated_at')
    .eq('company_id', companyId)
    .eq('allocated_manager_id', params.managerId)
    .order('created_at', { ascending: false });

  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }

  const { data, error } = await query.returns<WorkCardRow[]>();
  if (error) throw error;

  return (data ?? []).map(mapRowToWorkCard);
}

export function canManagerSubmit(card: WorkCard, managerIds: string[]): boolean {
  if (card.status !== 'planned') return false;
  if (!card.allocatedManagerId) return false;
  if (!managerIds || managerIds.length === 0) return false;
  return managerIds.includes(card.allocatedManagerId);
}

export function canAdminApproveOrReject(card: WorkCard): boolean {
  return card.status === 'submitted';
}

export function canMarkAsPaid(card: WorkCard): boolean {
  return card.status === 'approved' && !card.payment.isPaid;
}

export type WorkCardAuditLog = {
  id: string;
  companyId: string;
  workCardId: string;
  eventType: string;
  actorId: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export async function getAuditLogsForWorkCard(workCardId: string): Promise<WorkCardAuditLog[]> {
  const { data, error } = await db
    .ops()
    .from(AUDIT_LOGS_TABLE)
    .select('id, company_id, work_card_id, event_type, actor_id, message, payload, created_at')
    .eq('work_card_id', workCardId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    companyId: row.company_id,
    workCardId: row.work_card_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    message: row.message,
    payload: row.payload,
    createdAt: row.created_at,
  }));
}


