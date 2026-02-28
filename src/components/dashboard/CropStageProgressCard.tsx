import React, { useEffect, useMemo, useState } from 'react';
import { Sprout, ChevronRight, Circle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toDate } from '@/lib/dateUtils';
import type { CropStage } from '@/types';
import type { ActivityLogDoc, ActivityLogStatus } from '@/services/activityLogService';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { CropProgressCard } from './CropProgressCard';
import { cn } from '@/lib/utils';

const RECENT_COUNT = 5;

function formatTimeAgo(date: Date | null, clientCreatedAt: number | null): string {
  const base = date ?? (clientCreatedAt ? new Date(clientCreatedAt) : null);
  if (!base) return 'Just now';
  const diffMs = Date.now() - base.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getStatusDot(status: ActivityLogStatus): { className: string; Icon: React.ComponentType<{ className?: string }> } {
  switch (status) {
    case 'success':
      return { className: 'text-emerald-500', Icon: CheckCircle2 };
    case 'warning':
      return { className: 'text-amber-500', Icon: AlertTriangle };
    case 'danger':
      return { className: 'text-red-500', Icon: AlertTriangle };
    default:
      return { className: 'text-slate-400', Icon: Circle };
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type StageLike = CropStage & {
  name?: string;
  status?: CropStage['status'] | 'active' | 'ongoing' | string;
};

interface StageDetails {
  stage: StageLike;
  stageName: string;
  start: Date;
  end: Date;
}

export interface CropStageProgressCardProps {
  projectName?: string | null;
  stages?: StageLike[];
  activeStageOverride?: StageLike | null;
  knowledgeDetection?: {
    cropType?: string | null;
    stageLabel: string;
    progressPercent: number;
    totalCycleDays?: number;
    daysSincePlanting?: number;
    stageDurationDays: number;
    daysIntoStage: number;
    daysRemainingToNextStage: number;
    estimatedNextStageDate?: Date | null;
    estimatedHarvestStartDate?: Date | null;
  } | null;
  /** Activity logs to show as Recent Updates below the progress card */
  recentActivityLogs?: ActivityLogDoc[] | null;
  /** Advisory summary to show when "Advisory" tab is selected */
  advisorySummary?: { headline: string; body: string; why: string } | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const startOfDay = (input: Date) =>
  new Date(input.getFullYear(), input.getMonth(), input.getDate());

const formatStageDate = (date: Date) =>
  date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });

const resolveCropNameForImage = (cropType?: string | null) =>
  String(cropType || '').trim() || 'tomatoes';

function getStageLabel(stage: StageLike, fallbackIndex: number) {
  return stage.stageName || stage.name || `Stage ${stage.stageIndex ?? fallbackIndex + 1}`;
}

function resolveCurrentStage(
  stages: StageLike[],
  activeStageOverride?: StageLike | null
): StageDetails | null {
  if (!stages.length && !activeStageOverride) {
    return null;
  }

  const today = startOfDay(new Date());
  const normalized = stages.map((stage, index) => {
    const start = toDate(stage.startDate);
    const end = toDate(stage.endDate);
    return {
      stage,
      stageName: getStageLabel(stage, index),
      start: start ? startOfDay(start) : null,
      end: end ? startOfDay(end) : null,
      stageOrder: stage.stageIndex ?? index,
      index,
    };
  });

  const override = activeStageOverride
    ? {
        stage: activeStageOverride,
        stageName: getStageLabel(activeStageOverride, 0),
        start: toDate(activeStageOverride.startDate),
        end: toDate(activeStageOverride.endDate),
      }
    : null;
  const overrideNormalized = override
    ? {
        stage: override.stage,
        stageName: override.stageName,
        start: override.start ? startOfDay(override.start) : null,
        end: override.end ? startOfDay(override.end) : null,
        stageOrder: override.stage.stageIndex ?? 0,
        index: 0,
      }
    : null;

  const activeByStatus = normalized.find(({ stage }) => {
    const status = String(stage.status || '').toLowerCase();
    return status === 'active';
  });

  const activeByDateRange = normalized.find(({ start, end }) => {
    if (!start || !end) return false;
    return start.getTime() <= today.getTime() && today.getTime() <= end.getTime();
  });

  const latestByStartDate = normalized.reduce<(typeof normalized)[number] | null>((latest, current) => {
    if (!current.start) return latest;
    if (!latest || !latest.start) return current;
    return current.start.getTime() > latest.start.getTime() ? current : latest;
  }, null);

  const sortedByOrder = [...normalized].sort((a, b) => a.stageOrder - b.stageOrder);
  const latestByOrder = sortedByOrder.length ? sortedByOrder[sortedByOrder.length - 1] : null;
  const chosen =
    overrideNormalized ??
    activeByStatus ??
    activeByDateRange ??
    latestByStartDate ??
    latestByOrder;

  if (!chosen) return null;

  const start = chosen.start ?? today;
  const endCandidate = chosen.end ?? chosen.start ?? today;
  const end = endCandidate.getTime() < start.getTime() ? start : endCandidate;

  return {
    stage: chosen.stage,
    stageName: chosen.stageName,
    start,
    end,
  };
}

const cardClasses =
  'relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4 transition-all after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent';

const MODAL_LIMIT = 15;

function RecentsListContent({ logs, compact = false }: { logs: ActivityLogDoc[]; compact?: boolean }) {
  const list = logs.slice(0, compact ? RECENT_COUNT : MODAL_LIMIT);
  if (list.length === 0) {
    return (
      <p className={compact ? 'text-[12px] text-muted-foreground/80 py-0.5' : 'text-sm text-muted-foreground py-4'}>
        No recent updates. Record tasks and operations to see them here.
      </p>
    );
  }
  return (
    <ul className={compact ? 'space-y-2' : 'space-y-1'}>
      {list.map((log) => {
        const { className: dotClass, Icon } = getStatusDot(log.status);
        const timeAgo = formatTimeAgo(log.createdAt, log.clientCreatedAt);
        const sub = [timeAgo, log.actorName ?? null].filter(Boolean).join(' · ');
        return (
          <li key={log.id} className={compact ? 'flex items-start gap-2.5 py-0.5' : 'flex items-start gap-2.5 py-3 border-b border-border/50 last:border-0'}>
            <span className={compact ? 'mt-1.5 shrink-0' : 'shrink-0 mt-0.5'}>
              <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', dotClass)} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={compact ? 'text-[12px] sm:text-sm text-foreground leading-snug' : 'text-sm text-foreground'}>{log.message}</p>
              <p className={compact ? 'text-[11px] text-muted-foreground/80 mt-0.5 truncate' : 'text-xs text-muted-foreground mt-0.5'}>{sub}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CropStageProgressCard({
  projectName,
  stages = [],
  activeStageOverride = null,
  knowledgeDetection = null,
  recentActivityLogs = null,
  advisorySummary = null,
}: CropStageProgressCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showRecents, setShowRecents] = useState(true);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => setIsMobile(!mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const drawerSide = isMobile ? 'bottom' : 'right';
  const stageDetails = useMemo(
    () => resolveCurrentStage(stages, activeStageOverride),
    [stages, activeStageOverride]
  );
  const totalDays = useMemo(() => {
    if (!stageDetails) return 1;
    const duration = Math.ceil((stageDetails.end.getTime() - stageDetails.start.getTime()) / MS_PER_DAY);
    return Math.max(1, Number.isFinite(duration) ? duration : 1);
  }, [stageDetails]);
  const dayNumber = useMemo(() => {
    if (!stageDetails) return 0;
    const today = startOfDay(new Date());
    const day = Math.ceil((today.getTime() - stageDetails.start.getTime()) / MS_PER_DAY) + 1;
    return clamp(Number.isFinite(day) ? day : 0, 1, totalDays);
  }, [stageDetails, totalDays]);
  const seasonProgressFromStages = useMemo(() => {
    const allStages = stages?.length ? stages : (activeStageOverride ? [activeStageOverride] : []);
    if (!allStages.length) return 0;
    const dates = allStages
      .flatMap((s) => [toDate(s.startDate), toDate(s.endDate)])
      .filter((d): d is Date => d != null);
    if (!dates.length) return 0;
    const cycleStart = new Date(Math.min(...dates.map((d) => d.getTime())));
    const cycleEnd = new Date(Math.max(...dates.map((d) => d.getTime())));
    const totalCycleDays = Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / MS_PER_DAY);
    if (totalCycleDays <= 0) return 0;
    const today = startOfDay(new Date());
    const daysIntoCycle = Math.ceil((today.getTime() - cycleStart.getTime()) / MS_PER_DAY);
    const pct = Math.round((daysIntoCycle / totalCycleDays) * 100);
    return clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
  }, [stages, activeStageOverride]);
  const progressPct = useMemo(() => {
    if (!stageDetails) return seasonProgressFromStages;
    const normalizedStatus = String(stageDetails.stage.status || '').toLowerCase();
    if (normalizedStatus === 'completed') return 100;
    if (normalizedStatus === 'pending') return seasonProgressFromStages;
    return seasonProgressFromStages;
  }, [stageDetails, seasonProgressFromStages]);

  if (knowledgeDetection) {
    const dayOf = Math.max(
      1,
      Math.round(knowledgeDetection.totalCycleDays || knowledgeDetection.stageDurationDays || 1),
    );
    const daysCompleted = clamp(Math.round(knowledgeDetection.daysSincePlanting || 0), 0, dayOf);
    const daysLeft = Math.max(
      0,
      Math.round(knowledgeDetection.daysRemainingToNextStage || 0),
    );
    const progressPct = clamp(Math.round(knowledgeDetection.progressPercent || 0), 0, 100);
    const estimatedHarvestStart = knowledgeDetection.estimatedHarvestStartDate
      ? formatStageDate(knowledgeDetection.estimatedHarvestStartDate)
      : '—';

    const hasDrawer = recentActivityLogs != null || advisorySummary != null;
    const progressCardClass = hasDrawer
      ? cn(cardClasses, '!rounded-t-lg !rounded-b-none !border-b-0 !shadow-none')
      : cardClasses;
    return (
      <div className={hasDrawer ? 'rounded-lg border border-border/50 bg-card/60 overflow-hidden' : undefined}>
        <CropProgressCard
          crop={resolveCropNameForImage(knowledgeDetection.cropType)}
          farmName={projectName}
          stage={knowledgeDetection.stageLabel}
          progress={progressPct}
          dayOf={dayOf}
          daysCompleted={daysCompleted}
          estimatedFinish={estimatedHarvestStart}
          daysLeft={daysLeft}
          primaryMetricLabel={`Day ${daysCompleted} of ${dayOf}`}
          primaryMetricDetail={`${daysCompleted} ${daysCompleted === 1 ? 'day' : 'days'} since planting`}
          secondaryMetricLabel={`Est. harvest start ${estimatedHarvestStart}`}
          secondaryMetricDetail={`${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to next stage`}
          className={hasDrawer ? progressCardClass : cardClasses}
        />
        {hasDrawer && (
          <div className="rounded-b-lg bg-card/60 backdrop-blur-sm px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-2.5">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="w-full rounded-lg border border-border/50 bg-background/80 py-2 px-3 text-[12px] font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                  Updates & Advisory
                </button>
              </SheetTrigger>
              <SheetContent side={drawerSide} draggable className={cn(
                  'w-full overflow-hidden flex flex-col',
                  drawerSide === 'right' ? 'sm:max-w-md rounded-l-lg' : 'max-h-[90vh] rounded-t-lg'
                )}>
                <SheetHeader>
                  <SheetTitle className="text-base font-semibold">Updates & Advisory</SheetTitle>
                </SheetHeader>
                <div className="flex gap-1.5 mt-4 mb-3">
                  <button
                    type="button"
                    onClick={() => setShowRecents(true)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      showRecents ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    Recents
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRecents(false)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      !showRecents ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    Advisory
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {showRecents ? (
                    recentActivityLogs ? (
                      <RecentsListContent logs={recentActivityLogs} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-4">No recent updates.</p>
                    )
                  ) : advisorySummary ? (
                    <div>
                      <p className="font-semibold text-foreground text-sm tracking-tight">{advisorySummary.headline}</p>
                      <p className="mt-1.5 text-sm text-foreground/85 leading-relaxed">{advisorySummary.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground/90">Why: {advisorySummary.why}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">No advisory.</p>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    );
  }

  const hasProject = Boolean(projectName && projectName.trim().length > 0);

  if (!hasProject) {
    return (
      <div className={cardClasses}>
        <div className="flex items-center gap-2">
          <Sprout className="h-4 w-4 text-primary" />
          <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Crop Stage Progress
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Select a project to see stage progress</p>
      </div>
    );
  }

  if (!stageDetails) {
    return (
      <div className={cardClasses}>
        <div className="flex items-center gap-2">
          <Sprout className="h-4 w-4 text-primary" />
          <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Crop Stage Progress
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">No crop stage set for this project yet</p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto w-fit p-0 text-xs"
        >
          Set stages
        </Button>
      </div>
    );
  }

  const normalizedStatus = String(stageDetails.stage.status || '').toLowerCase();
  const daysCompleted = normalizedStatus === 'completed' ? totalDays : normalizedStatus === 'pending' ? 0 : dayNumber;
  const daysLeft = clamp(totalDays - daysCompleted, 0, totalDays);

  const hasDrawer = recentActivityLogs != null || advisorySummary != null;
  const progressCardClass = hasDrawer
    ? cn(cardClasses, '!rounded-t-lg !rounded-b-none !border-b-0 !shadow-none')
    : cardClasses;
  return (
    <div className={hasDrawer ? 'rounded-lg border border-border/50 bg-card/60 overflow-hidden' : undefined}>
      <CropProgressCard
        crop={resolveCropNameForImage(stageDetails.stage.cropType)}
        farmName={projectName}
        stage={stageDetails.stageName}
        progress={progressPct}
        dayOf={totalDays}
        daysCompleted={daysCompleted}
        estimatedFinish={formatStageDate(stageDetails.end)}
        daysLeft={daysLeft}
        className={hasDrawer ? progressCardClass : cardClasses}
      />
      {hasDrawer && (
        <div className="rounded-b-lg bg-card/60 backdrop-blur-sm px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-2.5">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="w-full rounded-lg border border-border/50 bg-background/80 py-2 px-3 text-[12px] font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
              >
                <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                Updates & Advisory
              </button>
            </SheetTrigger>
            <SheetContent side={drawerSide} draggable className={cn(
                  'w-full overflow-hidden flex flex-col',
                  drawerSide === 'right' ? 'sm:max-w-md rounded-l-lg' : 'max-h-[90vh] rounded-t-lg'
                )}>
              <SheetHeader>
                <SheetTitle className="text-base font-semibold">Updates & Advisory</SheetTitle>
              </SheetHeader>
              <div className="flex gap-1.5 mt-4 mb-3">
                <button
                  type="button"
                  onClick={() => setShowRecents(true)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    showRecents ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Recents
                </button>
                <button
                  type="button"
                  onClick={() => setShowRecents(false)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    !showRecents ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  Advisory
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {showRecents ? (
                  recentActivityLogs ? (
                    <RecentsListContent logs={recentActivityLogs} />
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">No recent updates.</p>
                  )
                ) : advisorySummary ? (
                  <div>
                    <p className="font-semibold text-foreground text-sm tracking-tight">{advisorySummary.headline}</p>
                    <p className="mt-1.5 text-sm text-foreground/85 leading-relaxed">{advisorySummary.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground/90">Why: {advisorySummary.why}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No advisory.</p>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}
