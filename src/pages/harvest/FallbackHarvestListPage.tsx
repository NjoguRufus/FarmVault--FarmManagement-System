import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowRight, TrendingUp, Wallet, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { formatDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  createFallbackSession,
  listFallbackSessionsForProject,
  type FallbackHarvestSessionRow,
} from '@/services/fallbackHarvestService';
import { useFallbackHarvestRealtime } from '@/hooks/useFallbackHarvestRealtime';
import { useHarvestNavPrefix } from '@/hooks/useHarvestNavPrefix';

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

export default function FallbackHarvestListPage() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const harvestNavPrefix = useHarvestNavPrefix();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeProject } = useProject();

  const companyId = user?.companyId ?? null;
  const projectId = routeProjectId ?? activeProject?.id ?? null;

  useFallbackHarvestRealtime({ companyId, projectId });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['fallback-harvest-sessions', companyId, projectId],
    enabled: Boolean(companyId && projectId),
    queryFn: () =>
      listFallbackSessionsForProject({
        companyId: companyId ?? '',
        projectId: projectId ?? '',
      }),
  });

  const [creating, setCreating] = useState(false);

  const totals = useMemo(() => {
    return sessions.reduce(
      (acc, s) => {
        acc.units += Number(s.total_units ?? 0);
        acc.revenue += Number(s.total_revenue ?? 0);
        acc.expenses += Number(s.total_expenses ?? 0);
        acc.net += Number(s.net_profit ?? 0);
        return acc;
      },
      { units: 0, revenue: 0, expenses: 0, net: 0 },
    );
  }, [sessions]);

  async function onCreateSession() {
    if (!companyId || !projectId) return;
    setCreating(true);
    try {
      const created = await createFallbackSession({
        companyId,
        projectId,
        cropId: null,
        unitType: 'bags',
        containerType: 'bags',
      });
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-sessions', companyId, projectId] });
      navigate(`${harvestNavPrefix}/harvest-sessions/${projectId}/session/${created.id}`, { replace: true });
    } catch (e: any) {
      toast({ title: 'Failed to create session', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  if (!projectId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Harvest</h1>
        <p className="text-sm text-muted-foreground">Select a project to view harvest sessions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Harvest</h1>
          <p className="text-xs text-muted-foreground">Modular harvest sessions (all crops except tomatoes and french beans).</p>
        </div>
        <Button onClick={onCreateSession} disabled={creating}>
          <Plus className="mr-2 h-4 w-4" />
          New session
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SimpleStatCard title="Total units" value={String(Math.round(totals.units)).toLocaleString('en-KE')} icon={Package} />
        <SimpleStatCard title="Revenue" value={formatKes(totals.revenue)} icon={TrendingUp} />
        <SimpleStatCard title="Expenses" value={formatKes(totals.expenses)} icon={Wallet} />
        <SimpleStatCard title="Net" value={formatKes(totals.net)} icon={TrendingUp} />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sessions.length === 0 ? (
          <Card className="border-border/60 bg-card/40">
            <CardContent className="p-4">
              <p className="text-sm font-medium">No harvest sessions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create your first modular harvest session for this project.</p>
              <div className="mt-3">
                <Button onClick={onCreateSession} disabled={creating}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create session
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          sessions.map((s: FallbackHarvestSessionRow) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                'w-full text-left rounded-xl border border-border/60 bg-card/40 hover:bg-muted/20 transition-colors',
              )}
              onClick={() => navigate(`${harvestNavPrefix}/harvest-sessions/${projectId}/session/${s.id}`)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{formatDate(s.session_date)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.destination === 'MARKET' ? 'Going to market' : 'Sold from farm'} • {Math.round(s.total_units)} {s.unit_type}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Mini label="Revenue" value={formatKes(s.total_revenue)} />
                  <Mini label="Expenses" value={formatKes(s.total_expenses)} />
                  <Mini label="Net" value={formatKes(s.net_profit)} />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}

