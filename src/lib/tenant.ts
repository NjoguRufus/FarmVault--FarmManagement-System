import { supabase } from '@/lib/supabase';
import { logger } from "@/lib/logger";

function looksLikeClerkUserId(value: string | null): boolean {
  if (!value) return false;
  return value.startsWith('user_');
}

async function resolveCompanyIdFromWorkspaceStatusRpc(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_company_workspace_status');
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    const companyId = row && typeof row === 'object' ? String((row as { company_id?: unknown }).company_id ?? '').trim() : '';
    return companyId || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the effective company_id for Supabase writes using the authenticated user context.
 *
 * - Prefers Supabase `current_company_id()` (profiles.company_id via auth.uid()).
 * - Falls back to the caller-provided companyId when the RPC is unavailable or null.
 * - Detects mismatches between Supabase profile company_id and caller companyId and throws with a clear error.
 * - Logs helpful debug information in development.
 */
export async function resolveCompanyIdForWrite(
  callerCompanyId?: string | null,
): Promise<string> {
  const caller = (callerCompanyId ?? '').trim() || null;
  const callerLooksLikeUserId = looksLikeClerkUserId(caller);

  let profileCompanyId: string | null = null;
  try {
    const { data, error } = await supabase.rpc('current_company_id');
    if (!error && typeof data === 'string' && data.trim()) {
      profileCompanyId = data.trim();
    } else if (error && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[tenant] current_company_id RPC error', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
      });
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[tenant] current_company_id RPC threw', err);
    }
  }

  if (looksLikeClerkUserId(profileCompanyId)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[tenant] current_company_id returned Clerk user id; ignoring invalid value', {
        profileCompanyId,
      });
    }
    profileCompanyId = null;
  }

  let workspaceCompanyId: string | null = null;
  if (!profileCompanyId && callerLooksLikeUserId) {
    workspaceCompanyId = await resolveCompanyIdFromWorkspaceStatusRpc();
  }

  if (looksLikeClerkUserId(workspaceCompanyId)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[tenant] get_my_company_workspace_status returned Clerk user id; ignoring invalid value', {
        workspaceCompanyId,
      });
    }
    workspaceCompanyId = null;
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[tenant] resolveCompanyIdForWrite', {
      profileCompanyId,
      workspaceCompanyId,
      callerCompanyId: caller,
      callerLooksLikeUserId,
    });
  }

  if (profileCompanyId && caller && profileCompanyId !== caller) {
    const msg = `Company mismatch between Supabase profile (${profileCompanyId}) and client (${caller}). Please refresh the app or contact support.`;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[tenant] companyId mismatch', {
        profileCompanyId,
        callerCompanyId: caller,
      });
    }
    throw new Error(msg);
  }

  const resolved = profileCompanyId ?? workspaceCompanyId ?? (callerLooksLikeUserId ? null : caller);
  if (looksLikeClerkUserId(resolved)) {
    throw new Error(
      'Invalid company context detected (received a user ID instead of company ID). Please refresh and select your workspace again.',
    );
  }
  if (!resolved) {
    throw new Error(
      'No active company found for this session. Please select a farm or sign in again.',
    );
  }

  return resolved;
}

