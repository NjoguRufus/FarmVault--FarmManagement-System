/**
 * Smart Advisory Engine — builds 2–3 action-driven advisories for the Crop Stage Progress card.
 * Pure, deterministic, no hooks. Uses simple English and adapts to environment and acreage.
 */

export type EnvironmentKind = 'openField' | 'greenhouse' | 'open_field' | 'greenhouse';

export interface AdvisoryItem {
  id: string;
  text: string;
  reason?: string;
  priority: number;
  icon?: string;
}

export interface AdvisoryProject {
  cropType?: string | null;
  environment?: EnvironmentKind | null;
  acreage?: number | null;
  plantingDate?: Date | string | null;
  currentStage?: string | null;
  expectedEndDate?: Date | string | null;
}

export interface AdvisoryTask {
  id: string;
  title: string;
  dueDate: Date | string | null;
  isOverdue?: boolean;
}

export interface AdvisoryInventoryItem {
  id: string;
  name: string;
  quantity: number;
  minThreshold?: number | null;
  category?: string | null;
}

export interface BuildSmartAdvisoryParams {
  project?: AdvisoryProject | null;
  overdueTasks?: AdvisoryTask[] | null;
  dueSoonTasks?: AdvisoryTask[] | null;
  nextTask?: AdvisoryTask | null;
  lowStockItems?: AdvisoryInventoryItem[] | null;
  harvestStarted?: boolean;
  recentExpensesTrend?: 'high' | 'normal' | 'low' | null;
}

const MAX_ITEMS = 3;
const LOW_STOCK_DEFAULT_THRESHOLD = 5;

function isLowStock(item: AdvisoryInventoryItem): boolean {
  const threshold = item.minThreshold ?? LOW_STOCK_DEFAULT_THRESHOLD;
  return Number.isFinite(item.quantity) && item.quantity <= threshold;
}

function normalizeStageKey(stage?: string | null): string {
  if (!stage || typeof stage !== 'string') return '';
  return stage.toLowerCase().replace(/[-_\s]/g, '');
}

function getStageChecklistReminder(currentStage: string, environment: 'greenhouse' | 'openField'): string | null {
  const key = normalizeStageKey(currentStage);
  if (key.includes('seedling') || key.includes('nursery')) {
    return 'Check for weak seedlings and replace them.';
  }
  if (key.includes('vegetative')) {
    return environment === 'greenhouse'
      ? 'Check weeds and clear them early. Check drip lines if you use them.'
      : 'Check weeds and clear them early.';
  }
  if (key.includes('flowering')) {
    return environment === 'greenhouse'
      ? 'Check flowers for pests and damage. Check humidity and heat in the house.'
      : 'Check flowers for pests and damage.';
  }
  if (key.includes('fruiting')) {
    return 'Check fruits and remove damaged ones.';
  }
  if (key.includes('harvest')) {
    return 'Plan harvest team and crates before peak days.';
  }
  return null;
}

function getAcreageHint(acreage: number): string | null {
  if (!Number.isFinite(acreage) || acreage <= 0) return null;
  if (acreage < 2) {
    return 'Make sure you have enough mulch and inputs for this plot.';
  }
  if (acreage >= 5) {
    return 'Plan enough labour for this acreage.';
  }
  return null;
}

function getEnvironmentHint(environment: 'greenhouse' | 'openField'): string | null {
  if (environment === 'greenhouse') {
    return 'Check greenhouse vents and fans when it’s hot.';
  }
  return 'Check soil moisture and water supply when needed.';
}

