/**
 * Invited employee activation: SECURITY DEFINER RPC only.
 *
 * DO NOT query public.employees from the browser. RLS blocks unactivated invites.
 * This module must only call supabase.rpc("activate_invited_employee_by_email", ...).
 */
import { supabase } from '@/lib/supabase';

export interface LinkCurrentUserToInvitedEmployeeInput {
  clerk_user_id: string;
  email: string;
}

export type LinkResult = {
  matched: boolean;
  company_id?: string | null;
  employee_id?: string | null;
  role?: string | null;
  status?: string | null;
};

export async function linkCurrentUserToInvitedEmployee(
  input: LinkCurrentUserToInvitedEmployeeInput
): Promise<LinkResult> {
  const email = input.email?.trim()?.toLowerCase();
  if (!email || !input.clerk_user_id) {
    return { matched: false };
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Auth] Calling activate_invited_employee_by_email RPC', {
      p_email: email,
      p_clerk_user_id: input.clerk_user_id,
    });
  }

  const { data, error } = await supabase.rpc('activate_invited_employee_by_email', {
    p_email: email,
    p_clerk_user_id: input.clerk_user_id,
  });

  const row = Array.isArray(data) ? data?.[0] : data;
  const matched = Boolean(row?.matched);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Auth] activate_invited_employee_by_email result', {
      matched,
      company_id: row?.company_id ?? null,
      employee_id: row?.employee_id ?? null,
      role: row?.role ?? null,
      status: row?.status ?? 'active',
      error: error ?? null,
    });
  }

  if (error || !matched) {
    return { matched: false };
  }

  return {
    matched: true,
    company_id: row?.company_id ?? null,
    employee_id: row?.employee_id ?? null,
    role: row?.role ?? null,
    status: row?.status ?? 'active',
  };
}
