import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, HelpCircle, Package, Plus, TrendingUp, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { Button } from '@/components/ui/button';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { formatDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { isProjectClosed } from '@/lib/projectClosed';
import { hasHarvestCollectionsModule, hasTomatoHarvestModule } from '@/lib/cropModules';
import { resolveHarvestEntryPath } from '@/lib/harvestNavigation';
import {
  createFallbackSession,
  listFallbackSessionsForProject,
  type FallbackHarvestSessionRow,
} from '@/services/fallbackHarvestService';
import { useFallbackHarvestRealtime } from '@/hooks/useFallbackHarvestRealtime';
import { useFallbackSessionSummaries } from '@/hooks/useFallbackSessionSummary';
import { useHarvestNavPrefix } from '@/hooks/useHarvestNavPrefix';
import Joyride, { ACTIONS, EVENTS, STATUS, type CallBackProps, type Step } from 'react-joyride';

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

function fallbackStatusMeta(s: FallbackHarvestSessionRow): { label: string; emoji: string; badgeClass: string } {
  if (s.status === 'collecting' && s.destination === 'MARKET') {
    return { label: 'Pending', emoji: '🟡', badgeClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30' };
  }
  if (s.status === 'collecting') {
    return { label: 'Collecting', emoji: '🟠', badgeClass: 'bg-orange-500/15 text-orange-800 dark:text-orange-200 border-orange-500/30' };
  }
  if (s.destination === 'MARKET') {
    return { label: 'Market', emoji: '🔵', badgeClass: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/30' };
  }
  return { label: 'Sold', emoji: '🟢', badgeClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30' };
}

function destinationLabel(dest: string): string {
  return dest === 'MARKET' ? 'Market' : 'Farm';
}

export default function FallbackHarvestListPage() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const harvestNavPrefix = useHarvestNavPrefix();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeProject, projects, setActiveProject } = useProject();
  const { hasProjectAccess, isLoading: employeeAccessLoading } = useEmployeeAccess();

  const companyId = user?.companyId ?? null;

  const companyProjects = useMemo(
    () => (companyId ? projects.filter((p) => p.companyId === companyId) : projects),
    [projects, companyId],
  );

  const effectiveProject = useMemo(() => {
    if (routeProjectId) {
      return projects.find((p) => p.id === routeProjectId) ?? null;
    }
    return activeProject;
  }, [routeProjectId, projects, activeProject]);

  useEffect(() => {
    if (!routeProjectId || !effectiveProject || effectiveProject.id !== routeProjectId) return;
    if (activeProject?.id === routeProjectId) return;
    if (isProjectClosed(effectiveProject)) return;
    setActiveProject(effectiveProject);
  }, [routeProjectId, effectiveProject, activeProject?.id, setActiveProject]);

  const projectId = effectiveProject?.id ?? null;

  useEffect(() => {
    if (employeeAccessLoading || !companyId || !effectiveProject) return;
    if (!hasProjectAccess(effectiveProject.id)) {
      const fallback = companyProjects.find((p) => !isProjectClosed(p) && hasProjectAccess(p.id));
      if (fallback) {
        navigate(resolveHarvestEntryPath(fallback, harvestNavPrefix), { replace: true });
      }
      return;
    }
    const crop = String(effectiveProject.cropTypeKey ?? effectiveProject.cropType ?? '');
    if (hasTomatoHarvestModule(crop) || hasHarvestCollectionsModule(crop)) {
      navigate(resolveHarvestEntryPath(effectiveProject, harvestNavPrefix), { replace: true });
    }
  }, [
    employeeAccessLoading,
    companyId,
    effectiveProject,
    companyProjects,
    hasProjectAccess,
    navigate,
    harvestNavPrefix,
  ]);

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

  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);
  const { bySessionId: computedSummariesBySession } = useFallbackSessionSummaries(companyId, sessionIds);

  const [creating, setCreating] = useState(false);
  const [tourRun, setTourRun] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourSteps, setTourSteps] = useState<Step[]>([]);

  const totals = useMemo(() => {
    return sessions.reduce(
      (acc, s) => {
        const computed = computedSummariesBySession.get(s.id);
        acc.units += Number(computed?.totalUnits ?? 0);
        acc.revenue += Number(computed?.revenueTotal ?? 0);
        acc.expenses += Number(computed?.expensesTotal ?? 0);
        acc.net += Number(computed?.netProfit ?? 0);
        return acc;
      },
      { units: 0, revenue: 0, expenses: 0, net: 0 },
    );
  }, [sessions, computedSummariesBySession]);

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

  const startTour = () => {
    const baseSteps: Step[] = [
      {
        target: '[data-tour="fallback-harvest-tour-btn"]',
        content: 'Use this button anytime to restart the fallback harvest tour.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-tour="fallback-harvest-new-btn"]',
        content: 'Create a new fallback harvest session here.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="fallback-harvest-stats"]',
        content: 'These cards show total units, revenue, expenses, and net profit.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="fallback-harvest-session-cards"]',
        content: 'Open any session card to record harvest, sales, and expenses.',
        placement: 'top',
      },
    ];
    const available = baseSteps.filter((step) =>
      typeof step.target === 'string' ? Boolean(document.querySelector(step.target)) : false,
    );
    if (available.length === 0) return;
    setTourSteps(available);
    setTourStepIndex(0);
    setTourRun(true);
  };

  const onTourCallback = (data: CallBackProps) => {
    const { action, index = 0, status, type } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setTourRun(false);
      setTourStepIndex(0);
      return;
    }
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const next = index + (action === ACTIONS.PREV ? -1 : 1);
      if (next < 0 || next >= tourSteps.length) {
        setTourRun(false);
        setTourStepIndex(0);
        return;
      }
      setTourStepIndex(next);
    }
  };

  if (!projectId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Harvest</h1>
        <p className="text-sm text-muted-foreground">Select a project to view harvest sessions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 animate-fade-in w-full">
      <Joyride
        steps={tourSteps}
        run={tourRun}
        stepIndex={tourStepIndex}
        callback={onTourCallback}
        continuous
        showProgress
        showSkipButton
        disableOverlayClose
        scrollToFirstStep
        spotlightPadding={8}
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Harvest</h1>
          <p className="text-xs text-muted-foreground">Modular harvest sessions (all crops except tomatoes and french beans).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={startTour}
            data-tour="fallback-harvest-tour-btn"
            title="Take a Tour"
            aria-label="Take a Tour"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button onClick={onCreateSession} disabled={creating} data-tour="fallback-harvest-new-btn">
            <Plus className="mr-2 h-4 w-4" />
            New session
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'grid gap-2 sm:gap-3',
          'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4',
        )}
        data-tour="fallback-harvest-stats"
      >
        <SimpleStatCard
          layout="mobile-compact"
          title="Total units"
          value={String(Math.round(totals.units)).toLocaleString('en-KE')}
          icon={Package}
          iconVariant="primary"
          className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
        />
        <SimpleStatCard
          layout="mobile-compact"
          title="Revenue"
          value={formatKes(totals.revenue)}
          icon={TrendingUp}
          iconVariant="gold"
          valueVariant="success"
          className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
        />
        <SimpleStatCard
          layout="mobile-compact"
          title="Expenses"
          value={formatKes(totals.expenses)}
          icon={Wallet}
          iconVariant="muted"
          className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
        />
        <SimpleStatCard
          layout="mobile-compact"
          title="Net profit"
          value={formatKes(totals.net)}
          icon={BarChart3}
          iconVariant="muted"
          valueVariant={totals.net > 0 ? 'success' : totals.net < 0 ? 'destructive' : 'default'}
          className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-tour="fallback-harvest-session-cards">
        {isLoading ? (
          <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Loading…</p>
        ) : sessions.length === 0 ? (
          <div className="fv-card p-8 sm:col-span-2 xl:col-span-3 text-center space-y-4 border-dashed">
            <p className="text-4xl" aria-hidden>
              📦
            </p>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">No harvest sessions yet</p>
              <p className="text-sm text-muted-foreground">Start by recording your first harvest.</p>
            </div>
            <Button className="fv-btn" onClick={onCreateSession} disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              New session
            </Button>
          </div>
        ) : (
          sessions.map((s: FallbackHarvestSessionRow, idx: number) => {
            const st = fallbackStatusMeta(s);
            const computed = computedSummariesBySession.get(s.id);
            const net = Number(computed?.netProfit ?? 0);
            const revenue = Number(computed?.revenueTotal ?? 0);
            const expenses = Number(computed?.expensesTotal ?? 0);
            const units = Number(computed?.totalUnits ?? 0);
            const revenuePending = s.destination === 'MARKET' && revenue <= 0;
            return (
              <button
                key={s.id}
                type="button"
                className={cn(
                  'fv-card group w-full text-left p-4 sm:p-5 transition-all duration-200',
                  'rounded-xl border border-border/60 bg-card/80 shadow-sm',
                  'hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md',
                  idx === 0 && 'ring-1 ring-primary/20 bg-primary/[0.03]',
                )}
                onClick={() => navigate(`${harvestNavPrefix}/harvest-sessions/${projectId}/session/${s.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      <span aria-hidden>🗓</span> {formatDate(s.session_date)}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {s.destination === 'MARKET' ? 'Going to market' : 'Sold from farm'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      st.badgeClass,
                    )}
                  >
                    <span aria-hidden>{st.emoji}</span>
                    {st.label}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <MetricCell icon="📦" label="Units" value={`${Math.round(units).toLocaleString('en-KE')} ${s.unit_type}`} />
                  <MetricCell icon="💰" label="Revenue" value={revenuePending ? 'Pending' : formatKes(revenue)} />
                  <MetricCell icon="💸" label="Expenses" value={formatKes(expenses)} />
                  <MetricCell
                    icon="📊"
                    label="Net"
                    value={formatKes(net)}
                    valueClass={net > 0 ? 'text-fv-success' : net < 0 ? 'text-destructive' : 'text-muted-foreground'}
                  />
                </div>

                <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{destinationLabel(s.destination)}</span>
                  <span className="mx-1.5 text-border">•</span>
                  <span className="capitalize">{s.container_type}</span>
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function MetricCell({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span aria-hidden>{icon}</span> {label}
      </p>
      <p className={cn('truncate font-semibold tabular-nums text-foreground', valueClass)}>{value}</p>
    </div>
  );
}

