/** Severity for audit and admin alerts. */
export type AlertSeverity = 'normal' | 'high' | 'critical';

export interface AdminAlertPayload {
  companyId: string;
  severity: AlertSeverity;
  module: string;
  action: string;
  actorUserId?: string | null;
  actorName?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Optional link to audit detail or related page. */
  detailPath?: string | null;
}

export interface AdminAlertRecord extends AdminAlertPayload {
  id: string;
  createdAt: string;
  read?: boolean;
}
