import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { DollarSign, TrendingUp, Wallet, Calendar as CalendarIcon, HelpCircle, AlertTriangle, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  CropStageProgressCard,
  type FarmProgressDashboardFilter,
} from '@/components/dashboard/CropStageProgressCard';
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
import { cropTypeKeyEmoji } from '@/lib/cropEmoji';
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
import {
  subscribeActivity,
  mapSupabaseActivityToActivityLogDoc,
  type ActivityLogDoc,
} from '@/services/activityLogService';
import { listActivityLogs } from '@/services/employeeAccessService';
import { buildSmartAdvisoryCardSummary } from '@/utils/advisoryEngine';
import { cn } from '@/lib/utils';
import { useProjectBlocks } from '@/hooks/useProjectBlocks';
import { getCropTimeline } from '@/config/cropTimelines';
import { calculateDaysSince } from '@/utils/cropStages';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { NewFeatureModal } from '@/components/modals/NewFeatureModal';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { shouldShowAppLockAnnouncement, markAppLockAnnouncementSeen } from '@/lib/featureFlags/featureAnnouncements';
import { useNavigate } from 'react-router-dom';
import { listAdminAlerts, type StoredAdminAlert } from '@/services/adminAlertService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCompanyCollectionFinancialsAggregate } from '@/services/harvestCollectionsService';
import { getFinanceExpenses, type ExpenseLike } from '@/services/financeExpenseService';
import { listInventoryStock, type InventoryStockRow } from '@/services/inventoryReadModelService';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  buildCropStageCardPropsForProject,
  buildFarmProgressRowForProject,
  projectFarmLifecycle,
} from '@/lib/farmProgressFromProject';
import { useCompanyProjectStages } from '@/hooks/useCompanyProjectStages';
import { isProjectClosed } from '@/lib/projectClosed';
import { FeatureGate } from '@/components/subscription';

