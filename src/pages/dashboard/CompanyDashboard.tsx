import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { DollarSign, TrendingUp, Wallet, Calendar as CalendarIcon, HelpCircle } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { CropStageProgressCard } from '@/components/dashboard/CropStageProgressCard';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ProjectsTable } from '@/components/dashboard/ProjectsTable';
import {
  InventoryOverview,
  RecentTransactions,
  RecentTransactionItem,
  CropStageSection,
} from '@/components/dashboard/DashboardWidgets';
import { InventoryItem, CropStage } from '@/types';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Expense, Harvest, Project, Sale } from '@/types';
import type { CropType, EnvironmentType } from '@/types';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toDate } from '@/lib/dateUtils';
import { getSortTime, safeToDate } from '@/lib/safeTime';
import {
  getLegacyStartingStageIndex,
  getStageLabelForKey,
} from '@/lib/stageDetection';
import { detectStageForCrop } from '@/knowledge/stageDetection';
import { findCropKnowledgeByTypeKey, getEffectiveEnvironmentForCrop } from '@/knowledge/cropCatalog';
import { useCropCatalog } from '@/hooks/useCropCatalog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWorkCardsForProject } from '@/hooks/useWorkCards';
import type { OperationsWorkCard } from '@/types';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { NewOperationMenu } from '@/components/dashboard/NewOperationMenu';
import { Button } from '@/components/ui/button';
import { useTour } from '@/tour/TourProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { subscribeActivity, type ActivityLogDoc } from '@/services/activityLogService';
import { buildSmartAdvisoryCardSummary } from '@/utils/advisoryEngine';
import { cn } from '@/lib/utils';
import { useProjectBlocks } from '@/hooks/useProjectBlocks';
import { getCropTimeline } from '@/config/cropTimelines';
import { calculateDaysSince } from '@/utils/cropStages';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { NewFeatureModal } from '@/components/modals/NewFeatureModal';
import { shouldShowAppLockAnnouncement, markAppLockAnnouncementSeen } from '@/lib/featureFlags/featureAnnouncements';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCompanyCollectionFinancialsAggregate } from '@/services/harvestCollectionsService';