export function buildSmartAdvisory(params: BuildSmartAdvisoryParams): AdvisoryItem[] {
  const {
    project,
    overdueTasks = [],
    dueSoonTasks = [],
    nextTask,
    lowStockItems = [],
    harvestStarted = false,
    recentExpensesTrend,
  } = params;

  const envRaw = project?.environment ?? null;
  const isGreenhouse =
    envRaw === 'greenhouse' || (typeof envRaw === 'string' && envRaw.toLowerCase().includes('greenhouse'));
  const environment: 'greenhouse' | 'openField' = isGreenhouse ? 'greenhouse' : 'openField';

  const items: AdvisoryItem[] = [];
  let seq = 0;

  function add(item: Omit<AdvisoryItem, 'priority'>) {
    if (items.length >= MAX_ITEMS) return;
    items.push({ ...item, priority: ++seq });
  }

  // A. Overdue tasks
  const overdue = Array.isArray(overdueTasks) ? overdueTasks.filter((t) => t?.isOverdue !== false) : [];
  if (overdue.length > 0) {
    const first = overdue[0];
    const title = first?.title || 'Task';
    add({
      id: 'advisory-overdue',
      text: `Complete overdue task: ${title}.`,
      reason: 'Based on your tasks',
      icon: 'alert-circle',
    });
  }

  // B. Next task due soon (today / this week)
  const dueSoon = Array.isArray(dueSoonTasks) ? dueSoonTasks : [];
  const next = nextTask || (dueSoon.length > 0 ? dueSoon[0] : null);
  if (next && next.title && items.length < MAX_ITEMS) {
    add({
      id: 'advisory-due-soon',
      text: `Upcoming: ${next.title}.`,
      reason: 'Based on your tasks',
      icon: 'calendar',
    });
  }

  // C. Low inventory
  const low = Array.isArray(lowStockItems) ? lowStockItems.filter(isLowStock) : [];
  if (low.length > 0 && items.length < MAX_ITEMS) {
    const name = low[0].name || 'inputs';
    add({
      id: 'advisory-low-stock',
      text: `Restock "${name}" soon — running low.`,
      reason: 'Based on your inputs',
      icon: 'package',
    });
  }

  // D. Stage-based checklist
  if (project?.currentStage && items.length < MAX_ITEMS) {
    const reminder = getStageChecklistReminder(project.currentStage, environment);
    if (reminder) {
      add({
        id: 'advisory-stage',
        text: reminder,
        reason: 'Stage reminder',
        icon: 'sprout',
      });
    }
  }

  // Harvest-specific
  if (harvestStarted && items.length < MAX_ITEMS) {
    add({
      id: 'advisory-harvest',
      text: 'Harvest is active. Check crates and record collections daily.',
      reason: 'Harvest status',
      icon: 'package-check',
    });
  }

  // E. Acreage hint
  if (project?.acreage != null && items.length < MAX_ITEMS) {
    const hint = getAcreageHint(Number(project.acreage));
    if (hint) {
      add({
        id: 'advisory-acreage',
        text: hint,
        reason: 'Based on your acreage',
        icon: 'map-pin',
      });
    }
  }

  // F. Environment hint
  if (items.length < MAX_ITEMS) {
    const hint = getEnvironmentHint(environment);
    if (hint) {
      add({
        id: 'advisory-environment',
        text: hint,
        reason: environment === 'greenhouse' ? 'Greenhouse' : 'Open field',
        icon: 'wind',
      });
    }
  }

  // G. Budget/expense (only if safe to show)
  if (recentExpensesTrend === 'high' && items.length < MAX_ITEMS) {
    add({
      id: 'advisory-expenses',
      text: 'Recent expenses are high. Review your budget for this project.',
      reason: 'Based on expenses',
      icon: 'trending-up',
    });
  }

  return items;
}

/** Single fallback item when no data is available. */
export function getFallbackAdvisory(): AdvisoryItem[] {
  return [
    {
      id: 'advisory-fallback',
      text: 'No advisory yet — add tasks or inputs to get guidance.',
      reason: undefined,
      priority: 0,
      icon: 'info',
    },
  ];
}

// --- Smart Advisory Card (combined advisory + recent updates) ---

export type AdvisoryCardChipKey = 'add_operation' | 'record_expense' | 'update_stage';

export interface SmartAdvisoryCardSummary {
  headline: string;
  body: string;
  why: string;
  chipKeys: AdvisoryCardChipKey[];
}

export interface BuildSmartAdvisoryCardSummaryParams {
  hasActivityToday?: boolean;
  pendingTasksCount?: number;
  stageNearingEnd?: boolean;
  expensesRising?: boolean;
  harvestActive?: boolean;
  environment?: 'openField' | 'greenhouse';
}

/** Builds a single headline + body + why for the Smart Advisory card. Simple, safe English. */
export function buildSmartAdvisoryCardSummary(
  params: BuildSmartAdvisoryCardSummaryParams
): SmartAdvisoryCardSummary {
  const {
    hasActivityToday = false,
    pendingTasksCount = 0,
    stageNearingEnd = false,
    expensesRising = false,
    harvestActive = false,
    environment = 'openField',
  } = params;

  const manyPending = pendingTasksCount > 0;

  // Priority: harvest > expenses > pending tasks > stage nearing end > no activity > default
  if (harvestActive) {
    return {
      headline: 'Focus today: Record harvest and sales',
      body: 'Harvest is active. Record intake and sales to see profit.',
      why: 'So you can see your profit.',
      chipKeys: ['add_operation', 'record_expense'],
    };
  }
  if (expensesRising) {
    return {
      headline: 'Focus today: Record costs',
      body: 'Spending is going up. Record all costs to stay accurate.',
      why: 'So your numbers are correct.',
      chipKeys: ['record_expense', 'add_operation'],
    };
  }
  if (manyPending) {
    return {
      headline: 'Focus today: Review pending tasks',
      body: 'You have pending tasks. Review and confirm what’s done.',
      why: 'So nothing is missed.',
      chipKeys: ['add_operation', 'update_stage'],
    };
  }
  if (stageNearingEnd) {
    return {
      headline: 'Focus today: Prepare for next stage',
      body: 'Stage is almost done. Prepare for the next stage.',
      why: 'Smooth transition to the next phase.',
      chipKeys: ['update_stage', 'add_operation'],
    };
  }
  if (!hasActivityToday) {
    return {
      headline: 'Focus today: Record farm activity',
      body: 'No updates yet. Record what’s happening on the farm.',
      why: 'So your records stay up to date.',
      chipKeys: ['add_operation', 'record_expense'],
    };
  }

  // Default: recording + monitoring; environment-aware
  if (environment === 'greenhouse') {
    return {
      headline: 'Focus today: Keep records updated',
      body: 'Check humidity and temperature when you can. Record any work done.',
      why: 'So your records match the field.',
      chipKeys: ['add_operation', 'record_expense'],
    };
  }
  return {
    headline: 'Focus today: Keep field records updated',
    body: 'Check weather and field when you can. Record any work done.',
    why: 'So your records match the field.',
    chipKeys: ['add_operation', 'record_expense'],
  };
}
