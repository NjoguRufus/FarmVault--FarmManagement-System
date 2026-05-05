/**
 * Tenant membership recovery utilities.
 *
 * pickFirstExistingMembershipCompany — finds the user's most-recent membership
 * whose company row still exists. Uses a single DB RPC (pick_first_existing_membership)
 * instead of the previous N+1 pattern (fetch rows → call company_exists per row).
 */
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { logError } from '@/lib/errors/appError';

/**
 * Returns the newest company membership the user has where the company still exists.
 * Single DB round-trip via the pick_first_existing_membership RPC.
 */
export async function pickFirstExistingMembershipCompany(
  clerkUserId: string,
): Promise<{ companyId: string; role: string } | null> {
  if (!clerkUserId) return null;

  try {
    const { data, error } = await supabase.rpc('pick_first_existing_membership', {
      p_clerk_user_id: clerkUserId,
    });

    if (error) {
      logError(error, {
        operation: 'pickFirstExistingMembershipCompany',
        userId: clerkUserId,
      });
      // Fall through to legacy client-side path below
    } else if (data && Array.isArray(data) && data.length > 0) {
      const row = data[0] as { company_id: string; role: string };
      if (row.company_id) {
        return { companyId: String(row.company_id), role: row.role || 'employee' };
      }
    } else if (data && !Array.isArray(data) && (data as { company_id?: string }).company_id) {
      const row = data as { company_id: string; role: string };
      return { companyId: String(row.company_id), role: row.role || 'employee' };
    }
  } catch (rpcError) {
    logError(rpcError, {
      operation: 'pickFirstExistingMembershipCompany.rpc',
      userId: clerkUserId,
    });
  }

  // ---------------------------------------------------------------------------
  // Fallback: client-side query path used if RPC is unavailable or returns null.
  // This path still makes multiple round-trips but is only hit on RPC failure.
  // ---------------------------------------------------------------------------
  return legacyPickFirstExistingMembership(clerkUserId);
}

async function legacyPickFirstExistingMembership(
  clerkUserId: string,
): Promise<{ companyId: string; role: string } | null> {
  try {
    const { data: coreRows } = await db
      .core()
      .from('company_members')
      .select('company_id, role, created_at')
      .eq('clerk_user_id', clerkUserId)
      .order('created_at', { ascending: false });

    const fromCore = await firstMembershipWithExistingCompany(coreRows as MemRow[] | null);
    if (fromCore) return fromCore;

    const { data: pubRows } = await db
      .public()
      .from('company_members')
      .select('company_id, role, created_at')
      .eq('clerk_user_id', clerkUserId)
      .order('created_at', { ascending: false });

    const fromPub = await firstMembershipWithExistingCompany(pubRows as MemRow[] | null);
    if (fromPub) return fromPub;

    // Legacy user_id column (pre-Clerk migration rows)
    const { data: legacyRows } = await db
      .public()
      .from('company_members')
      .select('company_id, role, created_at')
      .eq('user_id', clerkUserId)
      .order('created_at', { ascending: false });

    return firstMembershipWithExistingCompany(legacyRows as MemRow[] | null);
  } catch (err) {
    logError(err, { operation: 'legacyPickFirstExistingMembership', userId: clerkUserId });
    return null;
  }
}

type MemRow = { company_id: string | null; role?: string | null };

async function firstMembershipWithExistingCompany(
  rows: MemRow[] | null | undefined,
): Promise<{ companyId: string; role: string } | null> {
  if (!rows?.length) return null;
  for (const row of rows) {
    const cid = row.company_id != null ? String(row.company_id) : '';
    if (!cid) continue;
    const { data: exists } = await supabase.rpc('company_exists', { p_company_id: cid });
    if (exists === true) {
      return { companyId: cid, role: (row.role ?? '').trim() || 'employee' };
    }
  }
  return null;
}

/**
 * Keeps legacy public.profiles in sync with core.profiles.
 * STK edge + helpers still read public on some paths.
 */
export async function mirrorPublicProfileForClerkUser(
  clerkUserId: string,
  email?: string | null,
  activeCompanyId?: string | null,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    id: clerkUserId,
    clerk_user_id: clerkUserId,
    updated_at: nowIso,
  };
  if (email !== undefined) {
    row.email = email != null && String(email).trim() !== '' ? String(email).trim() : null;
  }
  if (activeCompanyId !== undefined) {
    if (activeCompanyId != null && String(activeCompanyId).trim() !== '') {
      const cid = String(activeCompanyId).trim();
      row.active_company_id = cid;
      row.company_id = cid;
    } else {
      row.active_company_id = null;
      row.company_id = null;
    }
  }

  const { error } = await db.public().from('profiles').upsert(row, { onConflict: 'id' });
  if (error) {
    logError(error, {
      operation: 'mirrorPublicProfileForClerkUser',
      userId: clerkUserId,
    });
  }
}

export async function repairProfileActiveCompany(
  clerkUserId: string,
  companyId: string | null,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await db
    .core()
    .from('profiles')
    .update({ active_company_id: companyId, updated_at: nowIso })
    .eq('clerk_user_id', clerkUserId);

  if (error) {
    logError(error, {
      operation: 'repairProfileActiveCompany',
      userId: clerkUserId,
      companyId,
    });
  }

  await mirrorPublicProfileForClerkUser(clerkUserId, undefined, companyId);
}
