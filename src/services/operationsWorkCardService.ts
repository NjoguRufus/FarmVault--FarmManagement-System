import { db, requireCompanyId } from '@/lib/db';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { enqueueUnifiedNotification } from '@/services/unifiedNotificationPipeline';
import { logger } from "@/lib/logger";
import { ConcurrentUpdateConflictError } from '@/lib/concurrentUpdate';

// New simplified status model: no approval workflow
export type WorkCardStatus = 'planned' | 'logged' | 'edited' | 'paid';

export interface WorkCardPayment {
  isPaid: boolean;
  amount?: number | null;
  method?: 'cash' | 'mpesa' | 'bank' | 'other' | null;
  paidAt?: string | null;
  paidByUserId?: string | null;
  paidByName?: string | null;
  notes?: string | null;
}

export interface InputUsed {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

export interface EditHistoryEntry {
  timestamp: string;
  actorId: string;
  actorName: string | null;
  changes: Record<string, { oldValue: unknown; newValue: unknown }>;
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

  // Planned section
  plannedDate: string | null;
  plannedWorkers: number;
  plannedRatePerPerson: number;
  plannedTotal: number;
  notes: string | null;

  // Actual work section (filled when logged)
  actualDate: string | null;
  actualWorkers: number | null;
  actualRatePerPerson: number | null;
  actualTotal: number | null;
  executionNotes: string | null;
  workDone: string | null;

  // Worker who logged the work
  loggedByUserId: string | null;
  loggedByName: string | null;
  loggedAt: string | null;

  // Allocated worker (who should record work)
  allocatedManagerId: string | null;
  allocatedWorkerName: string | null;

  // Workers involved in the work
  workerIds: string[];
  workerNames: string[];

  // Inputs used (inventory items)
  inputsUsed: InputUsed[];

  // Edit history for transparency
  editHistory: EditHistoryEntry[];

  // Payment info
  payment: WorkCardPayment;

  // Status
  status: WorkCardStatus;

  // Creator info
  createdByAdminId: string;
  createdByAdminName: string | null;
  createdByManagerId: string | null;

  createdAt: string;
  updatedAt: string | null;
  /** When present, maps from ops.work_cards.row_version */
  rowVersion?: number;
}

type WorkCardRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  title: string | null;
  status: string | null;
  allocated_manager_id: string | null;
  payload: any;
  inputs_used: any;
  edit_history: any;
  worker_ids: string[] | null;
  created_at: string;
  updated_at: string;
  row_version?: number | null;
};

const WORK_CARD_ROW_SELECT =
  'id, company_id, project_id, title, status, allocated_manager_id, payload, inputs_used, edit_history, worker_ids, created_at, updated_at, row_version';

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
  allocatedWorkerName?: string | null;
  createdByAdminId: string;
  createdByAdminName?: string | null;
  createdByManagerId?: string | null;
  actorUserId: string;
  actorUserName?: string | null;
};

export type UpdateWorkCardInput = {
  id: string;
  expectedRowVersion?: number | null;
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
  allocatedWorkerName?: string | null;
  actorUserId: string;
  actorUserName?: string | null;
};

export type RecordWorkInput = {
  id: string;
  expectedRowVersion?: number | null;
  actualDate: string;
  actualWorkers: number;
  actualRatePerPerson: number;
  workDone: string;
  executionNotes?: string | null;
  workerIds?: string[];
  workerNames?: string[];
  inputsUsed?: InputUsed[];
  actorUserId: string;
  actorUserName?: string | null;
};

export type EditWorkInput = {
  id: string;
  expectedRowVersion?: number | null;
  actualDate?: string;
  actualWorkers?: number;
  actualRatePerPerson?: number;
  workDone?: string;
  executionNotes?: string | null;
  workerIds?: string[];
  workerNames?: string[];
  inputsUsed?: InputUsed[];
  actorUserId: string;
  actorUserName?: string | null;
};

export type MarkWorkCardPaidInput = {
  id: string;
  expectedRowVersion?: number | null;
  amount: number;
  method?: 'cash' | 'mpesa' | 'bank' | 'other';
  notes?: string | null;
  actorUserId: string;
  actorUserName?: string | null;
};

