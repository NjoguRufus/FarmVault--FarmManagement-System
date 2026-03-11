/**
 * Dev-only diagnostics: tenant resolution, role, and project count.
 * Helps debug RLS, schema, and company_id issues.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUser } from '@clerk/react';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';

type Diag = {
  clerkUserId: string | null;
  resolvedCompanyId: string | null;
  roleFromMembers: string | null;
  currentCompanyIdRpc: string | null;
  isDeveloper: boolean;
  projectsCount: number;
};

export default function DevDiagnosticsPage() {
  const { user } = useAuth();
  const clerkUser = useUser().user;
  const [diag, setDiag] = useState<Diag | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let cancelled = false;

    (async () => {
      try {
        const clerkUserId = clerkUser?.id ?? null;
        const resolvedCompanyId = user?.companyId ?? null;

        let roleFromMembers: string | null = null;
        if (clerkUserId && resolvedCompanyId) {
          const { data: row } = await db
            .core()
            .from('company_members')
            .select('role')
            .eq('clerk_user_id', clerkUserId)
            .eq('company_id', resolvedCompanyId)
            .maybeSingle();
          roleFromMembers = (row as { role?: string } | null)?.role ?? null;
        }

        let currentCompanyIdRpc: string | null = null;
        try {
          const { data } = await supabase.rpc('current_company_id');
          currentCompanyIdRpc = data ?? null;
        } catch {
          // RPC may not exist or may fail
        }

        let isDeveloper = false;
        if (clerkUserId) {
          const { data: isDev } = await supabase.rpc('is_developer');
          isDeveloper = isDev === true;
        }

        let projectsCount = 0;
        if (resolvedCompanyId) {
          const { count } = await db
            .projects()
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', resolvedCompanyId);
          projectsCount = count ?? 0;
        }

        if (cancelled) return;
        setDiag({
          clerkUserId,
          resolvedCompanyId,
          roleFromMembers,
          currentCompanyIdRpc,
          isDeveloper,
          projectsCount,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.companyId, clerkUser?.id]);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className="container max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Tenant diagnostics (dev only)</h1>
      {error && <pre className="rounded bg-red-100 p-2 text-sm text-red-800">{error}</pre>}
      {diag && (
        <pre className="rounded bg-slate-100 p-4 text-xs">
          {JSON.stringify(
            {
              clerkUserId: diag.clerkUserId,
              resolvedCompanyId: diag.resolvedCompanyId,
              roleFromCoreCompanyMembers: diag.roleFromMembers,
              currentCompanyIdFromRpc: diag.currentCompanyIdRpc,
              isDeveloper: diag.isDeveloper,
              projectsCount: diag.projectsCount,
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}
