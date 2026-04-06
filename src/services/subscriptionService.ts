import { supabase } from '@/lib/supabase';

export type CompanySubscriptionGateStatus =
  | 'pending_approval'
  | 'pending_payment'
  | 'trial'
  | 'trialing'
  | 'active'
  | 'suspended'
  | 'rejected'
  | 'expired';

export interface CompanySubscriptionGateState {
  company_id: string;
  company_name: string | null;
  /** core.companies.status: pending | active | suspended */
  company_status?: string | null;
  /** PayBill account number from core.companies (FV- + md8); exposed for billing UI when company row select omits it. */
  billing_reference?: string | null;
  selected_plan: 'basic' | 'pro' | string;
  billing_mode: 'manual' | string;
  status: CompanySubscriptionGateStatus | string;
  created_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  override_reason: string | null;
  /** Present when get_subscription_gate_state includes trial columns (newer migrations). */
  is_trial?: boolean | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  developer_override_active?: boolean | null;
  billing_cycle?: string | null;
  current_period_end?: string | null;
  active_until?: string | null;
}

export async function getSubscriptionGateState(): Promise<CompanySubscriptionGateState | null> {
  const { data, error } = await supabase.rpc('get_subscription_gate_state');
  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription gate state');
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as CompanySubscriptionGateState | null) ?? null;
}

/** Member-visible STK rows — aligns tenant UI with developer when gate RPC lags behind mpesa_payments. */
export function mpesaRowIndicatesConfirmedPayment(row: {
  result_code?: number | null;
  status?: string | null;
}): boolean {
  if (row.result_code != null && row.result_code === 0) return true;
  const u = String(row.status ?? '').toUpperCase();
  return u === 'SUCCESS' || u === 'COMPLETED';
}

/** Failed STK attempt (developer Payments tab includes these). */
export function mpesaRowIndicatesFailedPayment(row: {
  result_code?: number | null;
  status?: string | null;
}): boolean {
  if (mpesaRowIndicatesConfirmedPayment(row)) return false;
  if (row.result_code != null && row.result_code !== 0) return true;
  const u = String(row.status ?? '').toUpperCase();
  return u === 'FAILED' || u === 'FAILURE';
}

export async function hasConfirmedMpesaStkForCompany(companyId: string): Promise<boolean> {
  const cid = companyId.trim();
  if (!cid) return false;
  const { data, error } = await supabase
    .from('mpesa_payments')
    .select('id,result_code,status')
    .eq('company_id', cid)
    .limit(80);
  if (error || !data?.length) return false;
  return data.some((r) => mpesaRowIndicatesConfirmedPayment(r as { result_code?: number | null; status?: string | null }));
}

export type DeveloperSubscriptionAction =
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'activate'
  | 'start_trial'
  | 'extend'
  | 'set_plan';

export type SetCompanySubscriptionStateResult = {
  /** True when the company just left pending_approval via approve/activate; trigger workspace-ready email. */
  workspace_ready_email: boolean;
  /** Canonical UUID echoed from the server (use for email lookup, not a stale UI id). */
  company_id?: string | null;
};

export async function setCompanySubscriptionState(input: {
  companyId: string;
  action: DeveloperSubscriptionAction;
  planCode?: 'basic' | 'pro' | null;
  reason?: string | null;
  days?: number | null;
}): Promise<SetCompanySubscriptionStateResult> {
  const { data, error } = await supabase.rpc('set_company_subscription_state', {
    _company_id: input.companyId,
    _action: input.action,
    _plan_code: input.planCode ?? null,
    _reason: input.reason ?? null,
    _days: input.days ?? null,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to update company subscription state');
  }
  const payload = data as { workspace_ready_email?: boolean; company_id?: string | null } | null;
  const cid =
    payload?.company_id != null && String(payload.company_id).trim() !== ''
      ? String(payload.company_id).trim()
      : input.companyId;
  return {
    workspace_ready_email: !!payload?.workspace_ready_email,
    company_id: cid,
  };
}

/** After Pro trial ends, company admin picks Basic or Pro (updates company_subscriptions.plan_code, clears is_trial). */
export async function choosePostTrialPlan(planCode: 'basic' | 'pro'): Promise<void> {
  const { error } = await supabase.rpc('choose_post_trial_plan', {
    _plan_code: planCode,
  });
  if (error) {
    throw new Error(error.message ?? 'Failed to save plan');
  }
}

export async function listDuplicateEmails(): Promise<{
  profiles: Array<{ email: string; count: number }>;
  companies: Array<{ email: string; count: number }>;
  employees_per_company: Array<{ company_id: string; email: string; count: number }>;
}> {
  const { data, error } = await supabase.rpc('list_duplicate_emails');
  if (error) {
    throw new Error(error.message ?? 'Failed to list duplicate emails');
  }
  const payload = (data ?? {}) as {
    profiles?: Array<{ email: string; count: number }>;
    companies?: Array<{ email: string; count: number }>;
    employees_per_company?: Array<{ company_id: string; email: string; count: number }>;
  };
  return {
    profiles: Array.isArray(payload.profiles) ? payload.profiles : [],
    companies: Array.isArray(payload.companies) ? payload.companies : [],
    employees_per_company: Array.isArray(payload.employees_per_company) ? payload.employees_per_company : [],
  };
}