function isActivityToday(log: ActivityLogDoc): boolean {
  const d = log.createdAt ?? (log.clientCreatedAt ? new Date(log.clientCreatedAt) : null);
  if (!d) return false;
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

export function CompanyDashboard() {
  const queryClient = useQueryClient();
  const {
    activeProject,
    setActiveProject,
    projects: supabaseProjects,
    isLoadingProjects,
    projectsFetchError,
  } = useProject();
  const {
    user,
    authReady,
    hasClerkSession,
    tenantSessionTrust,
    companyDataQueriesEnabled,
    syncTenantCompanyFromServer,
    refreshAuthState,
  } = useAuth();
  const { canSee, can } = usePermissions();
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';
  const queryCompanyId = companyDataQueriesEnabled ? companyId : null;
  const canLoadProjects = companyDataQueriesEnabled && Boolean(isDeveloper || companyId);
  const [welcomeWizardOpen, setWelcomeWizardOpen] = useState(false);
  const [tenantRecoveryBusy, setTenantRecoveryBusy] = useState(false);
  /** When navbar is “All Projects”, clicking a row in Your Farm Progress scopes the four financial stat cards to this project (toggle off by clicking again or Show All). */
  const [dashboardFocusProjectId, setDashboardFocusProjectId] = useState<string | null>(null);
  const [farmProgressDashboardFilter, setFarmProgressDashboardFilter] =
    useState<FarmProgressDashboardFilter>('all');
  const { startTour } = useTour();
  const isMobile = useIsMobile();
  const { crops: cropCatalog } = useCropCatalog(queryCompanyId ?? undefined);

  // Employee access: restrict projects and data to what this employee is allowed to see.
  const { hasProjectAccess, projectAccessIds } = useEmployeeAccess();

  useEffect(() => {
    if (!companyId) return;
    captureEvent(AnalyticsEvents.DASHBOARD_VIEWED, {
      company_id: companyId,
      module_name: 'dashboard',
      route_path: '/dashboard',
    });
  }, [companyId]);

  useEffect(() => {
    if (activeProject) setDashboardFocusProjectId(null);
  }, [activeProject]);

  const handleFarmProgressDashboardFocusToggle = useCallback((projectId: string) => {
    setDashboardFocusProjectId((prev) => (prev === projectId ? null : projectId));
  }, []);

  const { data: firestoreProjects = [], isLoading: firestoreProjectsLoading } = useCollection<Project>(
    'dashboard-projects',
    'projects',
    {
      enabled: canLoadProjects,
      companyScoped: true,
      companyId: queryCompanyId,
      isDeveloper,
    },
  );

  const mergedProjects = useMemo(() => {
    const m = new Map<string, Project>();
    const scopeId = queryCompanyId ?? companyId;
    for (const p of firestoreProjects) {
      if (!scopeId || p.companyId === scopeId) m.set(p.id, p);
    }
    for (const p of supabaseProjects) {
      if (p.companyId === scopeId) m.set(p.id, p);
    }
    return Array.from(m.values());
  }, [firestoreProjects, supabaseProjects, companyId, queryCompanyId]);

  const projectsLoading =
    isLoadingProjects ||
    firestoreProjectsLoading ||
    (Boolean(companyId && hasClerkSession && !authReady));
  // Expenses from Supabase (canonical source)
  const {
    data: allExpensesSupa = [],
    isLoading: expensesSupaLoading,
    isError: expensesSupaError,
  } = useQuery({
    queryKey: ['dashboard-expenses-supa', queryCompanyId ?? ''],
    queryFn: () => getFinanceExpenses(queryCompanyId ?? ''),
    enabled: Boolean(queryCompanyId),
  });
  // Map to shape compatible with existing dashboard computations
  const allExpenses = useMemo(() =>
    allExpensesSupa.map((e) => ({
      ...e,
      id: e.id,
      companyId: e.companyId,
      projectId: e.projectId ?? '',
      description: e.description,
      amount: e.amount,
      category: e.category as any,
      date: e.date,
    })) as Expense[],
  [allExpensesSupa]);
  const { data: allHarvests = [] } = useCollection<Harvest>('dashboard-harvests', 'harvests', {
    companyScoped: true,
    companyId: queryCompanyId,
    isDeveloper,
  });
  const { data: allSales = [] } = useCollection<Sale>('dashboard-sales', 'sales', {
    companyScoped: true,
    companyId: queryCompanyId,
    isDeveloper,
  });
  // Inventory from Supabase
  const { data: inventoryStockRows = [] } = useQuery({
    queryKey: ['dashboard-inventory-supa', queryCompanyId ?? ''],
    queryFn: () => listInventoryStock({ companyId: queryCompanyId! }),
    enabled: Boolean(queryCompanyId),
  });
  // Map InventoryStockRow to InventoryItem shape for dashboard widgets
  const allInventory = useMemo(() =>
    inventoryStockRows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      category: (row.category_name ?? row.category ?? 'other') as any,
      quantity: row.current_stock ?? 0,
      unit: row.unit,
      pricePerUnit: row.average_cost ?? 0,
    })) as InventoryItem[],
  [inventoryStockRows]);
  const { data: allStages = [] } = useCompanyProjectStages(queryCompanyId);
  const { data: projectWorkCards = [] } = useWorkCardsForProject(
    activeProject?.id ?? null,
    queryCompanyId || null
  );
  const { data: projectBlocks = [] } = useProjectBlocks(
    queryCompanyId,
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
    if (!queryCompanyId) return;
    const unsubscribe = subscribeActivity(
      queryCompanyId,
      { limit: 15, projectId: activeProject?.id ?? undefined },
      setActivityLogs
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [queryCompanyId, activeProject?.id]);

  const { data: sqlActivityRows = [] } = useQuery({
    queryKey: ['company-activity-logs', queryCompanyId ?? ''],
    queryFn: () => listActivityLogs({ companyId: queryCompanyId!, limit: 20 }),
    enabled: Boolean(queryCompanyId),
    staleTime: 15_000,
  });

  const mergedActivityLogs = useMemo(() => {
    const fromSql = sqlActivityRows.map(mapSupabaseActivityToActivityLogDoc);
    const combined = [...fromSql, ...activityLogs];
    combined.sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? (typeof a.clientCreatedAt === 'number' ? a.clientCreatedAt : 0);
      const tb = b.createdAt?.getTime() ?? (typeof b.clientCreatedAt === 'number' ? b.clientCreatedAt : 0);
      return tb - ta;
    });
    const seen = new Set<string>();
    const deduped: ActivityLogDoc[] = [];
    for (const row of combined) {
      const t =
        row.createdAt?.getTime() ?? (typeof row.clientCreatedAt === 'number' ? row.clientCreatedAt : 0);
      const key = `${row.message}-${t}-${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
      if (deduped.length >= 15) break;
    }
    return deduped;
  }, [sqlActivityRows, activityLogs]);

  // Fetch admin alerts for the unified Recent Activities feed
  const [adminAlerts, setAdminAlerts] = useState<StoredAdminAlert[]>([]);
  useEffect(() => {
    if (!queryCompanyId) return;
    let cancelled = false;
    listAdminAlerts(queryCompanyId, 15).then((list) => {
      if (!cancelled) setAdminAlerts(list);
    });
    return () => { cancelled = true; };
  }, [queryCompanyId]);

  const companyProjects = useMemo(
    () => {
      const scoped = companyId ? mergedProjects.filter((p) => p.companyId === companyId) : mergedProjects;
      return scoped.filter((p) => hasProjectAccess(p.id));
    },
    [mergedProjects, companyId, hasProjectAccess]
  );

  const dashboardSelectableProjects = useMemo(
    () => companyProjects.filter((p) => !isProjectClosed(p)),
    [companyProjects],
  );

  const farmProgressRowsForAllProjects = useMemo(() => {
    if (activeProject || companyProjects.length <= 1) return null;
    return companyProjects.map((p) => buildFarmProgressRowForProject(p, allStages, cropCatalog));
  }, [activeProject, companyProjects, allStages, cropCatalog]);

  const loneProjectCropCardProps = useMemo(() => {
    if (activeProject || companyProjects.length !== 1) return null;
    return buildCropStageCardPropsForProject(companyProjects[0], allStages, cropCatalog);
  }, [activeProject, companyProjects, allStages, cropCatalog]);

  const statCardsScopeValid = useMemo(() => {
    if (activeProject) {
      return companyProjects.some((p) => p.id === activeProject.id) ? activeProject.id : null;
    }
    if (dashboardFocusProjectId && companyProjects.some((p) => p.id === dashboardFocusProjectId)) {
      return dashboardFocusProjectId;
    }
    return null;
  }, [activeProject, dashboardFocusProjectId, companyProjects]);

  /** When “All Projects” and no row focus: limit stat-card totals to farms visible in the Your Farm Progress filter. */
  const farmProgressVisibleProjectIds = useMemo(() => {
    if (activeProject != null || dashboardFocusProjectId != null) return null;
    const base = companyProjects;
    if (farmProgressDashboardFilter === 'all') return new Set(base.map((p) => p.id));
    if (farmProgressDashboardFilter === 'ongoing') {
      return new Set(base.filter((p) => projectFarmLifecycle(p) === 'ongoing').map((p) => p.id));
    }
    return new Set(base.filter((p) => projectFarmLifecycle(p) === 'completed').map((p) => p.id));
  }, [activeProject, dashboardFocusProjectId, companyProjects, farmProgressDashboardFilter]);

  const financialLedgerExpenses = useMemo(() => {
    let filtered = companyId ? allExpenses.filter((e) => e.companyId === companyId) : allExpenses;
    filtered = filtered.filter((e) => !e.projectId || hasProjectAccess(e.projectId));
    if (statCardsScopeValid) {
      filtered = filtered.filter((e) => e.projectId === statCardsScopeValid);
    } else if (farmProgressVisibleProjectIds) {
      filtered = filtered.filter(
        (e) => !e.projectId || farmProgressVisibleProjectIds.has(e.projectId),
      );
    }
    return filtered;
  }, [allExpenses, companyId, hasProjectAccess, statCardsScopeValid, farmProgressVisibleProjectIds]);

  const financialLedgerSales = useMemo(() => {
    let filtered = companyId ? allSales.filter((s) => s.companyId === companyId) : allSales;
    filtered = filtered.filter((s) => !s.projectId || hasProjectAccess(s.projectId));
    if (statCardsScopeValid) {
      filtered = filtered.filter((s) => s.projectId === statCardsScopeValid);
    } else if (farmProgressVisibleProjectIds) {
      filtered = filtered.filter(
        (s) => !s.projectId || farmProgressVisibleProjectIds.has(s.projectId),
      );
    }
    return filtered;
  }, [allSales, companyId, hasProjectAccess, statCardsScopeValid, farmProgressVisibleProjectIds]);

  const statCardsBudgetTotal = useMemo(() => {
    if (statCardsScopeValid) {
      const p = companyProjects.find((x) => x.id === statCardsScopeValid);
      return p ? p.budget || 0 : 0;
    }
    if (farmProgressVisibleProjectIds) {
      return companyProjects
        .filter((p) => farmProgressVisibleProjectIds.has(p.id))
        .reduce((sum, p) => sum + (p.budget || 0), 0);
    }
    return companyProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
  }, [statCardsScopeValid, companyProjects, farmProgressVisibleProjectIds]);

  const filteredExpenses = useMemo(() => {
    let filtered = companyId ? allExpenses.filter((e) => e.companyId === companyId) : allExpenses;
    filtered = filtered.filter((e) => !e.projectId || hasProjectAccess(e.projectId));
    if (activeProject) {
      filtered = filtered.filter((e) => e.projectId === activeProject.id);
    }
    return filtered;
  }, [allExpenses, companyId, activeProject, hasProjectAccess]);

  const filteredHarvests = useMemo(() => {
    let filtered = companyId ? allHarvests.filter((h) => h.companyId === companyId) : allHarvests;
    filtered = filtered.filter((h) => !h.projectId || hasProjectAccess(h.projectId));
    if (activeProject) {
      filtered = filtered.filter((h) => h.projectId === activeProject.id);
    }
    return filtered;
  }, [allHarvests, companyId, activeProject, hasProjectAccess]);

  const filteredSales = useMemo(() => {
    let filtered = companyId ? allSales.filter((s) => s.companyId === companyId) : allSales;
    filtered = filtered.filter((s) => !s.projectId || hasProjectAccess(s.projectId));
    if (activeProject) {
      filtered = filtered.filter((s) => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allSales, companyId, activeProject, hasProjectAccess]);

  const filteredProjects = useMemo(() => {
    if (activeProject) return [activeProject];
    return companyProjects;
  }, [companyProjects, activeProject]);

  const filteredInventory = useMemo(() => {
    const scoped = companyId
      ? allInventory.filter((i) => i.companyId === companyId)
      : allInventory;
    let out = scoped.filter((i) => !i.projectId || hasProjectAccess(i.projectId));
    if (activeProject) {
      out = out.filter((i) => !i.projectId || i.projectId === activeProject.id);
    }
    return out;
  }, [allInventory, companyId, hasProjectAccess, activeProject]);

  const filteredStages = useMemo(() => {
    let filtered = companyId ? allStages.filter((s) => s.companyId === companyId) : allStages;
    filtered = filtered.filter((s) => !s.projectId || hasProjectAccess(s.projectId));
    if (activeProject) {
      filtered = filtered.filter((s) => s.projectId === activeProject.id);
    }
    return filtered;
  }, [allStages, companyId, activeProject, hasProjectAccess]);

  const activeProjectStages = useMemo(() => {
    if (!activeProject) return [];
    return allStages.filter(
      (s) => s.companyId === companyId && s.projectId === activeProject.id && hasProjectAccess(s.projectId)
    );
  }, [allStages, companyId, activeProject, hasProjectAccess]);

  // Compute stages from plantingDate + crop timeline when Firestore stages are empty
  const computedStagesFromTimeline = useMemo(() => {
    if (!activeProject?.plantingDate) return [];
    const timeline = getCropTimeline(activeProject.cropTypeKey ?? activeProject.cropType);
    if (!timeline?.stages?.length) return [];
    
    const plantingDate = toDate(activeProject.plantingDate);
    if (!plantingDate) return [];
    
    const daysSincePlanting = calculateDaysSince(plantingDate);
    const today = new Date();
    
    return timeline.stages.map((stage, index) => {
      const stageStartDate = new Date(plantingDate);
      stageStartDate.setDate(stageStartDate.getDate() + stage.dayStart);
      
      const stageEndDate = new Date(plantingDate);
      stageEndDate.setDate(stageEndDate.getDate() + stage.dayEnd);
      
      let status: 'pending' | 'in-progress' | 'completed' = 'pending';
      if (daysSincePlanting > stage.dayEnd) {
        status = 'completed';
      } else if (daysSincePlanting >= stage.dayStart && daysSincePlanting <= stage.dayEnd) {
        status = 'in-progress';
      }
      
      return {
        id: `computed-${activeProject.id}-${stage.key}`,
        name: stage.label,
        stageName: stage.label,
        startDate: stageStartDate,
        endDate: stageEndDate,
        stageIndex: index,
        projectId: activeProject.id,
        status,
      };
    });
  }, [activeProject?.plantingDate, activeProject?.cropType, activeProject?.cropTypeKey, activeProject?.id]);

  // Use Firestore stages if available, otherwise use computed stages from timeline
  const effectiveActiveProjectStages = useMemo(() => {
    if (activeProjectStages.length > 0) return activeProjectStages;
    return computedStagesFromTimeline;
  }, [activeProjectStages, computedStagesFromTimeline]);

  // Same logic for all projects when no specific project is selected
  const computedAllProjectsStages = useMemo(() => {
    if (filteredStages.length > 0) return filteredStages;
    
    // Generate computed stages for all projects with planting dates
    const projectsWithPlanting = companyProjects.filter(p => p.plantingDate);
    const computedStages: typeof filteredStages = [];
    
    projectsWithPlanting.forEach(project => {
      const timeline = getCropTimeline(project.cropTypeKey ?? project.cropType);
      if (!timeline?.stages?.length) return;
      
      const plantingDate = toDate(project.plantingDate);
      if (!plantingDate) return;
      
      const daysSincePlanting = calculateDaysSince(plantingDate);
      
      timeline.stages.forEach((stage, index) => {
        const stageStartDate = new Date(plantingDate);
        stageStartDate.setDate(stageStartDate.getDate() + stage.dayStart);
        
        const stageEndDate = new Date(plantingDate);
        stageEndDate.setDate(stageEndDate.getDate() + stage.dayEnd);
        
        let status: 'pending' | 'in-progress' | 'completed' = 'pending';
        if (daysSincePlanting > stage.dayEnd) {
          status = 'completed';
        } else if (daysSincePlanting >= stage.dayStart && daysSincePlanting <= stage.dayEnd) {
          status = 'in-progress';
        }
        
        computedStages.push({
          id: `computed-${project.id}-${stage.key}`,
          name: stage.label,
          stageName: stage.label,
          startDate: stageStartDate,
          endDate: stageEndDate,
          stageIndex: index,
          projectId: project.id,
          companyId: project.companyId,
          status,
        } as CropStage);
      });
    });
    
    return computedStages;
  }, [filteredStages, companyProjects]);

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
    // Match farmProgressFromProject: timeline (saved stages or computed from planting) wins over catalog detection.
    if (effectiveActiveProjectStages.length > 0) return null;
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
    effectiveActiveProjectStages.length,
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

  const harvestFinancialsProjectIdGlobal =
    activeProject && companyProjects.some((p) => p.id === activeProject.id) ? activeProject.id : null;

  const { data: fbTotalsGlobal } = useQuery({
    queryKey: ['dashboardFinancialTotals', queryCompanyId ?? '', harvestFinancialsProjectIdGlobal ?? 'all'],
    queryFn: () => getCompanyCollectionFinancialsAggregate(queryCompanyId ?? '', harvestFinancialsProjectIdGlobal),
    enabled: Boolean(queryCompanyId),
  });

  const { data: fbTotalsStatCards } = useQuery({
    queryKey: ['dashboardFinancialTotals', queryCompanyId ?? '', statCardsScopeValid ?? 'all'],
    queryFn: () => getCompanyCollectionFinancialsAggregate(queryCompanyId ?? '', statCardsScopeValid),
    enabled: Boolean(queryCompanyId),
  });

  const effectiveFbTotalsForStatCards = useMemo(() => {
    const raw = fbTotalsStatCards;
    if (!raw) return null;
    if (statCardsScopeValid) return raw;
    if (farmProgressDashboardFilter === 'all' || !farmProgressVisibleProjectIds) return raw;
    let tr = 0;
    let te = 0;
    for (const row of raw.collections) {
      const pid = row.projectId;
      if (pid && farmProgressVisibleProjectIds.has(pid)) {
        tr += row.revenue;
        te += row.totalPaidOut;
      }
    }
    return {
      ...raw,
      totalRevenue: tr,
      totalExpenses: te,
      profitLoss: tr - te,
      totalSales: tr,
    };
  }, [
    fbTotalsStatCards,
    statCardsScopeValid,
    farmProgressDashboardFilter,
    farmProgressVisibleProjectIds,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !user?.id) return;
    // eslint-disable-next-line no-console
    console.log('[Dashboard] aggregation scope', {
      companyId,
      selectedProjectId: activeProject?.id ?? null,
      harvestCollectionsScopeProjectId: harvestFinancialsProjectIdGlobal,
      statCardsHarvestScope: statCardsScopeValid,
      dashboardFocusProjectId,
      mode: activeProject ? 'single_project' : 'all_projects',
    });
  }, [
    user?.id,
    companyId,
    activeProject?.id,
    harvestFinancialsProjectIdGlobal,
    statCardsScopeValid,
    dashboardFocusProjectId,
  ]);

  const firestoreExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const firestoreSales = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalRevenue = firestoreSales + (fbTotalsGlobal?.totalRevenue ?? 0);
  const totalExpenses = firestoreExpenses + (fbTotalsGlobal?.totalExpenses ?? 0);
  const profitLoss = totalRevenue - totalExpenses;
  const netBalance = profitLoss;
  const totalSales = totalRevenue;
  const totalBudget = filteredProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const remainingBudget = totalBudget - totalExpenses;

  const statCardsFirestoreExpenses = financialLedgerExpenses.reduce((sum, e) => sum + e.amount, 0);
  const statCardsFirestoreSales = financialLedgerSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const displayTotalRevenue = statCardsFirestoreSales + (effectiveFbTotalsForStatCards?.totalRevenue ?? 0);
  const displayTotalExpenses = statCardsFirestoreExpenses + (effectiveFbTotalsForStatCards?.totalExpenses ?? 0);
  const displayNetBalance = displayTotalRevenue - displayTotalExpenses;
  const displayRemainingBudget = statCardsBudgetTotal - displayTotalExpenses;

  useEffect(() => {
    if (
      import.meta.env.DEV &&
      (fbTotalsGlobal?.totalRevenue !== undefined || fbTotalsGlobal?.totalExpenses !== undefined)
    ) {
      console.log('[Dashboard Financial Totals]', {
        totalRevenue,
        totalExpenses,
        profitLoss,
        fbRevenue: fbTotalsGlobal?.totalRevenue,
        fbExpenses: fbTotalsGlobal?.totalExpenses,
      });
    }
  }, [fbTotalsGlobal?.totalRevenue, fbTotalsGlobal?.totalExpenses, totalRevenue, totalExpenses, profitLoss]);

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
        setActiveProject(null);
      } else {
        const proj = dashboardSelectableProjects.find((p) => p.id === value);
        if (proj) setActiveProject(proj);
      }
    },
    [dashboardSelectableProjects, setActiveProject]
  );

  const advisorySummary = useMemo(() => {
    const hasActivityToday = mergedActivityLogs.some(isActivityToday);
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
    mergedActivityLogs,
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

  if (tenantSessionTrust === 'provisional' && companyId && !isDeveloper) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-4 px-4 animate-fade-in">
        <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Confirm your workspace</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 text-sm leading-relaxed">
            <span>
              We couldn&apos;t finish loading your account from the server, so farm data is paused to protect your
              workspace. Sync your session to reload projects, expenses, and team access.
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={tenantRecoveryBusy}
                onClick={() => {
                  setTenantRecoveryBusy(true);
                  void (async () => {
                    try {
                      const ok = await syncTenantCompanyFromServer();
                      await refreshAuthState();
                      void queryClient.invalidateQueries({ queryKey: ['projects'] });
                      void queryClient.invalidateQueries({ queryKey: ['dashboard-expenses-supa'] });
                      void queryClient.invalidateQueries({ queryKey: ['dashboard-inventory-supa'] });
                      if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.log('[Dashboard] tenant recovery', { syncOk: ok });
                      }
                    } finally {
                      setTenantRecoveryBusy(false);
                    }
                  })();
                }}
              >
                {tenantRecoveryBusy ? 'Syncing…' : 'Sync account'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-amber-700/40"
                disabled={tenantRecoveryBusy}
                onClick={() => window.location.reload()}
              >
                Refresh page
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const companyProjectCount =
    companyId != null ? mergedProjects.filter((p) => p.companyId === companyId).length : 0;
  const canCreateFarmProject = can('projects', 'create');
  const tenantDataLikelyExists =
    allExpensesSupa.length > 0 || Boolean(projectsFetchError) || expensesSupaError;
  const showFirstProjectOnboarding =
    !isDeveloper &&
    companyId &&
    companyProjectCount === 0 &&
    canCreateFarmProject &&
    !tenantDataLikelyExists &&
    !expensesSupaLoading &&
    companyDataQueriesEnabled;

  if (showFirstProjectOnboarding) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center animate-fade-in">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur-sm">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Welcome to FarmVault</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Start by creating a new or existing farm project to begin tracking your farm.
          </p>
          <Button className="mt-6 w-full sm:w-auto" size="lg" onClick={() => setWelcomeWizardOpen(true)}>
            Create New or Existing Project
          </Button>
        </div>
        <Dialog open={welcomeWizardOpen} onOpenChange={setWelcomeWizardOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogTitle className="sr-only">Create project</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new farm project using crop setup, blocks or planting date, and details.
            </DialogDescription>
            <NewProjectForm
              onCancel={() => setWelcomeWizardOpen(false)}
              onSuccess={() => setWelcomeWizardOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const projectSelectorValue = activeProject ? activeProject.id : 'all';

  const getCropIcon = (cropType?: CropType | null) => {
    if (!cropType) return cropTypeKeyEmoji(null);
    return cropTypeKeyEmoji(String(cropType));
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
      companyDataQueriesEnabled,
    });
  }

  const showTenantLoadIssueBanner =
    Boolean(companyId) &&
    !isDeveloper &&
    companyDataQueriesEnabled &&
    (Boolean(projectsFetchError) || expensesSupaError);

  const hasFinancialStatCards =
    showRevenueCard || showExpensesCard || showProfitLossCard || showBudgetCard;
  const revenueChangeLabel = isHarvestActive ? 'Harvest revenue (current cycle)' : 'vs last month';
  const showCropDashboard = !isHarvestActive && showCropStageCard;
  const hasRightStack = showRevenueCard || showExpensesCard;

  return (
    <div className="space-y-2 animate-fade-in">
      {showTenantLoadIssueBanner && (
        <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Company data may not have loaded fully</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Some dashboard data failed to load (projects or expenses). This is often a brief session or network issue.
              {import.meta.env.DEV ? (
                <>
                  {' '}
                  Dev: check Clerk <code className="rounded bg-background/60 px-1">sub</code> matches company membership
                  in Supabase.
                </>
              ) : (
                ' Try syncing below or refresh the page. Contact support if this continues.'
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-amber-700/40"
              onClick={() => {
                void (async () => {
                  await syncTenantCompanyFromServer();
                  await refreshAuthState();
                  void queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
                  void queryClient.invalidateQueries({ queryKey: ['dashboard-expenses-supa', companyId ?? ''] });
                  void queryClient.invalidateQueries({ queryKey: ['dashboard-inventory-supa', companyId ?? ''] });
                })();
              }}
            >
              Sync and retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
              {dashboardSelectableProjects.map((p) => (
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

      {/* Stats: structured grid when crop + financials; else crop-only or simple 2-col financials */}
      <div className="space-y-2" data-tour="dashboard-stats">
        {!activeProject && dashboardFocusProjectId ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/[0.07] px-3 py-2 text-sm shadow-sm backdrop-blur-sm transition-colors"
            role="status"
          >
            <p className="min-w-0 text-foreground">
              <span className="text-muted-foreground">Now viewing:</span>{' '}
              <span className="font-semibold tracking-tight">
                {companyProjects.find((p) => p.id === dashboardFocusProjectId)?.name ?? 'Project'}
              </span>
            </p>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-primary transition-colors hover:text-primary/85 hover:underline"
              onClick={() => setDashboardFocusProjectId(null)}
            >
              Show All
            </button>
          </div>
        ) : null}

        {showCropDashboard && hasFinancialStatCards ? (
          <div className="dashboard-grid" data-layout="dashboard-grid">
            <div
              data-tour="crop-stage-progress"
              className={cn(
                'min-w-0 space-y-1 mb-0',
                'lg:col-start-1 lg:row-start-1',
                !hasRightStack && 'lg:col-span-2',
              )}
            >
              {blocksSummary != null && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{blocksSummary.count} Blocks Active</span>
                  <span>·</span>
                  <span>{blocksSummary.weightedProgressPercent}% season progress</span>
                </div>
              )}
              <CropStageProgressCard
                farmProgressRows={farmProgressRowsForAllProjects}
                farmProgressDashboardFocusProjectId={!activeProject ? dashboardFocusProjectId : null}
                onFarmProgressDashboardFocusToggle={handleFarmProgressDashboardFocusToggle}
                farmProgressStatusFilter={farmProgressDashboardFilter}
                onFarmProgressStatusFilterChange={setFarmProgressDashboardFilter}
                projectName={loneProjectCropCardProps?.projectName ?? activeProject?.name}
                stages={loneProjectCropCardProps?.stages ?? effectiveActiveProjectStages}
                activeStageOverride={loneProjectCropCardProps?.activeStageOverride ?? activeStageOverride}
                knowledgeDetection={
                  loneProjectCropCardProps?.knowledgeDetection ?? activeProjectKnowledgeDetection
                }
                recentActivityLogs={mergedActivityLogs}
                advisorySummary={advisorySummary}
                compact={user?.role === 'employee'}
              />
            </div>

            {hasRightStack ? (
              <div className="dashboard-grid-right-stack mb-0 lg:col-start-2 lg:row-start-1">
                {showRevenueCard && (
                  <div data-tour="revenue-summary-card" className="min-w-0 mb-0">
                    <StatCard
                      title="Total Revenue"
                      value={`KES ${displayTotalRevenue.toLocaleString()}`}
                      change={15.3}
                      changeLabel={revenueChangeLabel}
                      icon={<TrendingUp className="h-4 w-4" />}
                      variant="gold"
                      compact
                    />
                  </div>
                )}
                {showExpensesCard && (
                  <div data-tour="expenses-summary-card" className="min-w-0 mb-0">
                    <StatCard
                      title="Total Expenses"
                      value={`KES ${displayTotalExpenses.toLocaleString()}`}
                      change={12.5}
                      changeLabel="vs last month"
                      icon={<DollarSign className="h-4 w-4" />}
                      variant="default"
                      compact
                    />
                  </div>
                )}
              </div>
            ) : null}

            {showProfitLossCard && (
              <div
                className={cn(
                  'min-w-0 mb-0',
                  'lg:col-start-1 lg:row-start-2',
                  !showBudgetCard && 'lg:col-span-2',
                )}
              >
                <FeatureGate feature="profitCharts" upgradePresentation="blur-data" className="min-w-0">
                  <div data-tour="profit-loss-card" className="min-w-0">
                    <StatCard
                      title="Profit and Loss"
                      value={`KES ${displayNetBalance.toLocaleString()}`}
                      change={displayNetBalance >= 0 ? 22.1 : -5.2}
                      changeLabel="vs last month"
                      icon={<Wallet className="h-4 w-4" />}
                      variant={displayNetBalance >= 0 ? 'primary' : 'default'}
                      compact
                    />
                  </div>
                </FeatureGate>
              </div>
            )}
            {showBudgetCard && (
              <div
                className={cn(
                  'min-w-0 mb-0',
                  'lg:col-start-2 lg:row-start-2',
                  !showProfitLossCard && 'lg:col-span-2 lg:col-start-1',
                )}
              >
                <StatCard
                  title="Remaining Budget"
                  value={`KES ${displayRemainingBudget.toLocaleString()}`}
                  change={undefined}
                  changeLabel={`of KES ${statCardsBudgetTotal.toLocaleString()}`}
                  icon={<CalendarIcon className="h-4 w-4" />}
                  variant={displayRemainingBudget >= 0 ? 'primary' : 'default'}
                  compact
                />
              </div>
            )}
          </div>
        ) : showCropDashboard && !hasFinancialStatCards ? (
          <div data-tour="crop-stage-progress" className="min-w-0 space-y-1 mb-0">
            {blocksSummary != null && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{blocksSummary.count} Blocks Active</span>
                <span>·</span>
                <span>{blocksSummary.weightedProgressPercent}% season progress</span>
              </div>
            )}
            <CropStageProgressCard
              farmProgressRows={farmProgressRowsForAllProjects}
              farmProgressDashboardFocusProjectId={!activeProject ? dashboardFocusProjectId : null}
              onFarmProgressDashboardFocusToggle={handleFarmProgressDashboardFocusToggle}
              farmProgressStatusFilter={farmProgressDashboardFilter}
              onFarmProgressStatusFilterChange={setFarmProgressDashboardFilter}
              projectName={loneProjectCropCardProps?.projectName ?? activeProject?.name}
              stages={loneProjectCropCardProps?.stages ?? effectiveActiveProjectStages}
              activeStageOverride={loneProjectCropCardProps?.activeStageOverride ?? activeStageOverride}
              knowledgeDetection={
                loneProjectCropCardProps?.knowledgeDetection ?? activeProjectKnowledgeDetection
              }
              recentActivityLogs={mergedActivityLogs}
              advisorySummary={advisorySummary}
              compact={user?.role === 'employee'}
            />
          </div>
        ) : hasFinancialStatCards ? (
          <div
            className="grid grid-cols-1 gap-3 lg:grid-cols-2"
            data-layout="dashboard-stats-grid-fallback"
          >
            {showRevenueCard && (
              <div data-tour="revenue-summary-card" className="min-w-0 mb-0">
                <StatCard
                  title="Total Revenue"
                  value={`KES ${displayTotalRevenue.toLocaleString()}`}
                  change={15.3}
                  changeLabel={revenueChangeLabel}
                  icon={<TrendingUp className="h-4 w-4" />}
                  variant="gold"
                  compact
                />
              </div>
            )}
            {showExpensesCard && (
              <div data-tour="expenses-summary-card" className="min-w-0 mb-0">
                <StatCard
                  title="Total Expenses"
                  value={`KES ${displayTotalExpenses.toLocaleString()}`}
                  change={12.5}
                  changeLabel="vs last month"
                  icon={<DollarSign className="h-4 w-4" />}
                  variant="default"
                  compact
                />
              </div>
            )}
            {showProfitLossCard && (
              <div className={cn('min-w-0 mb-0', !showBudgetCard && 'lg:col-span-2')}>
                <FeatureGate feature="profitCharts" upgradePresentation="blur-data" className="min-w-0">
                  <div data-tour="profit-loss-card" className="min-w-0">
                    <StatCard
                      title="Profit and Loss"
                      value={`KES ${displayNetBalance.toLocaleString()}`}
                      change={displayNetBalance >= 0 ? 22.1 : -5.2}
                      changeLabel="vs last month"
                      icon={<Wallet className="h-4 w-4" />}
                      variant={displayNetBalance >= 0 ? 'primary' : 'default'}
                      compact
                    />
                  </div>
                </FeatureGate>
              </div>
            )}
            {showBudgetCard && (
              <div className={cn('min-w-0 mb-0', !showProfitLossCard && 'lg:col-span-2')}>
                <StatCard
                  title="Remaining Budget"
                  value={`KES ${displayRemainingBudget.toLocaleString()}`}
                  change={undefined}
                  changeLabel={`of KES ${statCardsBudgetTotal.toLocaleString()}`}
                  icon={<CalendarIcon className="h-4 w-4" />}
                  variant={displayRemainingBudget >= 0 ? 'primary' : 'default'}
                  compact
                />
              </div>
            )}
          </div>
        ) : null}

        {!hasFinancialStatCards && (isHarvestActive || !showCropStageCard) ? (
          <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4 text-sm text-muted-foreground">
            No dashboard cards enabled for your account.
          </div>
        ) : null}
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
      <FeatureGate
        feature="advancedAnalytics"
        upgradePresentation="blur-data"
        className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3 md:items-start"
      >
        <ActivityChart data={activityChartData} />
        <ExpensesPieChart data={expensesByCategory} />
      </FeatureGate>

      {/* Bottom Widgets */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
        <CropStageSection stages={activeProject ? effectiveActiveProjectStages : computedAllProjectsStages} />
        <div data-tour="inventory-overview">
          <InventoryOverview inventoryItems={filteredInventory} />
        </div>
        <div data-tour="recent-transactions">
          <RecentTransactions transactions={recentTransactions} />
        </div>
      </div>

      {/* Recent Activities — merged stream of activity logs + admin alerts */}
      {(mergedActivityLogs.length > 0 || adminAlerts.length > 0) && (
        <div className="fv-card">
          <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activities
          </h3>
          <ul className="space-y-1 max-h-[320px] overflow-y-auto scrollbar-thin pr-1">
            {(() => {
              // Merge activity logs and alerts into a single sorted stream
              type FeedItem = { id: string; time: number; kind: 'activity' | 'alert'; data: any };
              const items: FeedItem[] = [];
              mergedActivityLogs.forEach((log) => {
                const t = log.createdAt ? new Date(log.createdAt).getTime() : (log.clientCreatedAt ?? 0);
                items.push({ id: `act-${log.id}`, time: t, kind: 'activity', data: log });
              });
              adminAlerts.forEach((alert) => {
                const t = new Date(alert.createdAt).getTime();
                items.push({ id: `alert-${alert.id}`, time: t, kind: 'alert', data: alert });
              });
              items.sort((a, b) => b.time - a.time);
              return items.slice(0, 15).map((item) => {
                if (item.kind === 'activity') {
                  const log = item.data as ActivityLogDoc;
                  const statusColor =
                    log.status === 'success' ? 'text-green-600' :
                    log.status === 'warning' ? 'text-amber-600' :
                    log.status === 'danger' ? 'text-red-600' : 'text-muted-foreground';
                  return (
                    <li key={item.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm">
                      <span className={cn('shrink-0 mt-0.5 h-2 w-2 rounded-full', {
                        'bg-green-500': log.status === 'success',
                        'bg-amber-500': log.status === 'warning',
                        'bg-red-500': log.status === 'danger',
                        'bg-muted-foreground': log.status === 'info' || !log.status,
                      })} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{log.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.actorName ?? 'System'}
                          {log.projectName ? ` · ${log.projectName}` : ''}
                          {log.createdAt ? ` · ${formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                }
                // Alert item
                const alert = item.data as StoredAdminAlert;
                const sevStyle =
                  alert.severity === 'critical' ? 'bg-red-500/15 text-red-700 dark:text-red-400' :
                  alert.severity === 'high' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' :
                  'bg-muted text-muted-foreground';
                return (
                  <li key={item.id} className={cn('flex items-start gap-2 rounded-md px-2 py-1.5 text-sm', !alert.read && 'bg-muted/50')}>
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-1.5', sevStyle)}>
                          {alert.severity}
                        </span>
                        {alert.module}: {alert.action}
                        {alert.targetLabel && <span className="text-muted-foreground font-normal"> — {alert.targetLabel}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {alert.actorName ?? 'System'} · {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                );
              });
            })()}
          </ul>
        </div>
      )}

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
