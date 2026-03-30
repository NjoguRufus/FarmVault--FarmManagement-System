import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BadgeDollarSign } from 'lucide-react';
import { getProject } from '@/services/projectsService';
import { getFinanceExpenses } from '@/services/financeExpenseService';
import { getBudgetPool } from '@/services/budgetPoolService';
import { useCollection } from '@/hooks/useCollection';
import { useProjectStages } from '@/hooks/useProjectStages';
import { useSeasonChallenges } from '@/hooks/useSeasonChallenges';
import { useProjectBlocks } from '@/hooks/useProjectBlocks';
import { getCropTimeline } from '@/config/cropTimelines';
import {
  calculateDaysSince,
  buildTimeline,
  getProgressWithinStage,
  type StageRule,
} from '@/utils/cropStages';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Expense, InventoryUsage, Project, SeasonChallenge, WorkLog } from '@/types';
import { Button } from '@/components/ui/button';

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
    queryFn: () => getProject(projectId, { companyId }),
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
          date: (typeof e.date === 'string'
            ? new Date(e.date.includes('T') ? e.date : `${e.date}T12:00:00`)
            : e.date) as Date,
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

  const cropTimeline = useMemo(() => getCropTimeline((project as Project | null | undefined)?.cropType ?? null), [project]);
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
      <SheetContent side="right" draggable className="p-0 sm:max-w-none">
        <div className="border-b border-border/60 px-5 py-4">
          <SheetHeader className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="truncate">
                  {project?.name ?? projectName ?? (summary?.name ? String(summary.name) : 'Project details')}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  Developer read-only · Full project details (company-style).
                </p>
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

                  <ProjectChallengesPanel
                    challenges={challenges}
                    onAddChallenge={noop}
                    onViewAll={noop}
                    limit={5}
                    readOnly
                  />
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
                  <div className="text-sm text-muted-foreground">{inventoryUsage.length} usage record(s)</div>
                  {!inventoryUsage.length && <p className="text-sm text-muted-foreground">No inventory usage recorded yet.</p>}
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
                              {u.source && <span className="fv-badge text-xs capitalize">{u.source.replace('-', ' ')}</span>}
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
                  {!expenses.length && <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>}
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
                              {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
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
      </SheetContent>
    </Sheet>
  );
}

import React, { useMemo } from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { getProject } from '@/services/projectsService';
import {
  ProjectHeroCard,
  ProjectFinancialSnapshot,
  ProjectOperationsSummary,
  ProjectChallengesPanel,
  ProjectPlanningPreview,
  SeasonInsightPanel,
  SeasonProgressTimeline,
} from '@/components/project-details';
import { getCropHeroImage } from '@/lib/cropHeroImage';
import { formatDate } from '@/lib/dateUtils';
import { getCropTimeline } from '@/config/cropTimelines';
import { buildTimeline, calculateDaysSince, getProgressWithinStage, type StageRule } from '@/utils/cropStages';
import { effectiveCurrentStage, resolveManualStageIndex } from '@/lib/seasonStageOverride';
import { getExpectedHarvestDate } from '@/utils/expectedHarvest';
import { useCollection } from '@/hooks/useCollection';
import { useProjectBlocks } from '@/hooks/useProjectBlocks';
import { useProjectStages } from '@/hooks/useProjectStages';
import { useSeasonChallenges } from '@/hooks/useSeasonChallenges';
import { isInputExpenseCategory, isLabourExpenseCategory } from '@/lib/financeExpenseCategories';
import { getFinanceExpenses } from '@/services/financeExpenseService';
import type { CropStage, Expense, InventoryUsage, Project, SeasonChallenge, WorkLog } from '@/types';

type SummaryRow = Record<string, unknown>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  projectId: string;
  /** Row from developer intelligence list; used as fallback while loading/if RLS blocks deeper fetches. */
  summary?: SummaryRow | null;
};