const WORK_CARDS_TABLE = 'work_cards';
const AUDIT_LOGS_TABLE = 'audit_logs';
const INVENTORY_USAGE_TABLE = 'work_card_inventory_usage';

export type AuditAction =
  | 'WORK_CREATED'
  | 'WORK_UPDATED'
  | 'WORK_LOGGED'
  | 'WORK_EDITED'
  | 'WORK_PAID'
  | 'INVENTORY_USED';

const AUDIT_ACTION_MESSAGES: Record<AuditAction, string> = {
  WORK_CREATED: 'Work card created',
  WORK_UPDATED: 'Work card updated',
  WORK_LOGGED: 'Work logged',
  WORK_EDITED: 'Work edited',
  WORK_PAID: 'Work marked as paid',
  INVENTORY_USED: 'Inventory used',
};

export async function logAuditEvent(params: {
  companyId: string;
  workCardId: string;
  projectId?: string | null;
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
    actor_name: params.userName ?? null,
    event_type: params.action,
    message,
    payload: metadataPayload,
  };

  if (import.meta.env.DEV) {
    logger.log('ops.audit_logs payload', auditPayload);
  }

  const { error } = await db
    .ops()
    .from(AUDIT_LOGS_TABLE)
    .insert(auditPayload);

  if (error) {
    console.error('[operations] Failed to log audit event', params.action, error);
  }
}

function computePlannedTotal(workers: number, rate: number): number {
  return Math.max(0, workers) * Math.max(0, rate);
}

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
  const inputsUsed: InputUsed[] = Array.isArray(row.inputs_used) ? row.inputs_used : [];
  const editHistory: EditHistoryEntry[] = Array.isArray(row.edit_history) ? row.edit_history : [];
  const workerIds: string[] = Array.isArray(row.worker_ids) ? row.worker_ids : [];

  const payment: WorkCardPayment = {
    isPaid: Boolean(payload.payment?.isPaid),
    amount: payload.payment?.amount ?? null,
    method: payload.payment?.method ?? null,
    paidAt: payload.payment?.paidAt ?? null,
    paidByUserId: payload.payment?.paidByUserId ?? null,
    paidByName: payload.payment?.paidByName ?? null,
    notes: payload.payment?.notes ?? null,
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

    workTitle: payload.workTitle ?? row.title ?? '',
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
    workDone: payload.workDone ?? null,

    loggedByUserId: payload.loggedByUserId ?? null,
    loggedByName: payload.loggedByName ?? null,
    loggedAt: payload.loggedAt ?? null,

    allocatedManagerId: row.allocated_manager_id,
    allocatedWorkerName: payload.allocatedWorkerName ?? null,

    workerIds,
    workerNames: payload.workerNames ?? [],

    inputsUsed,
    editHistory,

    payment,

    status: (row.status as WorkCardStatus) ?? 'planned',

    createdByAdminId: payload.createdByAdminId ?? '',
    createdByAdminName: payload.createdByAdminName ?? null,
    createdByManagerId: payload.createdByManagerId ?? null,

    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    rowVersion: row.row_version != null ? Number(row.row_version) : undefined,
  };
}

async function getRowById(id: string): Promise<WorkCardRow | null> {
  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .select(WORK_CARD_ROW_SELECT)
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
    workDone: null,

    loggedByUserId: null,
    loggedByName: null,
    loggedAt: null,

    allocatedWorkerName: input.allocatedWorkerName ?? null,
    workerNames: [],

    payment: {
      isPaid: false,
      amount: null,
      method: null,
      paidAt: null,
      paidByUserId: null,
      paidByName: null,
      notes: null,
    } as WorkCardPayment,

    createdByAdminId: input.createdByAdminId,
    createdByAdminName: input.createdByAdminName ?? null,
    createdByManagerId: input.createdByManagerId ?? null,
  };

  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .insert({
      company_id: companyId,
      project_id: input.projectId,
      title: input.workTitle,
      status: 'planned',
      allocated_manager_id: normalizeOptionalUuid(input.allocatedManagerId),
      payload,
      inputs_used: [],
      edit_history: [],
      worker_ids: [],
    })
    .select(WORK_CARD_ROW_SELECT)
    .single<WorkCardRow>();

  if (error) {
    throw error;
  }

  if (import.meta.env.DEV) {
    logger.log('[operationsWorkCardService] createWorkCard insert result', {
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
      allocatedWorkerName: input.allocatedWorkerName,
    },
  });

  const card = mapRowToWorkCard(data);
  captureEvent(AnalyticsEvents.OPERATION_RECORDED, {
    company_id: companyId,
    project_id: input.projectId,
    module_name: 'operations',
  });
  if (typeof window !== 'undefined') {
    const when = input.plannedDate ? String(input.plannedDate) : 'the schedule';
    enqueueUnifiedNotification({
      tier: 'activity',
      kind: 'staff_work_assigned',
      title: 'Work assigned',
      body: `${input.workTitle || 'New field task'} — planned for ${when}.`,
      path: '/operations',
      toastType: 'info',
      audiences: ['company', 'staff'],
    });
  }
  return card;
}

