import type { Json } from '@/lib/supabase-types';

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

export interface WorkCardItem {
  id: string;
  workCardId: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  createdAt: string;
  updatedAt: string | null;
}

export type WorkCardAuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'MARK_PAID';

export interface WorkCardAuditLog {
  id: string;
  companyId: string;
  workCardId: string;
  action: WorkCardAuditAction;
  userId: string;
  userName: string | null;
  metadata: Json | null;
  createdAt: string;
}

// ==== Payload types ====

export interface CreateWorkCardPayload {
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
}

export interface UpdateWorkCardPayload {
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
}

export interface SubmitExecutionPayload {
  id: string;
  actualDate: string;
  actualWorkers: number;
  actualRatePerPerson: number;
  executionNotes?: string | null;
  managerId: string;
  managerName: string;
  actorUserId: string;
  actorUserName?: string | null;
}

export interface ApproveWorkCardPayload {
  id: string;
  actorUserId: string;
  actorUserName?: string | null;
}

export interface RejectWorkCardPayload {
  id: string;
  rejectionReason: string;
  actorUserId: string;
  actorUserName?: string | null;
}

export interface MarkWorkCardPaidPayload {
  id: string;
  amount?: number;
  method: 'cash' | 'mpesa' | 'bank' | 'other';
  paidAt: string; // ISO datetime
  actorUserId: string;
  actorUserName?: string | null;
}

