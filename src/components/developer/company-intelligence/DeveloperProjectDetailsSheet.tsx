import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeDollarSign } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { developerGetProjectById, getProject } from '@/services/projectsService';
import { getFinanceExpenses } from '@/services/financeExpenseService';
import { getBudgetPool } from '@/services/budgetPoolService';
import { useCollection } from '@/hooks/useCollection';
import { useProjectStages } from '@/hooks/useProjectStages';
import { useSeasonChallenges } from '@/hooks/useSeasonChallenges';
import { useProjectBlocks } from '@/hooks/useProjectBlocks';
import { getCropTimeline } from '@/config/cropTimelines';
import { buildTimeline, calculateDaysSince, getProgressWithinStage, type StageRule } from '@/utils/cropStages';
import { toDate, formatDate } from '@/lib/dateUtils';
import { effectiveCurrentStage, resolveManualStageIndex } from '@/lib/seasonStageOverride';
import { getExpectedHarvestDate } from '@/utils/expectedHarvest';
import { isInputExpenseCategory, isLabourExpenseCategory } from '@/lib/financeExpenseCategories';
import { getCropHeroImage } from '@/lib/cropHeroImage';
import {
  ProjectHeroCard,
  SeasonProgressTimeline,
  ProjectFinancialSnapshot,
  ProjectOperationsSummary,
  ProjectChallengesPanel,
  ProjectPlanningPreview,
  SeasonInsightPanel,
} from '@/components/project-details';
import type { Expense, InventoryUsage, Project, SeasonChallenge, WorkLog } from '@/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  projectId: string;
  /** Optional row summary from the list/table. */
  summary?: Record<string, unknown> | null;
  /** Optional display name override. */
  projectName?: string;
};

