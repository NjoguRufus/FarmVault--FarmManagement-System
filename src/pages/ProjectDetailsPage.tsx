import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CropStage, Expense, InventoryUsage, Project, SeasonChallenge, WorkLog } from '@/types';
import { useProject } from '@/contexts/ProjectContext';
import { toDate, formatDate } from '@/lib/dateUtils';
import { getCropTimeline } from '@/config/cropTimelines';
import {
  calculateDaysSince,
  buildTimeline,
  getProgressWithinStage,
  assertCropStagesDev,
  type StageRule,
} from '@/utils/cropStages';
import { getExpectedHarvestDate, getCropDaysToHarvest } from '@/utils/expectedHarvest';
import { effectiveCurrentStage, resolveManualStageIndex } from '@/lib/seasonStageOverride';
import { getProject, deleteProject as deleteProjectService } from '@/services/projectsService';
import { getFinanceExpenses } from '@/services/financeExpenseService';
import { getBudgetPool } from '@/services/budgetPoolService';
import { isInputExpenseCategory, isLabourExpenseCategory } from '@/lib/financeExpenseCategories';
import { getCropHeroImage } from '@/lib/cropHeroImage';
import {
  ProjectHeroCard,
  SeasonProgressTimeline,
  ProjectFinancialSnapshot,
  ProjectOperationsSummary,
  ProjectChallengesPanel,
  ProjectQuickActions,
  ProjectPlanningPreview,
  ProjectDangerZone,
  SeasonInsightPanel,
} from '@/components/project-details';
import { useCollection } from '@/hooks/useCollection';
import { useProjectStages } from '@/hooks/useProjectStages';
import { useSeasonChallenges } from '@/hooks/useSeasonChallenges';
import { useProjectBlocks } from '@/hooks/useProjectBlocks';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StageEditModal } from '@/components/projects/StageEditModal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CropStagesPanel } from '@/pages/CropStagesPage';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { isProjectClosed } from '@/lib/projectClosed';
import { logger } from "@/lib/logger";

if (import.meta.env?.DEV) {
  assertCropStagesDev();
}