export async function updateWorkCard(input: UpdateWorkCardInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'planned') {
    throw new Error('Only planned cards can be edited');
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
    allocatedWorkerName: input.allocatedWorkerName ?? card.allocatedWorkerName,
  };

  const allocatedManagerId = normalizeOptionalUuid(
    input.allocatedManagerId !== undefined ? input.allocatedManagerId : card.allocatedManagerId
  );

  let uq = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      title: input.workTitle ?? card.workTitle,
      allocated_manager_id: allocatedManagerId,
      payload,
    })
    .eq('id', input.id);
  const v = input.expectedRowVersion;
  if (v != null && Number.isFinite(Number(v))) {
    uq = uq.eq('row_version', Number(v));
  }
  const { data, error } = await uq.select(WORK_CARD_ROW_SELECT).maybeSingle<WorkCardRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    if (v != null && Number.isFinite(Number(v))) {
      throw new ConcurrentUpdateConflictError();
    }
    throw new Error('Work card update failed');
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

export async function recordWork(input: RecordWorkInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'planned') {
    throw new Error('Only planned cards can have work recorded');
  }

  if (input.actualWorkers <= 0 || input.actualRatePerPerson <= 0) {
    throw new Error('Workers and rate must be greater than zero');
  }

  const actualTotal = computeActualTotal(input.actualWorkers, input.actualRatePerPerson);
  const inputsUsed = input.inputsUsed ?? [];
  const workerIds = input.workerIds ?? [];
  const workerNames = input.workerNames ?? [];

  const payload = {
    ...row.payload,
    actualDate: input.actualDate,
    actualWorkers: input.actualWorkers,
    actualRatePerPerson: input.actualRatePerPerson,
    actualTotal,
    workDone: input.workDone,
    executionNotes: input.executionNotes ?? null,
    loggedByUserId: input.actorUserId,
    loggedByName: input.actorUserName ?? null,
    loggedAt: new Date().toISOString(),
    workerNames,
  };

  let uqRw = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: 'logged',
      payload,
      inputs_used: inputsUsed,
      worker_ids: workerIds,
    })
    .eq('id', input.id);
  const vRw = input.expectedRowVersion;
  if (vRw != null && Number.isFinite(Number(vRw))) {
    uqRw = uqRw.eq('row_version', Number(vRw));
  }
  const { data, error } = await uqRw.select(WORK_CARD_ROW_SELECT).maybeSingle<WorkCardRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    if (vRw != null && Number.isFinite(Number(vRw))) {
      throw new ConcurrentUpdateConflictError();
    }
    throw new Error('Work card update failed');
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_LOGGED',
    userId: input.actorUserId,
    userName: input.actorUserName,
    metadata: {
      workDone: input.workDone,
      actualWorkers: input.actualWorkers,
      actualTotal,
      inputsUsed: inputsUsed.map(i => `${i.quantity} ${i.unit} ${i.itemName}`).join(', '),
    },
  });

  const logged = mapRowToWorkCard(data);
  captureEvent(AnalyticsEvents.WORK_LOG_CREATED, {
    company_id: card.companyId,
    project_id: card.projectId ?? undefined,
    module_name: 'operations',
  });
  if (typeof window !== 'undefined') {
    const label = card.workTitle || card.title || 'Field work';
    enqueueUnifiedNotification({
      tier: 'activity',
      kind: 'activity_operation_logged',
      title: 'Operation logged',
      body: `${label} recorded.`,
      path: '/operations',
      toastType: 'success',
      audiences: ['company', 'staff'],
    });
  }
  return logged;
}

