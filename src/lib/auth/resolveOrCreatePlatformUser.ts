import { supabase } from '@/lib/supabase';
import { normalizeAuthEmail } from '@/lib/auth/normalizeAuthEmail';
import { logError } from '@/lib/errors/appError';

export type ResolvePlatformProfileAction = 'existing' | 'merged_from_email' | 'created';

export type ResolvePlatformProfileResult = {
  clerk_user_id: string;
  action: ResolvePlatformProfileAction;
};

/**
 * Single source of truth for platform user (core.profiles): match by Clerk id, else by normalized email and merge.
 * Call once per auth bootstrap after JWT is available — before onboarding / company / membership flows.
 */
export async function resolveOrCreatePlatformUser(params: {
  clerkUserId: string;
  email: string | null | undefined;
}): Promise<ResolvePlatformProfileResult | null> {
  const clerkUserId = String(params.clerkUserId || '').trim();
  if (!clerkUserId) return null;

  const p_email = normalizeAuthEmail(params.email);
  const { data, error } = await supabase.rpc('resolve_or_ensure_platform_profile', {
    p_email: p_email || null,
  });

  if (error) {
    logError(error, {
      operation: 'resolveOrCreatePlatformUser',
      userId: clerkUserId,
    });
    return null;
  }

  const row = data as { clerk_user_id?: string; action?: string } | null;
  const id = row?.clerk_user_id != null ? String(row.clerk_user_id) : clerkUserId;
  const act = row?.action;
  const action: ResolvePlatformProfileAction =
    act === 'merged_from_email' ? 'merged_from_email' : act === 'created' ? 'created' : 'existing';

  return { clerk_user_id: id, action };
}
