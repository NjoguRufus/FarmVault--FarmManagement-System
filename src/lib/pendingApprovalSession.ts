export const PENDING_APPROVAL_SESSION_KEY = 'farmvault.pendingApproval.v1';

export type PendingApprovalSessionPayload = {
  companyName: string;
  companyEmail: string;
  companyId: string;
  startingPlanLabel: string;
};

export function writePendingApprovalSession(ctx: PendingApprovalSessionPayload) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_APPROVAL_SESSION_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function readPendingApprovalSession(): Partial<PendingApprovalSessionPayload> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_APPROVAL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PendingApprovalSessionPayload>;
  } catch {
    return null;
  }
}