export async function editWork(input: EditWorkInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'logged' && card.status !== 'edited') {
    throw new Error('Only logged or edited cards can be edited');
  }

  const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};

  if (input.actualDate !== undefined && input.actualDate !== card.actualDate) {
    changes.actualDate = { oldValue: card.actualDate, newValue: input.actualDate };
  }
  if (input.actualWorkers !== undefined && input.actualWorkers !== card.actualWorkers) {
    changes.actualWorkers = { oldValue: card.actualWorkers, newValue: input.actualWorkers };
  }
  if (input.actualRatePerPerson !== undefined && input.actualRatePerPerson !== card.actualRatePerPerson) {
    changes.actualRatePerPerson = { oldValue: card.actualRatePerPerson, newValue: input.actualRatePerPerson };
  }
  if (input.workDone !== undefined && input.workDone !== card.workDone) {
    changes.workDone = { oldValue: card.workDone, newValue: input.workDone };
  }
  if (input.executionNotes !== undefined && input.executionNotes !== card.executionNotes) {
    changes.executionNotes = { oldValue: card.executionNotes, newValue: input.executionNotes };
  }
  if (input.inputsUsed !== undefined) {
    const oldInputs = card.inputsUsed.map(i => `${i.quantity} ${i.unit} ${i.itemName}`).join(', ');
    const newInputs = input.inputsUsed.map(i => `${i.quantity} ${i.unit} ${i.itemName}`).join(', ');
    if (oldInputs !== newInputs) {
      changes.inputsUsed = { oldValue: oldInputs, newValue: newInputs };
    }
  }

  const editHistoryEntry: EditHistoryEntry = {
    timestamp: new Date().toISOString(),
    actorId: input.actorUserId,
    actorName: input.actorUserName ?? null,
    changes,
  };

  const existingHistory = Array.isArray(row.edit_history) ? row.edit_history : [];
  const newEditHistory = [...existingHistory, editHistoryEntry];

  const actualWorkers = input.actualWorkers ?? card.actualWorkers;
  const actualRatePerPerson = input.actualRatePerPerson ?? card.actualRatePerPerson;
  const actualTotal = computeActualTotal(actualWorkers, actualRatePerPerson);

  const inputsUsed = input.inputsUsed ?? card.inputsUsed;
  const workerIds = input.workerIds ?? card.workerIds;
  const workerNames = input.workerNames ?? card.workerNames;

  const payload = {
    ...row.payload,
    actualDate: input.actualDate ?? card.actualDate,
    actualWorkers,
    actualRatePerPerson,
    actualTotal,
    workDone: input.workDone ?? card.workDone,
    executionNotes: input.executionNotes ?? card.executionNotes,
    workerNames,
  };

  let uqEw = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: 'edited',
      payload,
      inputs_used: inputsUsed,
      edit_history: newEditHistory,
      worker_ids: workerIds,
    })
    .eq('id', input.id);
  const vEw = input.expectedRowVersion;
  if (vEw != null && Number.isFinite(Number(vEw))) {
    uqEw = uqEw.eq('row_version', Number(vEw));
  }
  const { data, error } = await uqEw.select(WORK_CARD_ROW_SELECT).maybeSingle<WorkCardRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    if (vEw != null && Number.isFinite(Number(vEw))) {
      throw new ConcurrentUpdateConflictError();
    }
    throw new Error('Work card update failed');
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_EDITED',
    userId: input.actorUserId,
    userName: input.actorUserName,
    metadata: {
      changes,
    },
  });

  return mapRowToWorkCard(data);
}