function normalizeDay(raw: unknown): Date | undefined {
  if (!raw) return undefined;
  const s = String(raw);
  const iso = s.includes('T') ? s : `${s.slice(0, 10)}T12:00:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function fallbackProjectFromSummary(params: {
  companyId: string;
  projectId: string;
  summary?: SummaryRow | null;
}): Project {
  const s = params.summary ?? {};
  const name = String(s.name ?? 'Project');
  const cropType = (String(s.crop_type ?? s.cropType ?? 'unknown') as any) ?? 'unknown';
  const status = (String(s.status ?? 'active') as Project['status']) ?? 'active';
  const plantingDate = normalizeDay(s.planting_date ?? s.start_date ?? s.created_at);
  const createdAt = normalizeDay(s.created_at) ?? new Date();
  const acreageNum = Number(s.field_size ?? s.acreage ?? 0);
  const budgetNum = Number(s.budget ?? s.allocated_budget ?? 0);
  return {
    id: params.projectId,
    name,
    companyId: params.companyId,
    cropType,
    cropTypeKey: String(s.crop_type ?? ''),
    environmentType: (String(s.environment ?? 'open_field') as any) ?? 'open_field',
    status,
    startDate: plantingDate ?? createdAt,
    endDate: normalizeDay(s.expected_end_date ?? s.end_date),
    location: String(s.location ?? s.location_notes ?? s.notes ?? ''),
    acreage: Number.isFinite(acreageNum) ? acreageNum : 0,
    budget: Number.isFinite(budgetNum) ? budgetNum : 0,
    createdAt: createdAt ?? new Date(),
    plantingDate,
    budgetPoolId: (s.budget_pool_id as string | null | undefined) ?? null,
    planning: (s.planning as any) ?? undefined,
    setupComplete: true,
  };
}

export function DeveloperProjectDetailsSheet({ open, onOpenChange, companyId, projectId, summary }: Props) {
  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['developer', 'project-details', companyId, projectId],
    queryFn: async (): Promise<Project | null> => {
      // Reuse canonical project fetch used by company-side ProjectDetailsPage.
      return await getProject(projectId, { companyId });
    },
    enabled: open && Boolean(companyId) && Boolean(projectId),
    staleTime: 30_000,
  });

  const effectiveProject: Project | null = project ?? null;
  const projectForView = effectiveProject ?? fallbackProjectFromSummary({ companyId, projectId, summary });

  const scope = useMemo(
    () => ({ companyScoped: true, companyId, isDeveloper: true, enabled: open && Boolean(companyId) }),
    [companyId, open],
  );

  const { challenges: allChallengesFromHook } = useSeasonChallenges(companyId, projectId);
  const challenges = useMemo(
    () =>
      allChallengesFromHook.filter((c: SeasonChallenge) => c.companyId === companyId && c.projectId === projectId),
    [allChallengesFromHook, companyId, projectId],
  );

  const { data: allWorkLogs = [] } = useCollection<WorkLog>('dev-project-details-worklogs', 'workLogs', {
    ...scope,
    projectId,
  });
  const workLogs = useMemo(
    () => allWorkLogs.filter((w) => w.companyId === companyId && w.projectId === projectId),
    [allWorkLogs, companyId, projectId],
  );

  const { data: allInventoryUsage = [] } = useCollection<InventoryUsage>('dev-project-details-usage', 'inventoryUsage', {
    ...scope,
    projectId,
  });
  const inventoryUsage = useMemo(
    () => allInventoryUsage.filter((u) => u.companyId === companyId && u.projectId === projectId),
    [allInventoryUsage, companyId, projectId],
  );

  const { data: projectStagesRaw = [] } = useProjectStages(companyId, projectId);
  const projectStages = useMemo(
    () => [...projectStagesRaw].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0)),
    [projectStagesRaw],
  );

  const { data: projectBlocks = [] } = useProjectBlocks(companyId, projectId);

  const { data: financeExpensesRaw = [] } = useQuery({
    queryKey: ['dev-project-finance-expenses', companyId, projectId],
    queryFn: () => getFinanceExpenses(companyId, projectId),
    enabled: open && Boolean(companyId) && Boolean(projectId),
    staleTime: 30_000,
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

  const plantingDate = normalizeDay(
    projectForView?.plantingDate ??
      (summary?.start_date as string | undefined) ??
      (summary?.planting_date as string | undefined),
  );
  const daysSincePlanting = plantingDate ? calculateDaysSince(plantingDate) : null;

  const cropTimeline = useMemo(() => getCropTimeline(projectForView?.cropType ?? null), [projectForView?.cropType]);
  const templateStages: StageRule[] = useMemo(() => cropTimeline?.stages ?? [], [cropTimeline]);

  const manualStageKey = (projectForView?.planning as any)?.manualCurrentStage?.stageKey ?? null;
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

  const expectedHarvestDate = useMemo(() => {
    if (!projectForView) return undefined;
    return getExpectedHarvestDate(projectForView, (projectForView as any).useBlocks ? projectBlocks : undefined) ?? undefined;
  }, [projectForView, projectBlocks]);

  const expectedHarvestStr = expectedHarvestDate ? formatDate(expectedHarvestDate) : null;

  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const labourCost = expenses.filter((e) => isLabourExpenseCategory(String(e.category))).reduce((s, e) => s + e.amount, 0);
  const inputCost = expenses.filter((e) => isInputExpenseCategory(String(e.category))).reduce((s, e) => s + e.amount, 0);
  const avgDailyDenominator = daysSincePlanting != null && daysSincePlanting > 0 ? daysSincePlanting : Math.max(1, expenses.length);
  const avgDailyCost = avgDailyDenominator > 0 ? Math.round(totalExpenses / avgDailyDenominator) : 0;
  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const fieldSize = projectForView?.acreage != null ? `${Number(projectForView.acreage)} ac` : '—';
  const dayOfSeason = plantingDate == null ? 'Set planting date' : `Day ${Math.max(0, Math.floor(daysSincePlanting ?? 0))} of season`;
  const nextMilestone = currentStageLabel && currentStageLabel !== 'Set planting date' ? `Current: ${currentStageLabel}` : null;

  const totalPeopleDays = workLogs.reduce((sum, w) => sum + (w.numberOfPeople || 0), 0);
  const derivedLabourCost = workLogs.reduce((sum, w) => sum + (w.numberOfPeople || 0) * (w.ratePerPerson || 0), 0);

  const workLogsByCategory = workLogs.reduce<Record<string, number>>((acc, w) => {
    const key = w.workCategory || 'Uncategorized work';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const inventoryUsageByItem = inventoryUsage.reduce<Record<string, { quantity: number; unit: string; category: string }>>((acc, u) => {
    const key = u.inventoryItemId;
    if (!acc[key]) acc[key] = { quantity: 0, unit: u.unit, category: u.category };
    acc[key].quantity += u.quantity;
    return acc;
  }, {});

  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const openChallengesCount = challenges.filter((c) => String(c.status).toLowerCase() !== 'resolved').length;
  const insightAlerts = challenges.filter((c) => String(c.status).toLowerCase() !== 'resolved').map((c) => c.title).filter(Boolean);

  const latestActivity = useMemo(() => {
    const wl = [...workLogs].sort((a, b) => (a.date as any)?.getTime?.() ?? 0 - ((b.date as any)?.getTime?.() ?? 0))[0];
    const ex = [...expenses].sort((a, b) => (a.date as any)?.getTime?.() ?? 0 - ((b.date as any)?.getTime?.() ?? 0))[0];
    if (wl) return `Work log: ${wl.workCategory ?? 'Activity'}`;
    if (ex) return `Expense: KES ${ex.amount.toLocaleString()}`;
    return null;
  }, [workLogs, expenses]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" draggable className="p-0 w-[95vw] sm:max-w-[1100px]">
        <div className="border-b border-border/60 px-5 py-4">
          <SheetHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                <Eye className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="truncate">
                  {effectiveProject?.name ?? String(summary?.name ?? 'Project details')}
                </SheetTitle>
                <SheetDescription className="line-clamp-2">
                  Developer Console · Read-only Project Details view
                </SheetDescription>
              </div>
              <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 py-6">
          {error ? (
            <div className="fv-card flex items-center gap-3 border-destructive/40 bg-destructive/5 p-4 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Project details unavailable</p>
                <p className="text-xs opacity-90">{String((error as Error).message ?? error)}</p>
              </div>
            </div>
          ) : null}

          <div className="space-y-6">
            <div className="-mt-2 -mx-6 w-[calc(100%+3rem)]">
              <ProjectHeroCard
                project={projectForView}
                onBack={() => onOpenChange(false)}
                onEditProject={() => {}}
                onPlanSeason={() => {}}
                dayOfSeason={dayOfSeason}
                currentStage={currentStageLabel}
                expectedHarvest={expectedHarvestStr}
                nextMilestone={nextMilestone}
                location={projectForView?.location ?? String(summary?.location_notes ?? '—')}
                fieldSize={fieldSize}
                heroImageUrl={(projectForView as any)?.heroImageUrl ?? getCropHeroImage(projectForView?.cropType ?? (summary?.crop_type as any))}
                readOnly
              />
            </div>

            {timelineItems.length > 0 ? (
              <SeasonProgressTimeline items={timelineItems} onStageClick={undefined} />
            ) : null}

            <ProjectFinancialSnapshot
              totalSpent={totalExpenses}
              labourCost={labourCost}
              inputCost={inputCost}
              averageDailyCost={Number.isFinite(avgDailyCost) ? avgDailyCost : 0}
              budgetRemaining={null}
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
                  openChallengesCount={openChallengesCount}
                  formatCurrency={formatCurrency}
                  onViewWorkLogs={undefined}
                  onViewInventory={undefined}
                  onViewExpenses={undefined}
                  onViewChallenges={undefined}
                  workLogsByCategory={workLogsByCategory}
                />
                <ProjectChallengesPanel challenges={challenges} onAddChallenge={undefined} onViewAll={undefined} limit={5} />
              </div>
              <div className="space-y-6">
                <SeasonInsightPanel
                  currentStage={currentStageLabel}
                  harvestInDays={null}
                  latestActivity={latestActivity}
                  alerts={insightAlerts}
                />
              </div>
            </div>

            <ProjectPlanningPreview
              hasPlan={Boolean(projectForView?.planning || projectForView?.plantingDate)}
              plantingDate={projectForView?.plantingDate ? formatDate(projectForView.plantingDate) : null}
              seedVariety={(projectForView?.planning as any)?.seed?.variety ?? (projectForView?.planning as any)?.seed?.name ?? null}
              expectedChallengesCount={(projectForView?.planning as any)?.expectedChallenges?.length ?? 0}
              lastUpdated={(projectForView?.planning as any)?.planHistory?.[0] ? 'Recently' : null}
              onPlanSeason={undefined}
              onViewFullPlan={undefined}
              readOnly
            />
          </div>

          {isLoading ? (
            <p className="mt-4 text-xs text-muted-foreground">Loading project details…</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