export function DeveloperProjectDetailsSheet({ open, onOpenChange, companyId, projectId, summary, projectName }: Props) {
  const queryClient = useQueryClient();

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useQuery({
    queryKey: ['developer-project', projectId, companyId],
    queryFn: async () => {
      // Developer Console: fetch project directly by id (no tenant scoping).
      // Avoid any loaders that depend on current_company_id().
      try {
        const direct = await developerGetProjectById(projectId);
        if (direct) return direct;
      } catch {
        // fall back below
      }
      // Fallback: some deployments may still require a company context for this select.
      return await getProject(projectId, { companyId });
    },
    enabled: open && Boolean(projectId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const scope = useMemo(
    () => ({ companyScoped: true, companyId, isDeveloper: true, enabled: open && !!companyId }),
    [companyId, open],
  );

  const { challenges: challengesFromHook } = useSeasonChallenges(companyId, projectId);
  const { data: allWorkLogs = [] } = useCollection<WorkLog>('developer-project-worklogs', 'workLogs', {
    ...scope,
    projectId,
  });
  const { data: allInventoryUsage = [] } = useCollection<InventoryUsage>('developer-project-usage', 'inventoryUsage', {
    ...scope,
    projectId,
  });
  const { data: projectStagesRaw = [] } = useProjectStages(companyId ?? undefined, projectId ?? undefined);
  const { data: projectBlocks = [] } = useProjectBlocks(companyId, projectId);

  const { data: financeExpensesRaw = [] } = useQuery({
    queryKey: ['developer-project-finance-expenses', companyId, projectId],
    queryFn: () => getFinanceExpenses(companyId, projectId),
    enabled: open && Boolean(companyId && projectId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const expenses = useMemo((): Expense[] => {
    return financeExpensesRaw.map(
      (e) =>
        ({
          id: e.id,
          companyId: e.companyId,
          projectId: e.projectId ?? projectId,
          category: e.category as Expense['category'],
          description: e.description,
          amount: e.amount,
          date: (typeof e.date === 'string' ? new Date(e.date.includes('T') ? e.date : `${e.date}T12:00:00`) : e.date) as Date,
        }) as Expense,
    );
  }, [financeExpensesRaw, projectId]);

  const { data: linkedBudgetPool } = useQuery({
    queryKey: ['developer-budget-pool', companyId, (project as Project | null | undefined)?.budgetPoolId],
    queryFn: () => getBudgetPool((project as Project).budgetPoolId!, companyId),
    enabled: open && Boolean(companyId && (project as Project | null | undefined)?.budgetPoolId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const challenges = useMemo(() => {
    return challengesFromHook.filter((c) => c.companyId === companyId && c.projectId === projectId) as SeasonChallenge[];
  }, [challengesFromHook, companyId, projectId]);

  const workLogs = useMemo(
    () => allWorkLogs.filter((w) => w.companyId === companyId && w.projectId === projectId),
    [allWorkLogs, companyId, projectId],
  );
  const inventoryUsage = useMemo(
    () => allInventoryUsage.filter((u) => u.companyId === companyId && u.projectId === projectId),
    [allInventoryUsage, companyId, projectId],
  );

  const projectStages = useMemo(
    () => [...projectStagesRaw].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0)),
    [projectStagesRaw],
  );

  const normalizeDate = (raw: any | undefined) => toDate(raw) || undefined;

  const cropTimeline = useMemo(
    () => getCropTimeline((project as Project | null | undefined)?.cropType ?? null),
    [project],
  );
  const templateStages: StageRule[] = useMemo(() => cropTimeline?.stages ?? [], [cropTimeline]);
  const plantingDate = normalizeDate((project as any)?.plantingDate);
  const daysSincePlanting = plantingDate != null ? calculateDaysSince(plantingDate) : null;
  const manualStageKey = (project as any)?.planning?.manualCurrentStage?.stageKey ?? null;

  const expectedHarvestDate = useMemo(() => {
    if (!project) return undefined;
    return getExpectedHarvestDate(project as any, (project as any).useBlocks ? projectBlocks : undefined) ?? undefined;
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
    if (!plantingDate) return effectiveStageResult ? effectiveStageResult.stage.label : 'Set planting date';
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
    return buildTimeline(templateStages, day, { currentStageIndexOverride: manualTimelineOverrideIndex });
  }, [templateStages, daysSincePlanting, manualTimelineOverrideIndex]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const labourCost = expenses.filter((e) => isLabourExpenseCategory(String(e.category))).reduce((s, e) => s + e.amount, 0);
  const inputCost = expenses.filter((e) => isInputExpenseCategory(String(e.category))).reduce((s, e) => s + e.amount, 0);

  const expenseSpanDays = useMemo(() => {
    if (!expenses.length) return 0;
    const times = expenses.map((e) => normalizeDate(e.date)?.getTime()).filter((t): t is number => t != null);
    if (!times.length) return 0;
    const minT = Math.min(...times);
    return Math.max(1, Math.ceil((Date.now() - minT) / 86400000));
  }, [expenses]);

  const avgDailyDenominator = daysSincePlanting != null && daysSincePlanting > 0 ? daysSincePlanting : expenseSpanDays;
  const avgDailyCost = avgDailyDenominator > 0 ? Math.round(totalExpenses / avgDailyDenominator) : 0;

  const snapshotBudgetRemaining = useMemo(() => {
    if (!project) return null;
    const p = project as any;
    if (p.budgetPoolId) {
      if (!linkedBudgetPool) return null;
      return linkedBudgetPool.totalAmount - totalExpenses;
    }
    if (Number(p.budget) > 0) return Number(p.budget) - totalExpenses;
    return null;
  }, [project, linkedBudgetPool, totalExpenses]);

  const totalSeasonDays = cropTimeline?.totalDaysToHarvest ?? null;
  const dayOfSeason =
    plantingDate == null
      ? 'Set planting date'
      : daysSincePlanting != null && daysSincePlanting < 0
        ? `Starts in ${Math.abs(daysSincePlanting)} days`
        : totalSeasonDays != null
          ? `Day ${Math.floor(daysSincePlanting ?? 0)} of ${totalSeasonDays}`
          : `Day ${Math.floor(daysSincePlanting ?? 0)} of season`;

  const expectedHarvestStr = expectedHarvestDate ? formatDate(expectedHarvestDate) : null;
  const nextMilestone = expectedHarvestStr ? `Harvest: ${expectedHarvestStr}` : null;

  const inventoryUsageByItem = useMemo(
    () =>
      inventoryUsage.reduce<Record<string, { quantity: number; unit: string; category: string }>>((acc, u) => {
        const key = u.inventoryItemId;
        if (!acc[key]) acc[key] = { quantity: 0, unit: u.unit, category: u.category };
        acc[key].quantity += u.quantity;
        return acc;
      }, {}),
    [inventoryUsage],
  );

  const expensesByCategory = useMemo(
    () =>
      expenses.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {}),
    [expenses],
  );

  const totalPeopleDays = workLogs.reduce((sum, w) => sum + (w.numberOfPeople || 0), 0);
  const derivedLabourCost = workLogs.reduce((sum, w) => sum + (w.numberOfPeople || 0) * (w.ratePerPerson || 0), 0);

  const workLogsByCategory = useMemo(
    () =>
      workLogs.reduce<Record<string, number>>((acc, w) => {
        const key = w.workCategory || 'Uncategorized work';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    [workLogs],
  );

  const latestActivity = useMemo(() => {
    const wl = [...workLogs].sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))[0];
    const ex = [...expenses].sort((a, b) => (normalizeDate(b.date)?.getTime() ?? 0) - (normalizeDate(a.date)?.getTime() ?? 0))[0];
    const wlTime = wl ? normalizeDate(wl.date)?.getTime() ?? 0 : 0;
    const exTime = ex ? normalizeDate(ex.date)?.getTime() ?? 0 : 0;
    if (wlTime >= exTime && wl) return `Work log: ${wl.workCategory ?? 'Activity'}`;
    if (ex) return `Expense: KES ${ex.amount.toLocaleString()}`;
    return null;
  }, [workLogs, expenses]);

  const insightAlerts = useMemo(() => {
    const open = challenges.filter((c) => String(c.status).toLowerCase() !== 'resolved');
    return open.map((c) => c.title).filter(Boolean);
  }, [challenges]);

  type SummaryTab = 'workLogs' | 'inventory' | 'expenses';
  const [detailsDialog, setDetailsDialog] = useState<SummaryTab | null>(null);

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  useEffect(() => {
    if (!open) setDetailsDialog(null);
  }, [open]);

  // Keep this view strictly read-only: no mutations or navigation.
  const noop = () => {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        draggable
        className="p-0 w-full sm:max-w-[680px] md:max-w-[820px] lg:max-w-[980px] xl:max-w-[1120px]"
      >
        <div className="border-b border-border/60 px-5 py-4">
          <SheetHeader className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="truncate">
                  {project?.name ?? projectName ?? (summary?.name ? String(summary.name) : 'Project details')}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">Developer read-only · Full project details (company-style).</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['developer-project', projectId, companyId] })}
              >
                <BadgeDollarSign className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </SheetHeader>
        </div>

        <div className="px-5 py-5 space-y-6">
          {projectLoading && <p className="text-sm text-muted-foreground">Loading project details…</p>}
          {!projectLoading && (!project || projectError) && (
            <div className="fv-card flex items-center gap-3 p-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div>
                <p className="font-semibold text-foreground">Project not found</p>
                <p className="text-sm text-muted-foreground">
                  The requested project could not be found or is not visible to the Developer Console.
                </p>
              </div>
            </div>
          )}

          {project && !projectError && (
            <div className="space-y-6">
              <ProjectHeroCard
                project={project as any}
                onBack={() => onOpenChange(false)}
                onEditProject={noop}
                onPlanSeason={noop}
                dayOfSeason={dayOfSeason}
                currentStage={`${currentStageLabel} · ${stageProgressPercent}%`}
                expectedHarvest={expectedHarvestStr}
                nextMilestone={nextMilestone}
                location={(project as any).location ?? '—'}
                fieldSize={(project as any).acreage != null ? `${Number((project as any).acreage)} ac` : '—'}
                heroImageUrl={(project as any)?.heroImageUrl ?? getCropHeroImage((project as any).cropType)}
                readOnly
              />

              {timelineItems.length > 0 && <SeasonProgressTimeline items={timelineItems} />}

              <ProjectFinancialSnapshot
                totalSpent={totalExpenses}
                labourCost={labourCost}
                inputCost={inputCost}
                averageDailyCost={Number.isFinite(avgDailyCost) ? avgDailyCost : 0}
                budgetRemaining={snapshotBudgetRemaining}
                formatCurrency={formatCurrency}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <ProjectOperationsSummary
                    workLogCount={workLogs.length}
                    totalPeopleDays={totalPeopleDays}
                    derivedLabourCost={derivedLabourCost}
                    inventoryUsageByItem={inventoryUsageByItem}
                    expensesByCategory={expensesByCategory}
                    openChallengesCount={challenges.filter((c) => String(c.status).toLowerCase() !== 'resolved').length}
                    formatCurrency={formatCurrency}
                    onViewWorkLogs={() => setDetailsDialog('workLogs')}
                    onViewInventory={() => setDetailsDialog('inventory')}
                    onViewExpenses={() => setDetailsDialog('expenses')}
                    onViewChallenges={noop}
                    workLogsByCategory={workLogsByCategory}
                  />

                  <ProjectChallengesPanel challenges={challenges} onAddChallenge={noop} onViewAll={noop} limit={5} readOnly />
                </div>

                <div className="space-y-6">
                  <SeasonInsightPanel currentStage={currentStageLabel} harvestInDays={null} latestActivity={latestActivity} alerts={insightAlerts} />
                </div>
              </div>

              <ProjectPlanningPreview
                hasPlan={Boolean((project as any).planning || (project as any).plantingDate)}
                plantingDate={(project as any).plantingDate ? formatDate((project as any).plantingDate) : null}
                seedVariety={(project as any)?.planning?.seed?.variety ?? (project as any)?.planning?.seed?.name ?? null}
                expectedChallengesCount={(project as any)?.planning?.expectedChallenges?.length ?? 0}
                lastUpdated={(project as any)?.planning?.planHistory?.[0] ? 'Recently' : null}
                onPlanSeason={noop}
                onViewFullPlan={noop}
                readOnly
              />
            </div>
          )}
        </div>

        <Dialog open={detailsDialog !== null} onOpenChange={(o) => !o && setDetailsDialog(null)}>
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
                  {!workLogs.length && <p className="text-sm text-muted-foreground">No work logs recorded yet.</p>}
                </>
              )}
              {detailsDialog === 'inventory' && (
                <>
                  <div className="text-sm text-muted-foreground">{inventoryUsage.length} usage record(s)</div>
                  {!inventoryUsage.length && <p className="text-sm text-muted-foreground">No inventory usage recorded yet.</p>}
                </>
              )}
              {detailsDialog === 'expenses' && (
                <>
                  <div className="text-sm text-muted-foreground">
                    {expenses.length} expense(s) · {formatCurrency(totalExpenses)} total
                  </div>
                  {!expenses.length && <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

