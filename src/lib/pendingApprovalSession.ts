export const PENDING_APPROVAL_SESSION_KEY = 'farmvault.pendingApproval.v1';
/** Same payload in localStorage so new tabs / restarts still avoid “create company again” loops. */
export const PENDING_APPROVAL_LOCAL_KEY = 'farmvault.pendingApproval.local.v1';

export type PendingApprovalSessionPayload = {
  companyName: string;
  companyEmail: string;
  companyId: string;
  startingPlanLabel: string;
};

export function writePendingApprovalSession(ctx: PendingApprovalSessionPayload) {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(ctx);
  try {
    sessionStorage.setItem(PENDING_APPROVAL_SESSION_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(PENDING_APPROVAL_LOCAL_KEY, json);
  } catch {
    /* ignore */
  }
}

/** Clears onboarding “pending approval” context (e.g. after developer deletes the company). */
export function clearPendingApprovalSession() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_APPROVAL_SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(PENDING_APPROVAL_LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

export function readPendingApprovalSession(): Partial<PendingApprovalSessionPayload> | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawSession = sessionStorage.getItem(PENDING_APPROVAL_SESSION_KEY);
    if (rawSession) return JSON.parse(rawSession) as Partial<PendingApprovalSessionPayload>;
  } catch {
    /* ignore */
  }
  try {
    const rawLocal = localStorage.getItem(PENDING_APPROVAL_LOCAL_KEY);
    if (rawLocal) return JSON.parse(rawLocal) as Partial<PendingApprovalSessionPayload>;
  } catch {
    /* ignore */
  }
  return null;
}
