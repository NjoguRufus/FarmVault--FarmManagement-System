import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

type MemRow = { company_id: string | null; role?: string | null };

async function firstMembershipWithExistingCompany(rows: MemRow[] | null | undefined): Promise<{
  companyId: string;
  role: string;
} | null> {
  if (!rows?.length) return null;
  for (const row of rows) {
    const cid = row.company_id != null ? String(row.company_id) : '';
    if (!cid) continue;
    const { data: exists } = await supabase.rpc('company_exists', { p_company_id: cid });
    if (exists === true) {
      const r = row.role != null ? String(row.role).trim() : '';
      return { companyId: cid, role: r || 'employee' };
    }
  }
  return null;
}

/**
 * Picks the newest company membership whose company row still exists (core then public.company_members).
 */
export async function pickFirstExistingMembershipCompany(
  clerkUserId: string,
): Promise<{ companyId: string; role: string } | null> {
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
    .eq('user_id', clerkUserId)
    .order('created_at', { ascending: false });

  return firstMembershipWithExistingCompany(pubRows as MemRow[] | null);
}

export async function repairProfileActiveCompany(clerkUserId: string, companyId: string | null): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .core()
    .from('profiles')
    .update({ active_company_id: companyId, updated_at: nowIso })
    .eq('clerk_user_id', clerkUserId);
}