function isActivityToday(log: ActivityLogDoc): boolean {
  const d = log.createdAt ?? (log.clientCreatedAt ? new Date(log.clientCreatedAt) : null);
  if (!d) return false;
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

export function CompanyDashboard() {
  const { activeProject, setActiveProject } = useProject();
  const { user } = useAuth();
  const { canSee } = usePermissions();
  const { startTour } = useTour();
  const isMobile = useIsMobile();
  const { crops: cropCatalog } = useCropCatalog(user?.companyId);
  const [projectFilter, setProjectFilter] = useState<'all' | 'selected'>('selected');

  // Employee access: restrict projects and data to what this employee is allowed to see.
  const { hasProjectAccess, projectAccessIds } = useEmployeeAccess();

  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';
  const canLoadProjects = Boolean(isDeveloper || companyId);

  const { data: allProjects = [], isLoading: projectsLoading } = useCollection<Project>(
    'dashboard-projects',
    'projects',
    {
      enabled: canLoadProjects,
      companyScoped: true,
      companyId,
      isDeveloper,
    },
  );
  const { data: allExpenses = [] } = useCollection<Expense>('dashboard-expenses', 'expenses', {
    companyScoped: true,
    companyId,
    isDeveloper,
  });
  const { data: allHarvests = [] } = useCollection<Harvest>('dashboard-harvests', 'harvests', {
    companyScoped: true,
    companyId,
    isDeveloper,
  });
  const { data: allSales = [] } = useCollection<Sale>('dashboard-sales', 'sales', {
    companyScoped: true,
    companyId,
    isDeveloper,
  });
  const { data: allInventory = [] } = useCollection<InventoryItem>(
    'dashboard-inventory',
    'inventoryItems',
    { companyScoped: true, companyId, isDeveloper }
  );
  const { data: allStages = [] } = useCollection<CropStage>(
    'dashboard-stages',
    'projectStages',
    { companyScoped: true, companyId, isDeveloper }
  );
  const { data: projectWorkCards = [] } = useWorkCardsForProject(
    activeProject?.id ?? null,
    companyId || null
  );
  const { data: projectBlocks = [] } = useProjectBlocks(
    companyId,
    activeProject?.useBlocks ? activeProject?.id ?? null : null
  );
  const blocksSummary = useMemo(() => {
    if (!activeProject?.useBlocks || projectBlocks.length === 0) return null;
    const timeline = getCropTimeline(activeProject.cropTypeKey ?? activeProject.cropType);
    const totalDays = timeline?.totalDaysToHarvest ?? 90;
    let totalAcreage = 0;
    let weightedSum = 0;
    projectBlocks.forEach((b) => {
      const ac = Number(b.acreage) || 0;
      if (ac <= 0) return;
      const days = calculateDaysSince(b.plantingDate);
      const progress = Math.min(1, Math.max(0, days / totalDays));
      totalAcreage += ac;
      weightedSum += ac * progress;
    });
    if (totalAcreage <= 0) return { count: projectBlocks.length, weightedProgressPercent: 0 };
    return {
      count: projectBlocks.length,
      weightedProgressPercent: Math.round((weightedSum / totalAcreage) * 100),
    };
  }, [activeProject?.useBlocks, activeProject?.cropType, activeProject?.cropTypeKey, projectBlocks]);

  const [activityLogs, setActivityLogs] = useState<ActivityLogDoc[]>([]);
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = subscribeActivity(
      companyId,
      { limit: 15, projectId: activeProject?.id ?? undefined },
      setActivityLogs
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [companyId, activeProject?.id]);

  const companyProjects = useMemo(
    () => {
      const scoped = companyId ? allProjects.filter((p) => p.companyId === companyId) : allProjects;
      return scoped.filter((p) => hasProjectAccess(p.id));
    },
    [allProjects, companyId, hasProjectAccess]
  );

  const filteredExpenses = useMemo(() => {
    let filtered = companyId ? allExpenses.filter((e) => e.companyId === companyId) : allExpenses;
    filtered = filtered.filter((e) => !e.projectId || hasProjectAccess(e.projectId));
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((e) => e.projectId === activeProject.id);
    }
    return filtered;
  }, [allExpenses, companyId, activeProject, projectFilter, hasProjectAccess]);

  const filteredHarvests = useMemo(() => {
    let filtered = companyId ? allHarvests.filter((h) => h.companyId === companyId) : allHarvests;
    filtered = filtered.filter((h) => !h.projectId || hasProjectAccess(h.projectId));
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((h) => h.projectId === activeProject.id);
    }
    return filtered;
  }, [allHarvests, companyId, activeProject, projectFilter, hasProjectAccess]);

  const filteredSales = useMemo(() => {
    let filtered = companyId ? allSales.filter((s) => s.companyId === companyId) : allSales;
    filtered = filtered.filter((s) => !s.projectId || hasProjectAccess(s.projectId));
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((s) => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allSales, companyId, activeProject, projectFilter, hasProjectAccess]);

  const filteredProjects = useMemo(() => {
    if (projectFilter === 'selected' && activeProject) return [activeProject];
    return companyProjects;
  }, [companyProjects, activeProject, projectFilter]);

  const filteredInventory = useMemo(() => {
    const scoped = companyId
      ? allInventory.filter((i) => i.companyId === companyId)
      : allInventory;
    return scoped.filter((i) => !i.projectId || hasProjectAccess(i.projectId));
  }, [allInventory, companyId, hasProjectAccess]);

  const filteredStages = useMemo(() => {
    let filtered = companyId ? allStages.filter((s) => s.companyId === companyId) : allStages;
    filtered = filtered.filter((s) => !s.projectId || hasProjectAccess(s.projectId));
    if (projectFilter === 'selected' && activeProject) {
      filtered = filtered.filter((s) => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allStages, companyId, activeProject, projectFilter, hasProjectAccess]);

  const activeProjectStages = useMemo(() => {
    if (!activeProject) return [];
    return allStages.filter(
      (s) => s.companyId === companyId && s.projectId === activeProject.id && hasProjectAccess(s.projectId)
    );
  }, [allStages, companyId, activeProject, hasProjectAccess]);
  const activeProjectKnowledge = useMemo(
    () => findCropKnowledgeByTypeKey(cropCatalog, activeProject?.cropTypeKey || activeProject?.cropType),
    [cropCatalog, activeProject?.cropType, activeProject?.cropTypeKey],
  );
  const activeProjectEnvironment = useMemo(
    () =>
      getEffectiveEnvironmentForCrop(
        activeProjectKnowledge,
        (activeProject?.environmentType as EnvironmentType | undefined) ?? 'open_field',
      ),
    [activeProjectKnowledge, activeProject?.environmentType],
  );
  const activeProjectDetectedStage = useMemo(
    () => detectStageForCrop(activeProjectKnowledge, activeProject?.plantingDate, activeProjectEnvironment),
    [activeProjectKnowledge, activeProject?.plantingDate, activeProjectEnvironment],
  );
  const activeProjectStageLabel = useMemo(() => {
    if (activeProjectDetectedStage) return activeProjectDetectedStage.stage.label;
    if (!activeProject) return null;
    return (
      getStageLabelForKey(
        activeProject.cropType,
        activeProject.currentStage || activeProject.stageSelected,
      ) ?? null
    );
  }, [activeProject, activeProjectDetectedStage]);
  const activeProjectDaysRemainingToNextStage = useMemo(() => {
    if (!activeProjectDetectedStage) return null;
    return Math.max(0, activeProjectDetectedStage.daysRemainingToNextStage);
  }, [activeProjectDetectedStage]);
  const activeProjectEstimatedHarvestStartDate = useMemo(() => {
    if (!activeProject || !activeProjectKnowledge) return null;
    const plantingDate = toDate(activeProject.plantingDate);
    if (!plantingDate) return null;

    const harvestStage = activeProjectKnowledge.stages.find(
      (stage) =>
        String(stage.key || '').toLowerCase().includes('harvest') ||
        String(stage.label || '').toLowerCase().includes('harvest'),
    );
    if (!harvestStage) return null;

    const environmentAdjustment = activeProjectDetectedStage?.environmentDayAdjustment ?? 0;
    const harvestStartOffset = Math.max(0, harvestStage.baseDayStart + environmentAdjustment);
    const harvestStart = new Date(plantingDate);
    harvestStart.setDate(harvestStart.getDate() + harvestStartOffset);
    return harvestStart;
  }, [activeProject, activeProjectKnowledge, activeProjectDetectedStage?.environmentDayAdjustment]);
  const activeProjectKnowledgeDetection = useMemo(() => {
    if (!activeProjectDetectedStage || !activeProject) return null;
    const stageDurationDays = Math.max(
      1,
      activeProjectDetectedStage.stage.baseDayEnd - activeProjectDetectedStage.stage.baseDayStart + 1,
    );
    const estimatedNextStageDate =
      activeProjectDaysRemainingToNextStage == null
        ? null
        : (() => {
            const next = new Date();
            next.setDate(next.getDate() + activeProjectDaysRemainingToNextStage);
            return next;
          })();

    return {
      cropType: activeProject.cropType,
      stageLabel: activeProjectDetectedStage.stage.label,
      progressPercent: activeProjectDetectedStage.seasonProgressPercent,
      totalCycleDays: activeProjectKnowledge?.baseCycleDays ?? stageDurationDays,
      daysSincePlanting: activeProjectDetectedStage.daysSincePlanting,
      stageDurationDays,
      daysIntoStage: activeProjectDetectedStage.daysIntoStage,
      daysRemainingToNextStage: activeProjectDetectedStage.daysRemainingToNextStage,
      estimatedNextStageDate,
      estimatedHarvestStartDate: activeProjectEstimatedHarvestStartDate,
    };
  }, [
    activeProjectDetectedStage,
    activeProject,
    activeProjectDaysRemainingToNextStage,
    activeProjectKnowledge?.baseCycleDays,
    activeProjectEstimatedHarvestStartDate,
  ]);
  const activeStageOverride = useMemo<CropStage | null>(() => {
    if (!activeProject || !activeProjectStageLabel || activeProjectDetectedStage) return null;
    return {
      id: `project-stage-override-${activeProject.id}`,
      projectId: activeProject.id,
      companyId: activeProject.companyId,
      cropType: activeProject.cropType,
      stageName: activeProjectStageLabel,
      stageIndex: getLegacyStartingStageIndex(
        activeProject.cropType,
        activeProject.currentStage || activeProject.stageSelected,
        activeProject.startingStageIndex ?? 0,
      ),
      status: 'in-progress',
    };
  }, [activeProject, activeProjectStageLabel, activeProjectDetectedStage]);

  const activeProjectHarvests = useMemo(() => {
    if (!activeProject) return [];
    return allHarvests.filter(
      (h) =>
        h.projectId === activeProject.id &&
        (companyId ? h.companyId === companyId : true)
    );
  }, [allHarvests, activeProject, companyId]);

  const isHarvestActive = useMemo(() => {
    if (!activeProject || activeProjectHarvests.length === 0) return false;

    const harvestsWithOptionalStatus = activeProjectHarvests as Array<Harvest & { status?: string }>;
    const hasStatusField = harvestsWithOptionalStatus.some(
      (harvest) => typeof harvest.status === 'string' && harvest.status.length > 0
    );

    if (hasStatusField) {
      return harvestsWithOptionalStatus.some((harvest) => {
        const normalizedStatus = harvest.status?.toLowerCase();
        return normalizedStatus === 'active' || normalizedStatus === 'ongoing';
      });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const hasHarvestInLastSevenDays = activeProjectHarvests.some((harvest) => {
      const harvestDate = toDate(harvest.date);
      return harvestDate ? harvestDate.getTime() >= sevenDaysAgo.getTime() : false;
    });

    if (hasHarvestInLastSevenDays) return true;

    const hasHarvestInCurrentMonth = activeProjectHarvests.some((harvest) => {
      const harvestDate = toDate(harvest.date);
      if (!harvestDate) return false;
      const time = harvestDate.getTime();
      return time >= currentMonthStart.getTime() && time <= currentMonthEnd.getTime();
    });

    return hasHarvestInCurrentMonth;
  }, [activeProject, activeProjectHarvests]);

  const advisoryTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const plannedOnly = (projectWorkCards as OperationsWorkCard[]).filter(
      (c) => c?.status === 'planned' || c?.status === 'submitted'
    );
    const withDate = plannedOnly
      .map((c) => ({
        card: c,
        due: toDate((c.planned as { date?: unknown })?.date),
      }))
      .filter(({ due }) => due != null) as { card: OperationsWorkCard; due: Date }[];
    const overdue = withDate
      .filter(({ due }) => due.getTime() < today.getTime())
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    const dueSoon = withDate
      .filter(({ due }) => due.getTime() >= today.getTime() && due.getTime() <= weekEnd.getTime())
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    const allUpcoming = withDate
      .filter(({ due }) => due.getTime() >= today.getTime())
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    return {
      overdue: overdue.map(({ card, due }) => ({
        id: card.id,
        title: card.workTitle || 'Task',
        dueDate: due,
        isOverdue: true,
      })),
      dueSoon: dueSoon.map(({ card, due }) => ({
        id: card.id,
        title: card.workTitle || 'Task',
        dueDate: due,
        isOverdue: false,
      })),
      next: allUpcoming[0]
        ? {
            id: allUpcoming[0].card.id,
            title: allUpcoming[0].card.workTitle || 'Task',
            dueDate: allUpcoming[0].due,
            isOverdue: false,
          }
        : null,
    };
  }, [projectWorkCards]);

  const recentExpensesTrend = useMemo<'high' | 'normal' | 'low' | null>(() => {
    const now = new Date();
    const last7End = new Date(now);
    last7End.setHours(23, 59, 59, 999);
    const last7Start = new Date(now);
    last7Start.setDate(last7Start.getDate() - 7);
    last7Start.setHours(0, 0, 0, 0);
    const prev7End = new Date(last7Start);
    prev7End.setMilliseconds(-1);
    const prev7Start = new Date(prev7End);
    prev7Start.setDate(prev7Start.getDate() - 7);
    const last7 = filteredExpenses
      .filter((e) => {
        const t = toDate(e.date)?.getTime();
        return t != null && t >= last7Start.getTime() && t <= last7End.getTime();
      })
      .reduce((s, e) => s + e.amount, 0);
    const prev7 = filteredExpenses
      .filter((e) => {
        const t = toDate(e.date)?.getTime();
        return t != null && t >= prev7Start.getTime() && t <= prev7End.getTime();
      })
      .reduce((s, e) => s + e.amount, 0);
    if (prev7 <= 0) return last7 > 0 ? 'high' : null;
    if (last7 > prev7 * 1.2) return 'high';
    if (last7 < prev7 * 0.8) return 'low';
    return 'normal';
  }, [filteredExpenses]);

  const { data: fbTotals } = useQuery({
    queryKey: ['dashboardFinancialTotals', companyId],
    queryFn: () => getCompanyCollectionFinancialsAggregate(companyId ?? ''),
    enabled: Boolean(companyId),
  });

  const firestoreExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const firestoreSales = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalRevenue = firestoreSales + (fbTotals?.totalRevenue ?? 0);
  const totalExpenses = firestoreExpenses + (fbTotals?.totalExpenses ?? 0);
  const profitLoss = totalRevenue - totalExpenses;
  const netBalance = profitLoss;
  const totalSales = totalRevenue;
  const totalBudget = filteredProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const remainingBudget = totalBudget - totalExpenses;

  useEffect(() => {
    if (import.meta.env.DEV && (fbTotals?.totalRevenue !== undefined || fbTotals?.totalExpenses !== undefined)) {
      console.log('[Dashboard Financial Totals]', {
        totalRevenue,
        totalExpenses,
        profitLoss,
        fbRevenue: fbTotals?.totalRevenue,
        fbExpenses: fbTotals?.totalExpenses,
      });
    }
  }, [fbTotals?.totalRevenue, fbTotals?.totalExpenses, totalRevenue, totalExpenses, profitLoss]);

  const recentTransactions = useMemo((): RecentTransactionItem[] => {
    const items: RecentTransactionItem[] = [];
    filteredSales.forEach((s) => {
      const d = safeToDate(s.date);
      items.push({
        id: `sale-${s.id}`,
        type: 'sale',
        date: d ?? new Date(0),
        label: s.buyerName || 'Sale',
        amount: s.totalAmount,
        status: s.status,
      });
    });
    filteredExpenses.forEach((e) => {
      const d = safeToDate(e.date);
      items.push({
        id: `expense-${e.id}`,
        type: 'expense',
        date: d ?? new Date(0),
        label: e.description || e.category || 'Expense',
        amount: e.amount,
      });
    });
    return items.sort((a, b) => getSortTime(b.date) - getSortTime(a.date)).slice(0, 15);
  }, [filteredSales, filteredExpenses]);

  const expensesByCategory = useMemo(() => {
    const acc = filteredExpenses.reduce<Record<string, number>>((a, e) => {
      a[e.category] = (a[e.category] || 0) + e.amount;
      return a;
    }, {});
    return Object.keys(acc).length
      ? Object.entries(acc).map(([category, amount]) => ({ category, amount }))
      : [];
  }, [filteredExpenses]);

  const activityChartData = useMemo(() => {
    const months: { month: string; expenses: number; sales: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const expenses = filteredExpenses
        .filter((e) => {
          const t = toDate(e.date)?.getTime();
          return t != null && t >= monthStart && t <= monthEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      const sales = filteredSales
        .filter((s) => {
          const t = toDate(s.date)?.getTime();
          return t != null && t >= monthStart && t <= monthEnd;
        })
        .reduce((sum, s) => sum + s.totalAmount, 0);
      months.push({ month: monthKey, expenses, sales });
    }
    return months;
  }, [filteredExpenses, filteredSales]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || null;

  const { plan: subscriptionPlan, isExpired: subscriptionExpired, isTrial } = useSubscriptionStatus();

  const harvestValueTracked = useMemo(() => {
    return filteredHarvests.reduce((sum, h) => {
      // Use farmTotalPrice when available; otherwise ignore.
      const anyHarvest = h as Harvest & { farmTotalPrice?: number };
      return sum + (anyHarvest.farmTotalPrice ?? 0);
    }, 0);
  }, [filteredHarvests]);

  const totalFarmValue = totalSales + harvestValueTracked;

  const handleProjectChange = useCallback(
    (value: string) => {
      if (value === 'all') {
        setProjectFilter('all');
        setActiveProject(null);
      } else {
        const proj = companyProjects.find((p) => p.id === value);
        if (proj) {
          setActiveProject(proj);
          setProjectFilter('selected');
        }
      }
    },
    [companyProjects, setActiveProject]
  );

  const advisorySummary = useMemo(() => {
    const hasActivityToday = activityLogs.some(isActivityToday);
    return buildSmartAdvisoryCardSummary({
      hasActivityToday,
      pendingTasksCount: advisoryTasks.overdue.length + advisoryTasks.dueSoon.length,
      stageNearingEnd:
        activeProjectDaysRemainingToNextStage != null &&
        activeProjectDaysRemainingToNextStage <= 7,
      expensesRising: recentExpensesTrend === 'high',
      harvestActive: isHarvestActive,
      environment:
        activeProjectEnvironment === 'greenhouse' ? 'greenhouse' : 'openField',
    });
  }, [
    activityLogs,
    advisoryTasks.overdue.length,
    advisoryTasks.dueSoon.length,
    activeProjectDaysRemainingToNextStage,
    recentExpensesTrend,
    isHarvestActive,
    activeProjectEnvironment,
  ]);

  const navigate = useNavigate();
  const subscriptionStatus = useSubscriptionStatus();
  const [showAppLockModal, setShowAppLockModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (subscriptionStatus.isLoading) return;
    const should = shouldShowAppLockAnnouncement(user, { isDuringOnboarding: false });
    if (should) {
      setShowAppLockModal(true);
    }
  }, [subscriptionStatus.isLoading, user]);

  const isProEligible =
    subscriptionStatus.plan === 'pro' &&
    (subscriptionStatus.status === 'active' ||
      subscriptionStatus.status === 'grace' ||
      subscriptionStatus.isOverrideActive);

  const handleCloseAppLockModal = (open: boolean) => {
    setShowAppLockModal(open);
    if (!open) {
      markAppLockAnnouncementSeen();
    }
  };

  const handleAppLockPrimary = () => {
    markAppLockAnnouncementSeen();
    if (isProEligible) {
      navigate('/settings', { state: { focusAppLock: true, feature: 'app-lock' } });
    } else {
      navigate('/billing?feature=app-lock');
    }
    setShowAppLockModal(false);
  };

  if (projectsLoading) {
    return <DashboardSkeleton />;
  }

  const projectSelectorValue =
    projectFilter === 'selected' && activeProject ? activeProject.id : 'all';

  const getCropIcon = (cropType?: CropType | null) => {
    const icons: Record<string, string> = {
      tomatoes: '🍅',
      'french-beans': '🌱',
      capsicum: '🫑',
      maize: '🌽',
      watermelons: '🍉',
      rice: '🍚',
    };
    return cropType ? icons[cropType] ?? '🌾' : '🌾';
  };

  const showCropStageCard = canSee('dashboard', 'cards.cropStage');
  const showRevenueCard = canSee('dashboard', 'cards.revenue');
  const showExpensesCard = canSee('dashboard', 'cards.expenses');
  const showProfitLossCard = canSee('dashboard', 'cards.profitLoss');
  const showBudgetCard = canSee('dashboard', 'cards.budget');
  const showInsightCard = subscriptionPlan === 'trial';

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    console.log('[Dashboard] visible cards', {
      uid: user.id,
      cropStage: showCropStageCard,
      revenue: showRevenueCard,
      expenses: showExpensesCard,
      profitLoss: showProfitLossCard,
      budget: showBudgetCard,
      projectAccessIds,
    });
  }

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    console.log('[Dashboard] visible cards', {
      uid: user.id,
      cropStage: showCropStageCard,
      revenue: showRevenueCard,
      expenses: showExpensesCard,
      profitLoss: showProfitLossCard,
      budget: showBudgetCard,
      projectAccessIds,
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Unified header: Greeting + Project selector + Quick Access (desktop & mobile) */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <DashboardGreeting firstName={firstName} />
        <div className="flex w-full items-center justify-between gap-2 sm:gap-3 md:ml-auto md:w-auto md:flex-nowrap md:justify-end">
          <Select value={projectSelectorValue} onValueChange={handleProjectChange}>
            <SelectTrigger
              data-tour="dashboard-project-selector"
              className="h-9 w-[112px] shrink-0 sm:w-[150px] lg:w-[180px] rounded-md border border-border/50 bg-card/80 text-sm"
            >
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent className="rounded-md">
              <SelectItem value="all">All Projects</SelectItem>
              {companyProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span className="text-base" aria-hidden>{getCropIcon(p.cropType)}</span>
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NewOperationMenu variant={isMobile ? 'mobile' : 'default'} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 shrink-0 rounded-md px-3"
            onClick={startTour}
            data-tour="dashboard-take-tour"
          >
            <HelpCircle className="h-4 w-4 lg:mr-1.5" />
            <span className="hidden lg:inline">Take a Tour</span>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="space-y-3" data-tour="dashboard-stats">
        {!isHarvestActive ? (
          <div
            className={cn(
              'grid grid-cols-1 gap-3 items-stretch',
              (showExpensesCard || showRevenueCard) && 'md:grid-cols-2',
            )}
          >
            {showCropStageCard ? (
              <div data-tour="crop-stage-progress" className="min-w-0 space-y-1">
                {blocksSummary != null && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{blocksSummary.count} Blocks Active</span>
                    <span>·</span>
                    <span>{blocksSummary.weightedProgressPercent}% season progress</span>
                  </div>
                )}
                <CropStageProgressCard
                  projectName={activeProject?.name}
                  stages={activeProjectStages}
                  activeStageOverride={activeStageOverride}
                  knowledgeDetection={activeProjectKnowledgeDetection}
                  recentActivityLogs={activityLogs}
                  advisorySummary={advisorySummary}
                />
              </div>
            ) : showRevenueCard ? (
              <StatCard
                title="Total Revenue"
                value={`KES ${totalSales.toLocaleString()}`}
                change={15.3}
                changeLabel="vs last month"
                icon={<TrendingUp className="h-4 w-4" />}
                variant="gold"
                compact
              />
            ) : showExpensesCard ? (
              <div data-tour="expenses-summary-card">
                <StatCard
                  title="Total Expenses"
                  value={`KES ${totalExpenses.toLocaleString()}`}
                  change={12.5}
                  changeLabel="vs last month"
                  icon={<DollarSign className="h-4 w-4" />}
                  variant="default"
                  compact
                />
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4 text-sm text-muted-foreground">
                No dashboard cards enabled for your account.
              </div>
            )}

            {(showExpensesCard || showRevenueCard) && (
              <div className="grid grid-cols-1 gap-3 md:h-full md:grid-rows-2">
                {showRevenueCard && (
                  <div data-tour="revenue-summary-card" className={cn('h-full', showExpensesCard ? 'md:row-start-1' : '')}>
                    <StatCard
                      title="Total Revenue"
                      value={`KES ${totalSales.toLocaleString()}`}
                      change={15.3}
                      changeLabel="vs last month"
                      icon={<TrendingUp className="h-4 w-4" />}
                      variant="gold"
                      compact
                    />
                  </div>
                )}
                {showExpensesCard && (
                  <div data-tour="expenses-summary-card" className="h-full">
                    <StatCard
                      title="Total Expenses"
                      value={`KES ${totalExpenses.toLocaleString()}`}
                      change={12.5}
                      changeLabel="vs last month"
                      icon={<DollarSign className="h-4 w-4" />}
                      variant="default"
                      compact
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'grid grid-cols-1 gap-3',
              showRevenueCard && showExpensesCard && 'md:grid-cols-2',
            )}
          >
            {showRevenueCard && (
              <StatCard
                title="Total Revenue"
                value={`KES ${totalSales.toLocaleString()}`}
                change={15.3}
                changeLabel="Harvest revenue (current cycle)"
                icon={<TrendingUp className="h-4 w-4" />}
                variant="gold"
                compact
              />
            )}
            {showExpensesCard && (
              <div data-tour="expenses-summary-card">
                <StatCard
                  title="Total Expenses"
                  value={`KES ${totalExpenses.toLocaleString()}`}
                  change={12.5}
                  changeLabel="vs last month"
                  icon={<DollarSign className="h-4 w-4" />}
                  variant="default"
                  compact
                />
              </div>
            )}
            {!showRevenueCard && !showExpensesCard && (
              <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4 text-sm text-muted-foreground">
                No dashboard cards enabled for your account.
              </div>
            )}
          </div>
        )}
        {(showProfitLossCard || showBudgetCard) && (
          <div
            className={cn(
              'grid gap-3',
              showProfitLossCard && showBudgetCard ? 'grid-cols-2' : 'grid-cols-1',
            )}
          >
            {showProfitLossCard && (
              <div data-tour="profit-loss-card">
                <StatCard
                  title="Profit and Loss"
                  value={`KES ${netBalance.toLocaleString()}`}
                  change={netBalance >= 0 ? 22.1 : -5.2}
                  changeLabel="vs last month"
                  icon={<Wallet className="h-4 w-4" />}
                  variant={netBalance >= 0 ? 'primary' : 'default'}
                  compact
                />
              </div>
            )}
            {showBudgetCard && (
              <StatCard
                title="Remaining Budget"
                value={`KES ${remainingBudget.toLocaleString()}`}
                change={undefined}
                changeLabel={`of KES ${totalBudget.toLocaleString()}`}
                icon={<CalendarIcon className="h-4 w-4" />}
                variant={remainingBudget >= 0 ? 'primary' : 'default'}
                compact
              />
            )}
          </div>
        )}
      </div>

      {showInsightCard && (
        <div className="fv-card border-fv-gold-soft/80 bg-fv-gold-soft/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                FarmVault Insight
              </h3>
              <p className="mt-1 text-sm text-foreground">
                This season you have tracked{' '}
                <span className="font-semibold">
                  KES {totalFarmValue.toLocaleString()}
                </span>{' '}
                in farm value.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {subscriptionExpired
                  ? 'Your farm data is worth protecting. Upgrade to continue.'
                  : 'Proper tracking prevents losses and improves profit.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ActivityChart data={activityChartData} />
        <ExpensesPieChart data={expensesByCategory} />
      </div>

      {/* Bottom Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CropStageSection stages={activeProject ? activeProjectStages : filteredStages} />
        <div data-tour="inventory-overview">
          <InventoryOverview inventoryItems={filteredInventory} />
        </div>
        <div data-tour="recent-transactions">
          <RecentTransactions transactions={recentTransactions} />
        </div>
      </div>

      {/* Projects Table */}
      <ProjectsTable projects={filteredProjects} compact />

      <NewFeatureModal
        open={showAppLockModal}
        onOpenChange={handleCloseAppLockModal}
        isProEligible={isProEligible}
        onPrimary={handleAppLockPrimary}
      />
    </div>
  );
}
