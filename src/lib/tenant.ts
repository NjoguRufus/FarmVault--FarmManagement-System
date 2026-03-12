import { supabase } from '@/lib/supabase';

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

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[tenant] resolveCompanyIdForWrite', {
      profileCompanyId,
      callerCompanyId: caller,
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

  const resolved = profileCompanyId ?? caller;
  if (!resolved) {
    throw new Error(
      'No active company found for this session. Please select a farm or sign in again.',
    );
  }

  return resolved;
}

