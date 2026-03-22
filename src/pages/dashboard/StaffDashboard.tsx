import React, { useMemo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { useStaff } from '@/contexts/StaffContext';
import { useProject } from '@/contexts/ProjectContext';
import { CropStageProgressCard } from '@/components/dashboard';
import { useCollection } from '@/hooks/useCollection';
import type { CropStage } from '@/types';
import type { EnvironmentType } from '@/types';
import {
  Select as UiSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toDate } from '@/lib/dateUtils';
import { getLegacyStartingStageIndex, getStageLabelForKey } from '@/lib/stageDetection';
import { detectStageForCrop } from '@/knowledge/stageDetection';
import { findCropKnowledgeByTypeKey, getEffectiveEnvironmentForCrop } from '@/knowledge/cropCatalog';
import { useCropCatalog } from '@/hooks/useCropCatalog';
import { subscribeActivity, type ActivityLogDoc } from '@/services/activityLogService';
import { buildSmartAdvisoryCardSummary } from '@/utils/advisoryEngine';
import { resolveUserDisplayName } from '@/lib/userDisplayName';

export function StaffDashboard() {
  const { user, employeeProfile } = useAuth();
  const { permissions, can } = usePermissions();
  const { effectivePermissionKeys, projectAccessIds, hasProjectAccess } = useEmployeeAccess();
  const { fullName, roleLabel } = useStaff();
  const { projects, activeProject, setActiveProject } = useProject();
  const { crops: cropCatalog } = useCropCatalog(user?.companyId);

  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';

  const { data: allStages = [] } = useCollection<CropStage>(
    'staff-dashboard-stages',
    'projectStages',
    {
      companyScoped: true,
      companyId,
      isDeveloper,
    },
  );

  const companyProjects = useMemo(() => {
    const byCompany = companyId ? projects.filter((p) => p.companyId === companyId) : projects;
    return byCompany.filter((p) => hasProjectAccess(p.id));
  }, [projects, companyId, hasProjectAccess]);

  const activeProjectStages = useMemo(() => {
    if (!activeProject || !companyId) return [];
    return allStages.filter(
      (s) =>
        s.companyId === companyId &&
        s.projectId === activeProject.id &&
        hasProjectAccess(s.projectId),
    );
  }, [allStages, activeProject, companyId, hasProjectAccess]);

  const canSeeCropStage =
    can('planning', 'view') ||
    can('projects', 'view') ||
    effectivePermissionKeys.has('crop_monitoring.view') ||
    effectivePermissionKeys.has('crop_monitoring.progress') ||
    effectivePermissionKeys.has('dashboard.view');

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

  const fallbackKnowledgeDetection = useMemo(() => {
    if (!activeProject) return null;
    const plantingDate = toDate(activeProject.plantingDate);
    if (!plantingDate) return null;
    const today = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSincePlanting = Math.max(0, Math.floor((today.getTime() - plantingDate.getTime()) / msPerDay));
    const totalCycleDays = Math.max(1, Math.round(activeProjectKnowledge?.baseCycleDays ?? 60));
    const progressPercent = Math.max(0, Math.min(100, Math.round((daysSincePlanting / totalCycleDays) * 100)));
    return {
      cropType: activeProject.cropType,
      stageLabel: activeProjectStageLabel ?? 'Crop progress',
      progressPercent,
      totalCycleDays,
      daysSincePlanting,
      stageDurationDays: totalCycleDays,
      daysIntoStage: Math.min(daysSincePlanting, totalCycleDays),
      daysRemainingToNextStage: Math.max(0, totalCycleDays - daysSincePlanting),
      estimatedNextStageDate: null,
      estimatedHarvestStartDate: activeProjectEstimatedHarvestStartDate,
    };
  }, [activeProject, activeProjectKnowledge?.baseCycleDays, activeProjectStageLabel, activeProjectEstimatedHarvestStartDate]);
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

  const resolvedKnowledgeDetection = useMemo(() => {
    return activeProjectKnowledgeDetection ?? fallbackKnowledgeDetection;
  }, [activeProjectKnowledgeDetection, fallbackKnowledgeDetection]);
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

  const [activityLogs, setActivityLogs] = useState<ActivityLogDoc[]>([]);
  useEffect(() => {
    if (!companyId || !activeProject?.id) return;
    const unsubscribe = subscribeActivity(
      companyId,
      { limit: 15, projectId: activeProject.id },
      setActivityLogs,
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [companyId, activeProject?.id]);

  const isActivityToday = (log: ActivityLogDoc): boolean => {
    const d = log.createdAt ?? (log.clientCreatedAt ? new Date(log.clientCreatedAt) : null);
    if (!d) return false;
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };
  const advisorySummary = useMemo(() => {
    if (!canSeeCropStage || !activeProject) return null;
    const hasActivityToday = activityLogs.some(isActivityToday);
    return buildSmartAdvisoryCardSummary({
      hasActivityToday,
      pendingTasksCount: 0,
      stageNearingEnd:
        activeProjectDaysRemainingToNextStage != null &&
        activeProjectDaysRemainingToNextStage <= 7,
      expensesRising: false,
      harvestActive: false,
      environment:
        activeProjectEnvironment === 'greenhouse' ? 'greenhouse' : 'openField',
    });
  }, [
    canSeeCropStage,
    activeProject,
    activityLogs,
    activeProjectDaysRemainingToNextStage,
    activeProjectEnvironment,
  ]);

  const displayName =
    (fullName?.trim() && fullName) ||
    user?.name ||
    resolveUserDisplayName({ email: user?.email });

  const displayRole = roleLabel ?? 'Staff';

  const canHarvest =
    effectivePermissionKeys.has('harvest.view') ||
    effectivePermissionKeys.has('harvest_collections.view');
  const canInventory = can('inventory', 'view');
  const canExpenses =
    effectivePermissionKeys.has('expenses.view') ||
    effectivePermissionKeys.has('expenses.approve');
  const canOperations = can('operations', 'view');

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    console.log('[Dashboard] visible staff cards', {
      uid: user.id,
      employeeName: displayName,
      employeeRole: displayRole,
      harvest: canHarvest,
      inventory: canInventory,
      expenses: canExpenses,
      operations: canOperations,
      projectAccessIds,
      rawPermissions: permissions,
    });
  }

  return (
    <div className="space-y-6 animate-fade-in" data-tour="staff-dashboard-root">
      <div data-tour="staff-dashboard-header">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {displayRole} · Staff workspace
        </p>
      </div>

      {/* Mobile project selector inside dashboard */}
      <div className="md:hidden max-w-xs">
        <p className="text-xs text-muted-foreground mb-1.5">Project</p>
        <UiSelect
          value={activeProject?.id ?? undefined}
          onValueChange={(projectId) => {
            const next = companyProjects.find((p) => p.id === projectId) ?? null;
            if (next) {
              setActiveProject(next);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {companyProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </UiSelect>
      </div>

      {/* Crop stage progress: when staff have planning/projects/dashboard access, show same view as admin (including knowledge-based progress when no stages set). */}
      <div className="space-y-3">
        <CropStageProgressCard
          projectName={activeProject?.name}
          stages={activeProjectStages}
          activeStageOverride={canSeeCropStage ? activeStageOverride : undefined}
          knowledgeDetection={canSeeCropStage ? resolvedKnowledgeDetection ?? undefined : undefined}
          recentActivityLogs={canSeeCropStage ? activityLogs : undefined}
          advisorySummary={canSeeCropStage ? advisorySummary ?? undefined : undefined}
          compact
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {canHarvest && (
          <Link
            to="/staff/harvest-collections"
            className="block"
            data-tour="staff-card-harvest"
          >
            <div className="fv-card p-4 h-full hover:bg-accent/40 transition-colors cursor-pointer">
              <h2 className="text-lg font-semibold mb-2">Harvest & Collections</h2>
              <p className="text-sm text-muted-foreground">
                Open today&apos;s harvest collections workspace for field weigh-in and picker entries.
              </p>
            </div>
          </Link>
        )}

        {canInventory && (
          <Link to="/staff/inventory" className="block" data-tour="staff-card-inventory">
            <div className="fv-card p-4 h-full hover:bg-accent/40 transition-colors cursor-pointer">
              <h2 className="text-lg font-semibold mb-2">Inventory</h2>
              <p className="text-sm text-muted-foreground">
                View stock levels and manage inventory actions you&apos;re allowed to perform.
              </p>
            </div>
          </Link>
        )}

        {canExpenses && (
          <Link to="/staff/expenses" className="block" data-tour="staff-card-expenses">
            <div className="fv-card p-4 h-full hover:bg-accent/40 transition-colors cursor-pointer">
              <h2 className="text-lg font-semibold mb-2">Expenses</h2>
              <p className="text-sm text-muted-foreground">
                View and approve expenses or payments that fall under your role.
              </p>
            </div>
          </Link>
        )}

        {canOperations && (
          <Link to="/staff/operations" className="block" data-tour="staff-card-operations">
            <div className="fv-card p-4 h-full hover:bg-accent/40 transition-colors cursor-pointer">
              <h2 className="text-lg font-semibold mb-2">Operations</h2>
              <p className="text-sm text-muted-foreground">
                Keep track of work cards and field operations assigned to you or your projects.
              </p>
            </div>
          </Link>
        )}
      </div>

      {!canHarvest && !canInventory && !canExpenses && !canOperations && (
        <div className="fv-card p-4">
          <h2 className="text-lg font-semibold mb-2">Limited Access</h2>
          <p className="text-sm text-muted-foreground">
            Your account currently has very limited access. If you believe this is a mistake,
            please contact your administrator.
          </p>
        </div>
      )}
    </div>
  );
}