export async function markWorkCardPaid(input: MarkWorkCardPaidInput): Promise<WorkCard> {
  const row = await getRowById(input.id);
  if (!row) {
    throw new Error('Work card not found');
  }

  const card = mapRowToWorkCard(row);

  if (card.status !== 'logged' && card.status !== 'edited') {
    throw new Error('Only logged or edited cards can be marked as paid');
  }

  if (card.payment.isPaid) {
    throw new Error('Card is already marked as paid');
  }

  if (!input.amount || input.amount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const payment: WorkCardPayment = {
    isPaid: true,
    amount: input.amount,
    method: input.method ?? 'cash',
    paidAt: new Date().toISOString(),
    paidByUserId: input.actorUserId,
    paidByName: input.actorUserName ?? null,
    notes: input.notes ?? null,
  };

  const payload = {
    ...row.payload,
    payment,
  };

  let uqPaid = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .update({
      status: 'paid',
      payload,
    })
    .eq('id', input.id);
  const vPaid = input.expectedRowVersion;
  if (vPaid != null && Number.isFinite(Number(vPaid))) {
    uqPaid = uqPaid.eq('row_version', Number(vPaid));
  }
  const { data, error } = await uqPaid.select(WORK_CARD_ROW_SELECT).maybeSingle<WorkCardRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    if (vPaid != null && Number.isFinite(Number(vPaid))) {
      throw new ConcurrentUpdateConflictError();
    }
    throw new Error('Work card update failed');
  }

  await logAuditEvent({
    companyId: card.companyId,
    workCardId: card.id,
    projectId: card.projectId,
    action: 'WORK_PAID',
    userId: input.actorUserId,
    userName: input.actorUserName,
    metadata: { amount: input.amount, method: input.method ?? 'cash' },
  });

  if (typeof window !== 'undefined') {
    const label = card.workTitle || card.title || 'Task';
    enqueueUnifiedNotification({
      tier: 'activity',
      kind: 'activity_task_completed',
      title: 'Task completed',
      body: `${label} marked paid (KES ${input.amount.toLocaleString('en-KE')}).`,
      path: '/operations',
      toastType: 'success',
      audiences: ['company', 'staff'],
    });
  }

  return mapRowToWorkCard(data);
}

export async function recordInventoryUsageForWorkCard(params: {
  workCardId: string;
  companyId: string;
  inputsUsed: InputUsed[];
  actorUserId: string;
  actorUserName?: string | null;
}): Promise<void> {
  if (!params.inputsUsed.length) return;

  const records = params.inputsUsed.map(input => ({
    work_card_id: params.workCardId,
    inventory_item_id: input.itemId,
    inventory_item_name: input.itemName,
    quantity: input.quantity,
    unit: input.unit,
    recorded_by_user_id: params.actorUserId,
    recorded_by_name: params.actorUserName ?? null,
  }));

  const { error } = await db
    .ops()
    .from(INVENTORY_USAGE_TABLE)
    .insert(records);

  if (error) {
    console.error('[operations] Failed to record inventory usage', error);
  }

  await logAuditEvent({
    companyId: params.companyId,
    workCardId: params.workCardId,
    action: 'INVENTORY_USED',
    userId: params.actorUserId,
    userName: params.actorUserName,
    metadata: {
      items: params.inputsUsed.map(i => `${i.quantity} ${i.unit} ${i.itemName}`),
    },
  });
}

export async function getWorkCardsForCompany(params: {
  companyId: string;
  projectId?: string | null;
  status?: WorkCardStatus | WorkCardStatus[];
}): Promise<WorkCard[]> {
  const companyId = requireCompanyId(params.companyId);

  let query = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .select(WORK_CARD_ROW_SELECT)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }

  if (params.status) {
    if (Array.isArray(params.status)) {
      query = query.in('status', params.status);
    } else {
      query = query.eq('status', params.status);
    }
  }

  const { data, error } = await query.returns<WorkCardRow[]>();
  if (error) throw error;

  const cards = (data ?? []).map(mapRowToWorkCard);
  if (import.meta.env.DEV) {
    logger.log('[operationsWorkCardService] getWorkCardsForCompany', {
      companyId,
      projectId: params.projectId ?? 'all',
      status: params.status ?? 'all',
      count: cards.length,
    });
  }
  return cards;
}

