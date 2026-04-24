import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, Layers, Package, Plus, TrendingUp, Wallet } from 'lucide-react';
import Joyride, { ACTIONS, EVENTS, STATUS, type CallBackProps, type Step } from 'react-joyride';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { Button } from '@/components/ui/button';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateUtils';
import { isProjectClosed } from '@/lib/projectClosed';
import type { Project } from '@/types';
import {
  createTomatoHarvestSession,
  fetchTomatoSessionsForProject,
  sessionDisplayTitle,
} from '@/services/tomatoHarvestService';
import { useToast } from '@/hooks/use-toast';
import { hasTomatoHarvestModule } from '@/lib/cropModules';
import { resolveHarvestEntryPath } from '@/lib/harvestNavigation';
import { format } from 'date-fns';
import { useHarvestNavPrefix } from '@/hooks/useHarvestNavPrefix';
import { useTomatoSessionSummaries } from '@/hooks/useTomatoSessionSummary';

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

// Match the green from your fv-btn / New harvest button
const PRIMARY_GREEN = '#16a34a'; // Tailwind green-600 — adjust to match your actual fv-btn color

export default function TomatoHarvestListPage() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { can: canKey, hasProjectAccess, isLoading: employeeAccessLoading } = useEmployeeAccess();
  const { activeProject, projects, setActiveProject } = useProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const harvestNavPrefix = useHarvestNavPrefix();

  const canView = canKey('harvest_collections.view') || can('harvest', 'view');
  const canCreate =
    canKey('harvest_collections.create') || can('harvest', 'create') || can('harvest', 'recordIntake');
  const canViewHarvestFinancials =
    canKey('harvest_collections.financials') ||
    canKey('financials.view') ||
    can('harvest', 'viewFinancials');

  const effectiveProject = useMemo(() => {
    if (routeProjectId) {
      return projects.find((p) => p.id === routeProjectId) ?? null;
    }
    return activeProject;
  }, [routeProjectId, projects, activeProject]);

  const companyProjects = useMemo(
    () => (companyId ? projects.filter((p) => p.companyId === companyId) : projects),
    [projects, companyId],
  );

  const projectId = effectiveProject?.id ?? null;
  const isTomatoProject = effectiveProject
    ? hasTomatoHarvestModule(String(effectiveProject.cropTypeKey ?? effectiveProject.cropType ?? ''))
    : false;

  useEffect(() => {
    if (!routeProjectId || !effectiveProject || effectiveProject.id !== routeProjectId) return;
    if (activeProject?.id === routeProjectId) return;
    if (isProjectClosed(effectiveProject)) return;
    setActiveProject(effectiveProject as Project);
  }, [routeProjectId, effectiveProject, activeProject?.id, setActiveProject]);

  useEffect(() => {
    if (employeeAccessLoading || !companyId) return;
    if (!effectiveProject) return;
    if (!hasProjectAccess(effectiveProject.id)) {
      const fallback = companyProjects.find((p) => !isProjectClosed(p) && hasProjectAccess(p.id));
      if (fallback) {
        navigate(resolveHarvestEntryPath(fallback, harvestNavPrefix), { replace: true });
      }
      return;
    }
    if (!isTomatoProject) {
      navigate(resolveHarvestEntryPath(effectiveProject, harvestNavPrefix), { replace: true });
    }
  }, [
    employeeAccessLoading,
    companyId,
    effectiveProject,
    isTomatoProject,
    companyProjects,
    hasProjectAccess,
    navigate,
    harvestNavPrefix,
  ]);

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ['tomato-harvest-sessions', companyId, projectId],
    queryFn: () =>
      fetchTomatoSessionsForProject({
        companyId: companyId!,
        projectId: projectId!,
      }),
    enabled: Boolean(companyId && projectId && isTomatoProject),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const sessionIds = useMemo(() => summaries.map((s) => s.session.id), [summaries]);
  const { bySessionId: computedSummariesBySession } = useTomatoSessionSummaries(companyId, sessionIds);

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, s) => {
        const computed = computedSummariesBySession.get(s.session.id);
        acc.buckets += computed?.buckets ?? s.totalBuckets;
        acc.crates += computed?.crates ?? (s.session.packaging_count ?? 0);
        acc.revenue += computed?.revenueTotal ?? 0;
        acc.expenses += computed?.totalExpenses ?? 0;
        acc.net += computed?.netProfit ?? 0;
        return acc;
      },
      { buckets: 0, crates: 0, revenue: 0, expenses: 0, net: 0 },
    );
  }, [summaries, computedSummariesBySession]);

  const [newOpen, setNewOpen] = useState(false);
  const [newDate, setNewDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [newPickerRate, setNewPickerRate] = useState('30');
  const [creating, setCreating] = useState(false);
  const [tourRun, setTourRun] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourSteps, setTourSteps] = useState<Step[]>([]);

  const openNew = () => {
    setNewDate(format(new Date(), 'yyyy-MM-dd'));
    setNewPickerRate('30');
    setNewOpen(true);
  };

  const handleCreate = async () => {
    if (!companyId || !projectId) return;
    setCreating(true);
    try {
      const rateNum = Number(newPickerRate);
      const row = await createTomatoHarvestSession({
        companyId,
        projectId,
        sessionDate: newDate,
        pickerRatePerBucket: Number.isFinite(rateNum) && rateNum >= 0 ? rateNum : 30,
      });
      await queryClient.invalidateQueries({ queryKey: ['tomato-harvest-sessions', companyId, projectId] });
      setNewOpen(false);
      toast({ title: 'Harvest started', description: sessionDisplayTitle(row) });
      navigate(`${harvestNavPrefix}/tomato-harvest/${projectId}/session/${row.id}`);
    } catch (e) {
      toast({
        title: 'Could not create harvest',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const startTour = () => {
    const baseSteps: Step[] = [
      {
        target: '[data-tour="tomato-harvest-tour-btn"]',
        content: 'Use this button anytime to start the tomato harvest tour again.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-tour="tomato-harvest-new-btn"]',
        content: 'Start a new tomato harvest session here.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="tomato-harvest-list-stats"]',
        content: 'These stats summarize buckets, crates, revenue, expenses, and net across sessions.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="tomato-harvest-session-cards"]',
        content: 'Open any session card to continue intake, market sales, and costs.',
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

  if (!companyId) {
    return <p className="text-muted-foreground text-sm p-4">Sign in to manage tomato harvests.</p>;
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
        locale={{
          back: 'Previous',
          close: 'Close',
          last: 'Finish',
          next: 'Next',
          skip: 'Exit tour',
        }}
        styles={{
          options: {
            primaryColor: PRIMARY_GREEN,
            zIndex: 10000,
          },
          buttonNext: {
            backgroundColor: PRIMARY_GREEN,
            color: '#ffffff',
            fontSize: '14px',
            padding: '8px 16px',
            borderRadius: '6px',
          },
          buttonBack: {
            color: PRIMARY_GREEN,
            fontSize: '14px',
            marginRight: '8px',
          },
          buttonSkip: {
            color: '#6b7280',
            fontSize: '14px',
          },
        }}
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={startTour}
          data-tour="tomato-harvest-tour-btn"
          title="Take a Tour"
          aria-label="Take a Tour"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
        {canCreate && projectId && isTomatoProject && (
          <Button className="fv-btn" onClick={openNew} disabled={!canView} data-tour="tomato-harvest-new-btn">
            <Plus className="h-4 w-4 mr-2" />
            New harvest
          </Button>
        )}
      </div>

      {!projectId || !isTomatoProject ? (
        <div className="fv-card p-6 text-center text-muted-foreground text-sm">
          Select an active tomato project to view harvest sessions.
        </div>
      ) : !canView ? (
        <p className="text-sm text-muted-foreground">You do not have access to harvest data.</p>
      ) : (
        <>
          <div
            className={cn(
              'grid gap-2 sm:gap-3',
              canViewHarvestFinancials
                ? 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-2',
            )}
            data-tour="tomato-harvest-list-stats"
          >
            <SimpleStatCard
              layout="mobile-compact"
              title="Total buckets"
              value={totals.buckets.toLocaleString()}
              icon={Layers}
              iconVariant="primary"
              className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
            />
            <SimpleStatCard
              layout="mobile-compact"
              title="Total crates"
              value={totals.crates.toLocaleString()}
              icon={Package}
              iconVariant="primary"
              className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
            />
            {canViewHarvestFinancials && (
              <>
                <SimpleStatCard
                  layout="mobile-compact"
                  title="Total revenue"
                  value={formatKes(totals.revenue)}
                  icon={TrendingUp}
                  iconVariant="gold"
                  valueVariant="success"
                  className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
                />
                <SimpleStatCard
                  layout="mobile-compact"
                  title="Net profit"
                  value={formatKes(totals.net)}
                  icon={Wallet}
                  iconVariant="muted"
                  valueVariant={totals.net >= 0 ? 'info' : 'destructive'}
                  className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
                />
              </>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading sessions…</p>
          ) : summaries.length === 0 ? (
            <div className="fv-card p-8 text-left sm:text-center space-y-3">
              <p className="text-muted-foreground text-sm">No tomato harvest sessions yet.</p>
              {canCreate && (
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Start first harvest
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-tour="tomato-harvest-session-cards">
              {summaries.map((s) => {
                const computed = computedSummariesBySession.get(s.session.id);
                const cardRevenue = computed?.revenueTotal ?? 0;
                const cardNet = computed?.netProfit ?? 0;
                const cardPickers = computed?.pickersCount ?? s.pickerCount;
                return (
                  <button
                    key={s.session.id}
                    type="button"
                    className="fv-card p-4 text-left w-full hover:border-primary/40 transition-colors space-y-2"
                    onClick={() =>
                      navigate(`${harvestNavPrefix}/tomato-harvest/${projectId}/session/${s.session.id}`)
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{sessionDisplayTitle(s.session)}</h3>
                        <p className="text-xs text-muted-foreground">{formatDate(s.session.session_date)}</p>
                      </div>
                      <span
                        className={cn(
                          'fv-badge shrink-0',
                          s.session.status === 'completed' ? 'fv-badge--active' : 'fv-badge--warning',
                        )}
                      >
                        {s.session.status === 'completed' ? 'Completed' : 'Collecting'}
                        {s.dispatch?.status === 'pending' && s.session.sale_mode === 'market' ? ' · Market' : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Buckets</span>
                      <span className="font-medium text-right">{s.totalBuckets}</span>
                      <span className="text-muted-foreground">Crates</span>
                      <span className="font-medium text-right">{s.session.packaging_count}</span>
                      <span className="text-muted-foreground">Pickers</span>
                      <span className="font-medium text-right">{cardPickers}</span>
                      {canViewHarvestFinancials && (
                        <>
                          <span className="text-muted-foreground">Revenue</span>
                          <span className="font-medium text-right">{formatKes(cardRevenue)}</span>
                          <span className="text-muted-foreground">Net</span>
                          <span
                            className={cn(
                              'font-medium text-right',
                              cardNet >= 0 ? 'text-fv-info' : 'text-destructive',
                            )}
                          >
                            {formatKes(cardNet)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New tomato harvest</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="th-date">Harvest date</Label>
              <Input id="th-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="th-picker-rate">KES per bucket (picker rate)</Label>
              <Input
                id="th-picker-rate"
                inputMode="decimal"
                value={newPickerRate}
                onChange={(e) => setNewPickerRate(e.target.value)}
                placeholder="30"
              />
              <p className="text-xs text-muted-foreground">Used to calculate picker cost for this harvest. You can change it later from the session under Bucket rate.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" type="button" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreate()} disabled={creating || !newDate}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}