export default function ProjectDetailsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeProject, setActiveProject } = useProject();

  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';
  const scope = { companyScoped: true, companyId, isDeveloper, enabled: !!companyId || isDeveloper };

  const {
    data: project,
    isLoading: projectsLoading,
    error: projectError,
  } = useQuery({
    queryKey: ['project', projectId ?? '', companyId ?? ''],
    queryFn: () => {
      if (import.meta.env?.DEV) {
        logger.log('[ProjectDetailsPage] project details fetch', { projectId, companyId });
      }
      return getProject(projectId!, { companyId });
    },
    enabled: Boolean(projectId && (companyId || isDeveloper)),
  });

  useEffect(() => {
    if (!project?.id || !companyId) return;
    captureEvent(AnalyticsEvents.PROJECT_VIEWED, {
      company_id: companyId,
      project_id: project.id,
      project_name: project.name,
      crop_type: project.cropTypeKey ?? String(project.cropType ?? ''),
      module_name: 'projects',
      route_path: `/projects/${project.id}`,
    });
  }, [project?.id, project?.name, project?.cropType, project?.cropTypeKey, companyId]);

  useEffect(() => {
    if (!project?.id || isProjectClosed(project)) return;
    if (!isDeveloper && companyId && project.companyId !== companyId) return;
    if (activeProject?.id === project.id) return;
    setActiveProject(project);
  }, [project, companyId, isDeveloper, setActiveProject, activeProject?.id]);

  if (import.meta.env.DEV && projectId && !projectsLoading && project) {
    logger.log('[ProjectDetailsPage] project details loaded', { projectId, name: project.name });
  }
  if (import.meta.env.DEV && projectId && !projectsLoading && !project && (projectError != null || project === null)) {
    console.warn('[ProjectDetailsPage] Project not found', {
      projectId,
      companyId,
      setupIncomplete: !companyId,
      error: projectError != null ? String(projectError) : 'no row returned',
    });
  }

  const { challenges: allChallengesFromHook } = useSeasonChallenges(companyId, projectId ?? null);
  if (import.meta.env?.DEV && companyId && projectId) {
    logger.log('[ProjectDetailsPage] season challenges fetch (project-specific)', {
      projectId,
      count: allChallengesFromHook.length,
    });
  }

  const { data: allWorkLogs = [] } = useCollection<WorkLog>('project-details-worklogs', 'workLogs', {
    ...scope,
    projectId: projectId ?? null,
  });
  const { data: financeExpensesRaw = [] } = useQuery({
    queryKey: ['project-finance-expenses', companyId, projectId],
    queryFn: () => getFinanceExpenses(companyId!, { projectId: projectId! }),
    enabled: Boolean(companyId && projectId),
  });
  const allChallenges = allChallengesFromHook;
  const { data: allInventoryUsage = [] } = useCollection<InventoryUsage>(
    'project-details-usage',
    'inventoryUsage',
    { ...scope, projectId: projectId ?? null },
  );
  const { data: projectStagesRaw = [] } = useProjectStages(companyId ?? undefined, projectId ?? undefined);
  const projectStages = useMemo(
    () => [...projectStagesRaw].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0)),
    [projectStagesRaw],
  );
  const { data: projectBlocks = [] } = useProjectBlocks(
    companyId,
    projectId ?? null,
  );
  const [stageEditOpen, setStageEditOpen] = useState(false);
  const [selectedStageForEdit, setSelectedStageForEdit] = useState<CropStage | null>(null);
  const [cropStagesDrawerOpen, setCropStagesDrawerOpen] = useState(false);

  const workLogs = useMemo(
    () =>
      companyId && projectId
        ? allWorkLogs.filter((item) => item.companyId === companyId && item.projectId === projectId)
        : [],
    [allWorkLogs, companyId, projectId],
  );
  const expenses = useMemo((): Expense[] => {
    if (!companyId || !projectId) return [];
    return financeExpensesRaw.map(
      (e) =>
        ({
          id: e.id,
          companyId: e.companyId,
          projectId: e.projectId ?? projectId,
          category: e.category as Expense['category'],
          description: e.description,
          amount: e.amount,
          date: (typeof e.date === 'string'
            ? new Date(e.date.includes('T') ? e.date : `${e.date}T12:00:00`)
            : e.date) as Date,
        }) as Expense,
    );
  }, [financeExpensesRaw, companyId, projectId]);

  const { data: linkedBudgetPool } = useQuery({
    queryKey: ['budget-pool', companyId, project?.budgetPoolId],
    queryFn: () => getBudgetPool(project!.budgetPoolId!, companyId!),
    enabled: Boolean(companyId && project?.budgetPoolId),
  });
  const challenges = useMemo(
    () =>
      companyId && projectId
        ? allChallenges.filter((item) => item.companyId === companyId && item.projectId === projectId)
        : [],
    [allChallenges, companyId, projectId],
  );
  if (import.meta.env?.DEV && projectId) {
    logger.log('[ProjectDetailsPage] project-specific challenge filtering', {
      projectId,
      totalFromHook: allChallenges.length,
      filtered: challenges.length,
    });
  }
  const inventoryUsage = useMemo(
    () =>
      companyId && projectId
        ? allInventoryUsage.filter((item) => item.companyId === companyId && item.projectId === projectId)
        : [],
    [allInventoryUsage, companyId, projectId],
  );

  const loading = projectsLoading;

  const today = new Date();
  const normalizeDate = (raw: any | undefined) => toDate(raw) || undefined;

  // Single source of truth: project.plantingDate + crop stage template (config/cropTimelines)
  const cropTimeline = useMemo(
    () => getCropTimeline(project?.cropType ?? null),
    [project?.cropType],
  );
  const templateStages: StageRule[] = useMemo(
    () => cropTimeline?.stages ?? [],
    [cropTimeline],
  );
  const plantingDate = normalizeDate(project?.plantingDate as any);
  const daysSincePlanting = plantingDate != null ? calculateDaysSince(plantingDate) : null;
  const manualStageKey = project?.planning?.manualCurrentStage?.stageKey ?? null;

  const expectedHarvestDate = useMemo(() => {
    if (!project) return undefined;
    const date = getExpectedHarvestDate(project, project.useBlocks ? projectBlocks : undefined);
    return date ?? undefined;
  }, [project, projectBlocks]);

  const effectiveStageResult = useMemo(
    () => effectiveCurrentStage(templateStages, daysSincePlanting, manualStageKey),
    [templateStages, daysSincePlanting, manualStageKey],
  );

  const manualTimelineOverrideIndex = useMemo(
    () => resolveManualStageIndex(templateStages, manualStageKey),
    [templateStages, manualStageKey],
  );

  const currentStageLabel = useMemo(() => {
    if (!plantingDate) {
      return effectiveStageResult ? effectiveStageResult.stage.label : 'Set planting date';
    }
    if (daysSincePlanting != null && daysSincePlanting < 0) return 'Not planted yet';
    if (!templateStages.length) return 'No stage template';
    return effectiveStageResult?.stage.label ?? '—';
  }, [plantingDate, daysSincePlanting, templateStages.length, effectiveStageResult]);

  const stageProgressPercent = useMemo(() => {
    if (!effectiveStageResult || daysSincePlanting == null) return 0;
    return Math.round(getProgressWithinStage(effectiveStageResult.stage, daysSincePlanting) * 100);
  }, [effectiveStageResult, daysSincePlanting]);

  const timelineItems = useMemo(() => {
    if (!templateStages.length) return [];
    if (daysSincePlanting == null && manualTimelineOverrideIndex == null) return [];
    const day = daysSincePlanting ?? 0;
    return buildTimeline(templateStages, day, {
      currentStageIndexOverride: manualTimelineOverrideIndex,
    });
  }, [templateStages, daysSincePlanting, manualTimelineOverrideIndex]);

  const expenseSpanDays = useMemo(() => {
    if (!expenses.length) return 0;
    const times = expenses
      .map((e) => normalizeDate(e.date)?.getTime())
      .filter((t): t is number => t != null);
    if (!times.length) return 0;
    const minT = Math.min(...times);
    return Math.max(1, Math.ceil((Date.now() - minT) / 86400000));
  }, [expenses]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const labourCost = expenses
    .filter((e) => isLabourExpenseCategory(String(e.category)))
    .reduce((s, e) => s + e.amount, 0);
  const inputCost = expenses
    .filter((e) => isInputExpenseCategory(String(e.category)))
    .reduce((s, e) => s + e.amount, 0);
  const avgDailyDenominator =
    daysSincePlanting != null && daysSincePlanting > 0 ? daysSincePlanting : expenseSpanDays;
  const avgDailyCost = avgDailyDenominator > 0 ? Math.round(totalExpenses / avgDailyDenominator) : 0;

  const snapshotBudgetRemaining = useMemo(() => {
    if (!project) return null;
    if (project.budgetPoolId) {
      if (!linkedBudgetPool) return null;
      return linkedBudgetPool.totalAmount - totalExpenses;
    }
    if (Number(project.budget) > 0) return Number(project.budget) - totalExpenses;
    return null;
  }, [project, linkedBudgetPool, totalExpenses]);

  useEffect(() => {
    if (!import.meta.env.DEV || !projectId || !project) return;
    // eslint-disable-next-line no-console
    logger.log('[ProjectDetails financial snapshot source]', {
      projectId,
      financeExpenseCount: financeExpensesRaw.length,
      totalSpent: totalExpenses,
      labourCost,
      inputCost,
      budgetPoolId: project.budgetPoolId ?? null,
      poolTotal: linkedBudgetPool?.totalAmount ?? null,
      separateBudgetCap: project.budget,
    });
  }, [
    projectId,
    project,
    financeExpensesRaw.length,
    totalExpenses,
    labourCost,
    inputCost,
    linkedBudgetPool?.totalAmount,
    project?.budget,
    project?.budgetPoolId,
  ]);

  const totalSeasonDays = cropTimeline?.totalDaysToHarvest ?? null;
  const dayOfSeason =
    plantingDate == null
      ? 'Set planting date'
      : daysSincePlanting != null && daysSincePlanting < 0
        ? `Starts in ${Math.abs(daysSincePlanting)} days`
        : totalSeasonDays != null
          ? `Day ${Math.floor(daysSincePlanting ?? 0)} of ${totalSeasonDays}`
          : `Day ${Math.floor(daysSincePlanting ?? 0)} of season`;

  const harvestInDays = useMemo(() => {
    if (!expectedHarvestDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const harvest = new Date(expectedHarvestDate);
    harvest.setHours(0, 0, 0, 0);
    return Math.ceil((harvest.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }, [expectedHarvestDate]);

  const nextMilestone =
    harvestInDays != null && harvestInDays >= 0
      ? `Harvest in ${harvestInDays} days`
      : currentStageLabel && currentStageLabel !== 'Set planting date'
        ? `Current: ${currentStageLabel}`
        : null;

  const latestActivity = useMemo(() => {
    const workLog = [...workLogs]
      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))[0];
    const expense = [...expenses]
      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))[0];
    const wlTime = workLog ? normalizeDate(workLog.date)?.getTime() ?? 0 : 0;
    const exTime = expense ? normalizeDate(expense.date)?.getTime() ?? 0 : 0;
    if (wlTime >= exTime && workLog) {
      return `Work log: ${workLog.workCategory ?? 'Activity'} on ${formatDate(normalizeDate(workLog.date) ?? new Date())}`;
    }
    if (expense) {
      return `Expense: KES ${expense.amount.toLocaleString()} on ${formatDate(normalizeDate(expense.date) ?? new Date())}`;
    }
    return null;
  }, [workLogs, expenses]);

  const insightAlerts = useMemo(() => {
    const open = challenges.filter((c) => String(c.status).toLowerCase() !== 'resolved');
    return open.map((c) => c.title).filter(Boolean);
  }, [challenges]);

  const totalPeopleDays = workLogs.reduce(
    (sum, w) => sum + (w.numberOfPeople || 0),
    0,
  );
  const derivedLabourCost = workLogs.reduce(
    (sum, w) => sum + (w.numberOfPeople || 0) * (w.ratePerPerson || 0),
    0,
  );

  const workLogsByCategory = workLogs.reduce<Record<string, number>>((acc, w) => {
    const key = w.workCategory || 'Uncategorized work';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const inventoryUsageByItem = inventoryUsage.reduce<Record<string, { quantity: number; unit: string; category: string }>>(
    (acc, u) => {
      const key = u.inventoryItemId;
      if (!acc[key]) {
        acc[key] = { quantity: 0, unit: u.unit, category: u.category };
      }
      acc[key].quantity += u.quantity;
      return acc;
    },
    {},
  );

  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const [deletingProject, setDeletingProject] = useState(false);
  type SummaryTab = 'workLogs' | 'inventory' | 'expenses';
  const [detailsDialog, setDetailsDialog] = useState<SummaryTab | null>(null);

  if (!companyId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">No company context available.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <p className="text-sm text-muted-foreground">Loading project details…</p>
      </div>
    );
  }

  if (!project || projectError) {
    if (import.meta.env.DEV && projectId) {
      console.warn('[ProjectDetailsPage] Project not found – show fallback', {
        projectId,
        companyId,
        setupIncomplete: !companyId,
        hasError: !!projectError,
      });
    }
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate('/projects')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="fv-card flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <div>
            <h2 className="font-semibold text-foreground">Project not found</h2>
            <p className="text-sm text-muted-foreground">
              The requested project could not be found or you don&apos;t have access to it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const isClosed = isProjectClosed(project);

  const fieldSize = project.acreage != null ? `${Number(project.acreage)} ac` : '—';
  const expectedHarvestStr = expectedHarvestDate ? formatDate(expectedHarvestDate) : null;
  const openChallengesCount = challenges.filter((c) => String(c.status).toLowerCase() !== 'resolved').length;

  const handleStageClick = (index: number) => {
    if (isClosed) return;
    const item = timelineItems[index];
    if (!item || !projectId || !companyId) return;
    const existingStage = projectStages.find((s) => s.stageIndex === index);
    const stageForEdit: CropStage = existingStage ?? ({
      id: `placeholder-${index}`,
      projectId,
      companyId,
      cropType: (project?.cropType as any) ?? '',
      stageName: templateStages[index]?.label ?? `Stage ${index}`,
      stageIndex: index,
      status: 'pending',
    } as CropStage);
    setSelectedStageForEdit(stageForEdit);
    setStageEditOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8 lg:gap-8 animate-fade-in pb-8">
      {isClosed && (
        <Alert className="order-0 border-rose-200/80 bg-rose-50/80 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-50">
          <AlertTitle className="text-sm font-semibold">This project is closed</AlertTitle>
          <AlertDescription className="text-sm text-rose-900/90 dark:text-rose-100/90">
            Records stay on file for your records. Reopen it from the Projects list when you want to make changes or set it as your active farm again.
          </AlertDescription>
        </Alert>
      )}
      {/* 1. Hero – full width; fill gap under navbar on mobile and PC */}
      <div className="-mt-6 -mx-6 w-[calc(100%+3rem)] order-1">
        <ProjectHeroCard
        project={project}
        onBack={() => navigate('/projects')}
        onEditProject={() => navigate(`/projects/${project.id}/edit`)}
        onPlanSeason={() => navigate(`/projects/${project.id}/planning`)}
        dayOfSeason={dayOfSeason}
        currentStage={currentStageLabel}
        expectedHarvest={expectedHarvestStr}
        nextMilestone={nextMilestone}
        location={project.location ?? '—'}
        fieldSize={fieldSize}
        heroImageUrl={(project as { heroImageUrl?: string })?.heroImageUrl ?? getCropHeroImage(project.cropType)}
        readOnly={isClosed}
        />
      </div>

      {/* 2. Season Progress – after hero on desktop, after Financial on mobile */}
      {timelineItems.length > 0 && (
        <div className="order-3 lg:order-2">
          <div className="mb-3 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCropStagesDrawerOpen(true)}
              disabled={!activeProject}
            >
              Open crop stages
            </Button>
          </div>
          <SeasonProgressTimeline
            items={timelineItems}
            onStageClick={isClosed ? undefined : handleStageClick}
          />
        </div>
      )}

      {/* 3. Financial – before Season Progress on mobile */}
      <div className="order-2 lg:order-3">
      <ProjectFinancialSnapshot
        totalSpent={totalExpenses}
        labourCost={labourCost}
        inputCost={inputCost}
        averageDailyCost={Number.isFinite(avgDailyCost) ? avgDailyCost : 0}
        budgetRemaining={snapshotBudgetRemaining}
        formatCurrency={formatCurrency}
      />
      </div>

      {/* 4. Operations Summary + 5. Season Challenges (left) | Insight + Quick Actions (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 order-4">
        <div className="lg:col-span-2 space-y-6">
          <ProjectOperationsSummary
            workLogCount={workLogs.length}
            totalPeopleDays={totalPeopleDays}
            derivedLabourCost={derivedLabourCost}
            inventoryUsageByItem={inventoryUsageByItem}
            expensesByCategory={expensesByCategory}
            openChallengesCount={openChallengesCount}
            formatCurrency={formatCurrency}
            onViewWorkLogs={() => setDetailsDialog('workLogs')}
            onViewInventory={() => setDetailsDialog('inventory')}
            onViewExpenses={() => setDetailsDialog('expenses')}
            onViewChallenges={() => navigate('/notes?tab=challenges')}
            workLogsByCategory={workLogsByCategory}
          />
          <ProjectChallengesPanel
            challenges={challenges}
            onAddChallenge={() => navigate('/notes?tab=challenges')}
            onViewAll={() => navigate('/notes?tab=challenges')}
            limit={5}
          />
        </div>
        <div className="space-y-6">
          <SeasonInsightPanel
            currentStage={currentStageLabel}
            harvestInDays={harvestInDays}
            latestActivity={latestActivity}
            alerts={insightAlerts}
          />
          <ProjectQuickActions
            onPlanSeason={() => navigate(`/projects/${project.id}/planning`)}
            onViewWorkLogs={() => setDetailsDialog('workLogs')}
            onViewExpenses={() => setDetailsDialog('expenses')}
            onViewInventory={() => setDetailsDialog('inventory')}
            onAddChallenge={() => navigate('/notes?tab=challenges')}
            showPlanSeason={project.status === 'active'}
            showAddChallenge={!isClosed}
          />
        </div>
      </div>

      {/* 6. Planning Preview / Quick Actions */}
      <div className="order-5">
      <ProjectPlanningPreview
        hasPlan={Boolean(project.planning || project.plantingDate)}
        plantingDate={project.plantingDate ? formatDate(project.plantingDate) : null}
        seedVariety={(project.planning as any)?.seed?.variety ?? (project.planning as any)?.seed?.name ?? null}
        expectedChallengesCount={(project.planning as any)?.expectedChallenges?.length ?? 0}
        lastUpdated={(project.planning as any)?.planHistory?.[0] ? 'Recently' : null}
        onPlanSeason={() => navigate(`/projects/${project.id}/planning`)}
        onViewFullPlan={() => navigate(`/projects/${project.id}/planning`)}
        readOnly={isClosed}
      />
      </div>

      {/* 7. Danger Zone */}
      <div className="order-6">
      <ProjectDangerZone
        onDelete={async () => {
          if (!companyId || !project?.id) return;
          setDeletingProject(true);
          try {
            await deleteProjectService(project.id, {
              expectedRowVersion: project.rowVersion ?? 1,
            });
            if (activeProject?.id === project.id) setActiveProject(null);
            await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
            await queryClient.invalidateQueries({ queryKey: ['project', project.id, companyId] });
            navigate('/projects');
          } catch (err) {
            console.error('Failed to delete project:', err);
            alert('Failed to delete project. Please try again.');
          } finally {
            setDeletingProject(false);
          }
        }}
        deleting={deletingProject}
      />
      </div>

      {/* Details dialog: deep view for Work Logs / Inventory / Expenses */}
      <Dialog open={detailsDialog !== null} onOpenChange={(open) => !open && setDetailsDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {detailsDialog === 'workLogs' && 'Work Logs – Full detail'}
              {detailsDialog === 'inventory' && 'Inventory Usage – Full detail'}
              {detailsDialog === 'expenses' && 'Expenses – Full detail'}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-2">
            {detailsDialog === 'workLogs' && (
              <>
                <div className="text-sm text-muted-foreground">
                  {workLogs.length} log(s) · {totalPeopleDays} people-days · {formatCurrency(derivedLabourCost)} derived labour cost
                </div>
                {!workLogs.length && (
                  <p className="text-sm text-muted-foreground">No work logs recorded yet.</p>
                )}
                {workLogs.length > 0 && (
                  <div className="space-y-3">
                    {[...workLogs]
                      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))
                      .map((w) => {
                        const d = normalizeDate(w.date);
                        const cost = (w.numberOfPeople || 0) * (w.ratePerPerson || 0);
                        return (
                          <div key={w.id} className="border rounded-lg p-3 text-sm space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{d ? formatDate(d) : '—'}</span>
                              <span className="fv-badge text-xs">{w.workCategory}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              <span>{w.numberOfPeople ?? 0} people</span>
                              {w.ratePerPerson != null && <span>{formatCurrency(w.ratePerPerson)}/person</span>}
                              <span className="font-medium text-foreground">{formatCurrency(cost)}</span>
                            </div>
                            {(w.notes || w.inputsUsed) && (
                              <p className="text-xs text-muted-foreground pt-1 border-t mt-1">
                                {[w.notes, w.inputsUsed].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
            {detailsDialog === 'inventory' && (
              <>
                <div className="text-sm text-muted-foreground">
                  {inventoryUsage.length} usage record(s)
                </div>
                {!inventoryUsage.length && (
                  <p className="text-sm text-muted-foreground">No inventory usage recorded yet.</p>
                )}
                {inventoryUsage.length > 0 && (
                  <div className="space-y-3">
                    {[...inventoryUsage]
                      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))
                      .map((u) => {
                        const d = normalizeDate(u.date);
                        return (
                          <div key={u.id} className="border rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-medium capitalize">{u.category}</span>
                              <span className="text-muted-foreground ml-2">
                                {d ? formatDate(d, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              </span>
                            </div>
                            <span className="font-medium">
                              {u.quantity} {u.unit}
                            </span>
                            {u.source && (
                              <span className="fv-badge text-xs capitalize">{u.source.replace('-', ' ')}</span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
            {detailsDialog === 'expenses' && (
              <>
                <div className="text-sm text-muted-foreground">
                  {expenses.length} expense(s) · {formatCurrency(totalExpenses)} total
                </div>
                {!expenses.length && (
                  <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
                )}
                {expenses.length > 0 && (
                  <div className="space-y-3">
                    {[...expenses]
                      .sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))
                      .map((e) => {
                        const d = normalizeDate(e.date);
                        return (
                          <div key={e.id} className="border rounded-lg p-3 text-sm space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{d ? formatDate(d) : '—'}</span>
                              <span className="fv-badge text-xs capitalize">{e.category}</span>
                              <span className="font-semibold">{formatCurrency(e.amount)}</span>
                            </div>
                            {e.description && (
                              <p className="text-xs text-muted-foreground">{e.description}</p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <StageEditModal
        open={stageEditOpen}
        onOpenChange={setStageEditOpen}
        stage={selectedStageForEdit}
        project={project ? { id: project.id, companyId: project.companyId, cropType: project.cropType } : null}
        createdBy={user?.id ?? ''}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['projectStages'] })}
      />

      <Sheet open={cropStagesDrawerOpen} onOpenChange={setCropStagesDrawerOpen}>
        <SheetContent side="right" draggable className="w-full sm:max-w-2xl p-0">
          <SheetHeader className="p-6 border-b border-border/60">
            <SheetTitle>Crop stages</SheetTitle>
          </SheetHeader>
          <div className="p-6">
            <CropStagesPanel embedded />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}