export async function getWorkCardsForWorker(params: {
  companyId: string;
  workerId: string;
  projectId?: string | null;
}): Promise<WorkCard[]> {
  const companyId = requireCompanyId(params.companyId);

  let query = db
    .ops()
    .from(WORK_CARDS_TABLE)
    .select(WORK_CARD_ROW_SELECT)
    .eq('company_id', companyId)
    .eq('allocated_manager_id', params.workerId)
    .order('created_at', { ascending: false });

  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }

  const { data, error } = await query.returns<WorkCardRow[]>();
  if (error) throw error;

  return (data ?? []).map(mapRowToWorkCard);
}

export async function getTodayWorkCards(companyId: string): Promise<WorkCard[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await db
    .ops()
    .from(WORK_CARDS_TABLE)
    .select(WORK_CARD_ROW_SELECT)
    .eq('company_id', companyId)
    .gte('created_at', `${today}T00:00:00`)
    .order('created_at', { ascending: false })
    .returns<WorkCardRow[]>();

  if (error) throw error;

  return (data ?? []).map(mapRowToWorkCard);
}

export async function getTodayInventoryUsage(companyId: string): Promise<{
  itemId: string;
  itemName: string;
  totalQuantity: number;
  unit: string;
}[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await db
    .ops()
    .from(INVENTORY_USAGE_TABLE)
    .select('inventory_item_id, inventory_item_name, quantity, unit')
    .gte('recorded_at', `${today}T00:00:00`);

  if (error) {
    console.error('[operations] Failed to get today inventory usage', error);
    return [];
  }

  const usageMap = new Map<string, { itemId: string; itemName: string; totalQuantity: number; unit: string }>();
  
  for (const row of data ?? []) {
    const key = row.inventory_item_id;
    const existing = usageMap.get(key);
    if (existing) {
      existing.totalQuantity += Number(row.quantity);
    } else {
      usageMap.set(key, {
        itemId: row.inventory_item_id,
        itemName: row.inventory_item_name ?? 'Unknown',
        totalQuantity: Number(row.quantity),
        unit: row.unit ?? '',
      });
    }
  }

  return Array.from(usageMap.values());
}

export function canRecordWork(card: WorkCard): boolean {
  return card.status === 'planned';
}

export function canEditWork(card: WorkCard): boolean {
  return card.status === 'logged' || card.status === 'edited';
}

export function canMarkAsPaid(card: WorkCard): boolean {
  return (card.status === 'logged' || card.status === 'edited') && !card.payment.isPaid;
}

export function isEdited(card: WorkCard): boolean {
  return card.status === 'edited' || (card.editHistory && card.editHistory.length > 0);
}

export type WorkCardAuditLog = {
  id: string;
  companyId: string;
  workCardId: string;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export async function getAuditLogsForWorkCard(workCardId: string): Promise<WorkCardAuditLog[]> {
  const { data, error } = await db
    .ops()
    .from(AUDIT_LOGS_TABLE)
    .select('id, company_id, work_card_id, event_type, actor_id, actor_name, message, payload, created_at')
    .eq('work_card_id', workCardId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    companyId: row.company_id,
    workCardId: row.work_card_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    message: row.message,
    payload: row.payload,
    createdAt: row.created_at,
  }));
}

export async function getRecentAuditLogs(companyId: string, limit = 50): Promise<WorkCardAuditLog[]> {
  const { data, error } = await db
    .ops()
    .from(AUDIT_LOGS_TABLE)
    .select('id, company_id, work_card_id, event_type, actor_id, actor_name, message, payload, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    companyId: row.company_id,
    workCardId: row.work_card_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    message: row.message,
    payload: row.payload,
    createdAt: row.created_at,
  }));
}

// Legacy compatibility exports
export const getWorkCardsForManager = getWorkCardsForWorker;
export function canManagerSubmit(card: WorkCard, managerIds: string[]): boolean {
  if (card.status !== 'planned') return false;
  if (!card.allocatedManagerId) return false;
  if (!managerIds || managerIds.length === 0) return false;
  return managerIds.includes(card.allocatedManagerId);
}
export function canAdminApproveOrReject(_card: WorkCard): boolean {
  return false;
}
export const submitExecution = recordWork;
export const approveWorkCard = async (_input: any): Promise<WorkCard> => {
  throw new Error('Approval workflow removed - use recordWork instead');
};
export const rejectWorkCard = async (_input: any): Promise<WorkCard> => {
  throw new Error('Rejection workflow removed');
};
