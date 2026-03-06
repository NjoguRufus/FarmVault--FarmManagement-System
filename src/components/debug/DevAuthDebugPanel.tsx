import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

interface MembershipRow {
  company_id: string;
  role: string | null;
  created_at: string | null;
}

export function DevAuthDebugPanel() {
  const { user, isDeveloper, authReady, setupIncomplete } = useAuth();
  const location = useLocation();
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTenantDebug() {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const [{ data: profileRow }, { data: membershipRows }] = await Promise.all([
          db
            .core()
            .from('profiles')
            .select('active_company_id')
            .eq('clerk_user_id', user.id)
            .maybeSingle(),
          db
            .core()
            .from('company_members')
            .select('company_id, role, created_at')
            .eq('clerk_user_id', user.id)
            .order('created_at', { ascending: false }),
        ]);
        if (cancelled) return;
        setActiveCompanyId((profileRow as any)?.active_company_id ?? null);
        setMemberships((membershipRows as MembershipRow[] | null) ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTenantDebug();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!import.meta.env.DEV) return null;

  // Only show when we have at least attempted auth.
  if (!authReady && !user) return null;

  const resolvedCompanyId = user?.companyId ?? activeCompanyId ?? null;
  const hasActiveMembership =
    resolvedCompanyId != null &&
    memberships.some((m) => m.company_id === resolvedCompanyId);
  const membershipRoleFromCompanyMembers =
    resolvedCompanyId != null
      ? (memberships.find((m) => m.company_id === resolvedCompanyId)?.role ?? null)
      : null;

  async function handleRepairMembership() {
    if (!user?.id || !activeCompanyId || hasActiveMembership) return;
    setRepairing(true);
    setError(null);
    try {
      const { error: insertError } = await db
        .core()
        .from('company_members')
        .insert({
          company_id: activeCompanyId,
          clerk_user_id: user.id,
          role: 'company_admin',
        });
      if (insertError) {
        throw new Error(insertError.message ?? 'Failed to repair membership');
      }
      // Reload memberships
      const { data: membershipRows } = await db
        .core()
        .from('company_members')
        .select('company_id, role, created_at')
        .eq('clerk_user_id', user.id)
        .order('created_at', { ascending: false });
      setMemberships((membershipRows as MembershipRow[] | null) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRepairing(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm text-xs text-foreground bg-background/95 border border-border rounded-lg shadow-lg px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">
          Tenant Debug
        </div>
        {activeCompanyId && !hasActiveMembership && (
          <button
            type="button"
            onClick={handleRepairMembership}
            disabled={repairing}
            className="px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted disabled:opacity-60"
          >
            {repairing ? 'Repairing…' : 'Repair membership'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-2 gap-y-0.5">
        <span className="text-muted-foreground">Path</span>
        <span className="font-mono break-all">{location.pathname}</span>

        <span className="text-muted-foreground">Auth ready</span>
        <span className="font-mono">{String(authReady)}</span>

        <span className="text-muted-foreground">Clerk user id</span>
        <span className="font-mono break-all">{user?.id ?? 'null'}</span>

        <span className="text-muted-foreground">Email</span>
        <span className="font-mono break-all">{user?.email ?? 'null'}</span>

        <span className="text-muted-foreground">role_company_members</span>
        <span className="font-mono">{loading ? '…' : (membershipRoleFromCompanyMembers ?? '—')}</span>

        <span className="text-muted-foreground">role</span>
        <span className="font-mono">{user?.role ?? 'null'}</span>

        <span className="text-muted-foreground">Profile active_company_id</span>
        <span className="font-mono break-all">{activeCompanyId ?? 'null'}</span>

        <span className="text-muted-foreground">Resolved companyId</span>
        <span className="font-mono break-all">{resolvedCompanyId ?? 'null'}</span>

        <span className="text-muted-foreground">isDeveloper</span>
        <span className="font-mono">{String(isDeveloper)}</span>

        <span className="text-muted-foreground">setupIncomplete</span>
        <span className="font-mono">{String(setupIncomplete)}</span>

        <span className="text-muted-foreground">Memberships</span>
        <span className="font-mono break-all">
          {loading
            ? 'loading…'
            : memberships.length === 0
              ? 'none'
              : memberships
                  .map((m) => `${m.company_id}${m.role ? ` (${m.role})` : ''}`)
                  .join(', ')}
        </span>

        {error && (
          <>
            <span className="text-muted-foreground">Error</span>
            <span className="font-mono break-all text-red-500">{error}</span>
          </>
        )}
      </div>
    </div>
  );
}

