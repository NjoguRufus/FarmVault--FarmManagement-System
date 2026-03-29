import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar as CalendarIcon, ChevronLeft, Info, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ChallengeType, CropStage, EnvironmentType, Project, SeasonChallenge, Supplier } from '@/types';
import { useProjectStages } from '@/hooks/useProjectStages';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { findCropKnowledgeByTypeKey } from '@/knowledge/cropCatalog';
import { useCropCatalog } from '@/hooks/useCropCatalog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getProject } from '@/services/projectsService';
import { db } from '@/lib/db';
import { createSeasonChallenge, deleteSeasonChallenge, updateSeasonChallenge } from '@/services/seasonChallengesService';
import { useSeasonChallenges, invalidateSeasonChallengesQuery } from '@/hooks/useSeasonChallenges';
import { getChallengeTemplates, upsertChallengeTemplate } from '@/services/challengeTemplatesService';
import { createSupplier, listSuppliers } from '@/services/suppliersService';
import { getCropTimeline } from '@/config/cropTimelines';
import { calculateDaysSince, getStageForDay } from '@/utils/cropStages';
import { getExpectedHarvestDate } from '@/utils/expectedHarvest';
import { effectiveCurrentStage } from '@/lib/seasonStageOverride';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PlanningHero,
  SeasonStagesBuilder,
  ExpectedChallengesCard,
  PlanningSummaryCard,
  PlanningHistoryCard,
} from '@/components/planning';

export default function ProjectPlanningPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';
  const scope = { companyScoped: true, companyId, isDeveloper, enabled: !!companyId || isDeveloper };

  const {
    data: project,
    isLoading: projectLoading,
  } = useQuery<Project | null>({
    queryKey: ['project', companyId, projectId],
    queryFn: () => (projectId ? getProject(projectId) : Promise.resolve(null)),
    enabled: !!companyId && !!projectId,
    staleTime: 60_000,
  });

  const { data: stages = [], isLoading: stagesLoading } = useProjectStages(
    companyId,
    projectId,
  );

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers', companyId],
    queryFn: () => listSuppliers(companyId!),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  if (import.meta.env?.DEV && companyId) {
    console.log('[ProjectPlanningPage] suppliers load source', { source: 'supabase', count: suppliers.length });
  }
  const { challenges: allSeasonChallenges } = useSeasonChallenges(companyId, projectId ?? null);
  if (import.meta.env?.DEV && projectId) {
    console.log('[ProjectPlanningPage] season challenges fetch', { projectId, count: allSeasonChallenges.length });
  }
  const companySuppliers = useMemo(
    () => (companyId ? suppliers.filter((s) => s.companyId === companyId) : suppliers),
    [suppliers, companyId],
  );
  const { crops: cropCatalog } = useCropCatalog(companyId);
  const selectedProjectCrop = useMemo(
    () => findCropKnowledgeByTypeKey(cropCatalog, project?.cropTypeKey || project?.cropType),
    [cropCatalog, project?.cropType, project?.cropTypeKey],
  );
  const supplierNames = useMemo(() => companySuppliers.map((s) => s.name).filter(Boolean), [companySuppliers]);

  const handleAddNewSupplier = async () => {
    const name = seedSupplier.trim();
    if (!name || !companyId || !user?.id || addingSupplier) return;
    setAddingSupplier(true);
    try {
      if (import.meta.env?.DEV) {
        console.log('[ProjectPlanningPage] supplier create payload', {
          companyId,
          name,
          userId: user?.id,
        });
      }
      const created = await createSupplier({
        companyId,
        name,
      });
      if (import.meta.env?.DEV) {
        console.log('[ProjectPlanningPage] supplier create response', created);
      }
      await queryClient.invalidateQueries({ queryKey: ['suppliers', companyId] });
      setSeedSupplier(created.name);
      setSupplierDropdownOpen(false);
      supplierInputRef.current?.blur();
      toast.success('Supplier added.');
    } finally {
      setAddingSupplier(false);
    }
  };

  const loading = projectLoading || stagesLoading;
  const today = new Date();

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0)),
    [stages],
  );

  const [plantingDateInput, setPlantingDateInput] = useState<string>('');
  const [plantingReason, setPlantingReason] = useState('');
  const [savingPlanting, setSavingPlanting] = useState(false);
  const [changePlantingModalOpen, setChangePlantingModalOpen] = useState(false);
  /** `__calendar__` = stage follows days since this planting date; else template stage key (e.g. transplanting). */
  const [plantingStageSelectKey, setPlantingStageSelectKey] = useState<string>('__calendar__');

  const seed = project?.planning?.seed;
  const [seedName, setSeedName] = useState(seed?.name ?? '');
  const [seedVariety, setSeedVariety] = useState(seed?.variety ?? '');
  const [seedSupplier, setSeedSupplier] = useState(seed?.supplier ?? '');
  const [seedBatch, setSeedBatch] = useState(seed?.batchNumber ?? '');
  const [seedReason, setSeedReason] = useState('');
  const [savingSeed, setSavingSeed] = useState(false);
  const [changeSeedModalOpen, setChangeSeedModalOpen] = useState(false);

  const filteredSuppliersForInput = useMemo(() => {
    const q = (seedSupplier || '').trim().toLowerCase();
    if (!q) return companySuppliers;
    return companySuppliers.filter((s) => s.name.toLowerCase().includes(q));
  }, [companySuppliers, seedSupplier]);

  const noSupplierMatch = (seedSupplier || '').trim() && filteredSuppliersForInput.length === 0;

  const expectedChallenges = project?.planning?.expectedChallenges ?? [];
  const planHistory = project?.planning?.planHistory ?? [];
  const [newChallengeTitle, setNewChallengeTitle] = useState('');
  const [newChallengeDescription, setNewChallengeDescription] = useState('');
  const [newChallengeType, setNewChallengeType] = useState<ChallengeType>('other');
  const [newChallengeSeverity, setNewChallengeSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [savingChallenge, setSavingChallenge] = useState(false);
  const [showAddPreSeasonForm, setShowAddPreSeasonForm] = useState(false);
  const [saveAsReusable, setSaveAsReusable] = useState(false);

  const [editingChallengeId, setEditingChallengeId] = useState<string | null>(null);
  const [editChallengeTitle, setEditChallengeTitle] = useState('');
  const [editChallengeDescription, setEditChallengeDescription] = useState('');
  const [editChallengeType, setEditChallengeType] = useState<ChallengeType>('other');
  const [editChallengeSeverity, setEditChallengeSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [savingChallengeEdit, setSavingChallengeEdit] = useState(false);
  const [editingSeed, setEditingSeed] = useState(false);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);

  const toChallengeTime = (value: any): number => {
    if (!value) return 0;
    const raw = value as any;
    const d = raw && typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  };

  // Single source of truth: project-scoped challenges from shared hook (same as Project Details & Season Challenges page)
  const preSeasonChallenges = useMemo(() => {
    if (!project) return [];

    // Only show planned/pre-season challenges on the Planning page.
    // Backward-compatible: also include older rows with no source set but matching basic shape.
    return allSeasonChallenges
      .filter((c) => {
        const source = String(c.source ?? '');
        if (source === 'preseason-plan') return true;
        // Backward compat: treat legacy identified challenges without a stage as planned.
        if (!source && c.status === 'identified' && (c.stageIndex == null || Number.isNaN(c.stageIndex))) {
          return true;
        }
        return false;
      })
      .map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        challengeType: c.challengeType,
        severity: c.severity,
        status: c.status,
        addedAt: (c as any).dateIdentified ?? c.createdAt,
        addedBy: c.createdByName || c.createdBy || 'unknown',
        sourcePlanChallengeId: c.sourcePlanChallengeId,
        pending: false,
      }));
  }, [allSeasonChallenges, project]);

  const projectCropTypeForTemplates = useMemo(
    () => project?.cropType ?? project?.cropTypeKey ?? null,
    [project?.cropType, project?.cropTypeKey],
  );

  const { data: suggestedTemplates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['challengeTemplates', companyId, projectCropTypeForTemplates],
    queryFn: () =>
      companyId && projectCropTypeForTemplates
        ? getChallengeTemplates(companyId, projectCropTypeForTemplates)
        : Promise.resolve([]),
    enabled: Boolean(companyId && projectCropTypeForTemplates),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  if (import.meta.env?.DEV && companyId && projectCropTypeForTemplates) {
    console.log('[ProjectPlanningPage] challenge templates fetch', {
      companyId,
      cropType: projectCropTypeForTemplates,
      count: suggestedTemplates.length,
    });
  }

  const cropTimeline = useMemo(
    () => getCropTimeline(project?.cropType ?? null),
    [project?.cropType],
  );

  const hasPlantingDate = Boolean(project?.plantingDate);
  const hasExistingSeed = Boolean(project?.planning?.seed && (project.planning.seed as any)?.name);

  useEffect(() => {
    if (!project?.plantingDate) {
      setPlantingDateInput('');
      return;
    }
    const raw = project.plantingDate as any;
    const dateObj: Date = raw instanceof Date ? raw : new Date(raw);
    if (!isNaN(dateObj.getTime())) {
      setPlantingDateInput(dateObj.toISOString().slice(0, 10));
    }
  }, [project?.plantingDate]);

  useEffect(() => {
    const s = project?.planning?.seed;
    if (s) {
      setSeedName((s as any).name ?? '');
      setSeedVariety((s as any).variety ?? '');
      setSeedSupplier((s as any).supplier ?? '');
      setSeedBatch((s as any).batchNumber ?? '');
    } else {
      setSeedName('');
      setSeedVariety('');
      setSeedSupplier('');
      setSeedBatch('');
    }
  }, [project?.planning?.seed]);

  useEffect(() => {
    if (preSeasonChallenges.length === 0) {
      setShowAddPreSeasonForm(true);
    }
  }, [preSeasonChallenges.length]);

  const handleSavePlantingDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !companyId || !projectId) return;
    if (!plantingDateInput) return;

    const newDateRaw = new Date(plantingDateInput);
    if (isNaN(newDateRaw.getTime())) return;
    const newDate = newDateRaw;

    const rawOld = project.plantingDate as any;
    const oldDate = rawOld instanceof Date ? rawOld : rawOld ? new Date(rawOld) : null;
    const dateChanged = !oldDate || oldDate.getTime() !== newDate.getTime();

    const wantsCalendarStage = plantingStageSelectKey === '__calendar__';
    const selectedStageKey =
      !wantsCalendarStage && plantingStageSelectKey.trim() ? plantingStageSelectKey.trim() : null;

    if (oldDate && !plantingReason.trim()) return;

    setSavingPlanting(true);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    try {
      const { data, error } = await db
        .projects()
        .from('projects')
        .select('planning')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;

      const planning = (data?.planning as Project['planning']) ?? {};
      const oldManualKey = planning.manualCurrentStage?.stageKey ?? null;
      const nextManualKey = wantsCalendarStage ? null : selectedStageKey;
      const stagePlanningChanged = (nextManualKey ?? null) !== (oldManualKey ?? null);

      if (!dateChanged && !stagePlanningChanged) {
        toast.message('No changes to save.');
        return;
      }

      setChangePlantingModalOpen(false);

      const changedAt = new Date().toISOString();
      const existingHistory = planning?.planHistory ?? [];
      const historyExtras: NonNullable<Project['planning']>['planHistory'] = [];

      if (dateChanged) {
        historyExtras.push({
          field: 'plantingDate',
          oldValue: oldDate && !isNaN(oldDate.getTime()) ? oldDate.toISOString() : null,
          newValue: newDate.toISOString(),
          reason: plantingReason.trim() || (oldDate ? '' : 'Initial planting date'),
          changedAt,
          changedBy: user?.id ?? 'unknown',
        });
      }

      if (stagePlanningChanged) {
        historyExtras.push({
          field: 'planning.manualCurrentStage',
          oldValue: oldManualKey,
          newValue: nextManualKey,
          reason:
            plantingReason.trim() ||
            (oldDate ? 'Planting plan update' : 'Initial planting plan'),
          changedAt,
          changedBy: user?.id ?? 'unknown',
        });
      }

      const nextPlanning: Project['planning'] = {
        ...planning,
        planHistory: [...(existingHistory ?? []), ...historyExtras],
      };

      if (wantsCalendarStage) {
        delete nextPlanning.manualCurrentStage;
      } else if (selectedStageKey) {
        nextPlanning.manualCurrentStage = {
          stageKey: selectedStageKey,
          updatedAt: changedAt,
          reason: plantingReason.trim() || undefined,
        };
      }

      const { error: updateError } = await db
        .projects()
        .from('projects')
        .update({
          planting_date: newDate.toISOString().slice(0, 10),
          planning: nextPlanning,
        })
        .eq('id', projectId);
      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ['project', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });

      setPlantingReason('');
      setPlantingStageSelectKey(wantsCalendarStage ? '__calendar__' : selectedStageKey ?? '__calendar__');
      toast.success(
        isOffline
          ? 'Planting plan saved. (Offline mode – will reflect after sync.)'
          : dateChanged && stagePlanningChanged
            ? 'Planting date and stage updated.'
            : dateChanged
              ? 'Planting date updated.'
              : 'Growth stage updated.',
      );
    } catch (error) {
      console.error('Failed to save planting plan:', error);
      toast.error('Failed to save planting plan.');
    } finally {
      setSavingPlanting(false);
    }
  };

  const handleSaveSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !companyId || !projectId) return;
    if (!seedName.trim()) return;
    // Reason required only when changing existing seed (not first time)
    if (hasExistingSeed && !seedReason.trim()) return;

    setSavingSeed(true);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    setChangeSeedModalOpen(false);
    try {
      // If supplier name is not in list, add it to Suppliers so it appears there
      if (seedSupplier.trim() && !companySuppliers.some((s) => s.name.trim().toLowerCase() === seedSupplier.trim().toLowerCase())) {
        toast.error('Adding new suppliers from this screen is not yet supported with Supabase.');
      }

      const oldSeed = project.planning?.seed ?? {};
      const newSeed = {
        name: seedName,
        variety: seedVariety || null,
        supplier: seedSupplier || null,
        batchNumber: seedBatch || null,
      };

      const isFirstTimeSeed = !(project.planning?.seed && (project.planning.seed as any).name);
      const reasonForHistory = isFirstTimeSeed ? 'Initial seed plan' : seedReason;
      const changedAt = new Date().toISOString();
      const historyEntries = [];
      const fields: (keyof typeof newSeed)[] = ['name', 'variety', 'supplier', 'batchNumber'];
      for (const f of fields) {
        const oldVal = (oldSeed as any)?.[f] ?? null;
        const newVal = (newSeed as any)[f] ?? null;
        if (oldVal !== newVal) {
          historyEntries.push({
            field: `planning.seed.${f}`,
            oldValue: oldVal,
            newValue: newVal,
            reason: reasonForHistory,
            changedAt,
            changedBy: user?.id ?? 'unknown',
          });
        }
      }

      const { data, error } = await db
        .projects()
        .from('projects')
        .select('planning')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;

      const planning = (data?.planning as Project['planning']) ?? {};
      const existingHistory = planning?.planHistory ?? [];
      const nextPlanning: Project['planning'] = {
        ...planning,
        seed: newSeed,
        planHistory: [
          ...existingHistory,
          ...(historyEntries.length
            ? historyEntries
            : [
                {
                  field: 'planning.seed',
                  oldValue: null,
                  newValue: seedName,
                  reason: 'Initial seed plan',
                  changedAt,
                  changedBy: user?.id ?? 'unknown',
                },
              ]),
        ],
      };

      const { error: updateError } = await db
        .projects()
        .from('projects')
        .update({ planning: nextPlanning })
        .eq('id', projectId);
      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ['project', companyId, projectId] });
      setSeedReason('');
      setEditingSeed(false);
      toast.success(
        isOffline
          ? 'Seed plan saved. (Offline mode – will reflect after sync.)'
          : 'Seed plan updated.',
      );
    } catch (error) {
      console.error('Failed to save seed plan:', error);
      toast.error('Failed to save seed plan.');
    } finally {
      setSavingSeed(false);
    }
  };

  const handleAddExpectedChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !companyId || !projectId) return;
    if (!newChallengeTitle.trim()) return;

    setSavingChallenge(true);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    try {
      const title = newChallengeTitle.trim();
      const description = newChallengeDescription.trim();
      if (import.meta.env?.DEV) {
        console.log('[ProjectPlanningPage] challenge create', { projectId, title });
      }
      await createSeasonChallenge({
        companyId,
        projectId,
        cropType: project.cropType ?? 'other',
        title,
        description,
        challengeType: newChallengeType,
        severity: newChallengeSeverity,
        status: 'identified',
        source: 'preseason-plan',
        createdBy: user?.id ?? undefined,
      });

      if (saveAsReusable && user?.id) {
        try {
          const { isUpdate } = await upsertChallengeTemplate({
            companyId,
            cropType: project.cropType ?? 'other',
            title,
            description,
            challengeType: newChallengeType,
            severity: newChallengeSeverity,
            createdBy: user.id,
          });
          queryClient.invalidateQueries({ queryKey: ['challengeTemplates'] });
          toast.success(isUpdate ? 'Reusable template updated.' : 'Reusable template saved.');
        } catch (templateError) {
          console.warn('[ProjectPlanningPage] template upsert failed', templateError);
          toast.error('Challenge saved, but template could not be saved.');
        }
      }

      invalidateSeasonChallengesQuery(queryClient);
      if (import.meta.env?.DEV) {
        console.log('[ProjectPlanningPage] challenge create success, invalidated queries');
      }
      setNewChallengeTitle('');
      setNewChallengeDescription('');
      setNewChallengeType('other');
      setNewChallengeSeverity('medium');
      setSaveAsReusable(false);
      setShowAddPreSeasonForm(false);
      toast.success(
        isOffline
          ? 'Planned challenge saved. (Offline mode – will reflect after sync.)'
          : 'Planned challenge added.',
      );
    } catch (error) {
      console.error('Failed to add planned challenge:', error);
      if (import.meta.env?.DEV) {
        console.warn('[ProjectPlanningPage] challenge create error', error);
      }
      toast.error('Failed to add planned challenge.');
    } finally {
      setSavingChallenge(false);
    }
  };

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
        <p className="text-sm text-muted-foreground">Loading project planning…</p>
      </div>
    );
  }

  if (!project) {
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

  const formatDate = (d?: any) => {
    if (!d) return '—';
    const raw = d as any;
    const dateObj: Date =
      raw && typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (isNaN(dateObj.getTime())) return '—';
    return dateObj.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const totalPlanChanges = planHistory.length;
  const totalExpectedChallenges = preSeasonChallenges.length;

  const templateStages = cropTimeline?.stages ?? [];
  const manualStageKey = project.planning?.manualCurrentStage?.stageKey ?? null;
  const seasonLengthDays = (() => {
    const maxDay = templateStages.reduce((m, s) => Math.max(m, Number(s.dayEnd ?? 0)), 0);
    return maxDay > 0 ? maxDay : null;
  })();
  const plantingDateRaw = project.plantingDate as unknown;
  const plantingDateObj =
    plantingDateRaw instanceof Date
      ? plantingDateRaw
      : plantingDateRaw
        ? new Date(plantingDateRaw as string)
        : null;
  const daysSincePlanting =
    plantingDateObj && !isNaN(plantingDateObj.getTime())
      ? calculateDaysSince(plantingDateObj)
      : null;
  const currentStageForDay =
    daysSincePlanting != null && templateStages.length
      ? getStageForDay(templateStages, daysSincePlanting)
      : null;
  const effectiveStage = effectiveCurrentStage(templateStages, daysSincePlanting, manualStageKey);
  const expectedHarvestDate = getExpectedHarvestDate(project, undefined);
  const summaryNextStage =
    effectiveStage != null && templateStages[effectiveStage.index + 1]
      ? templateStages[effectiveStage.index + 1].label
      : null;
  const harvestWindowStr = expectedHarvestDate ? formatDate(expectedHarvestDate) : null;

  const calendarStageHint = (() => {
    if (!plantingDateInput) return '';
    const d = new Date(plantingDateInput);
    if (isNaN(d.getTime()) || !templateStages.length) return '';
    const sug = getStageForDay(templateStages, calculateDaysSince(d));
    return sug ? ` (suggested: ${sug.stage.label})` : '';
  })();

  const renderPlantingStageSelect = (idPrefix: string) =>
    templateStages.length > 0 ? (
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-stage`}>Stage for this date</Label>
        <p className="text-xs text-muted-foreground">
          If you meant a different step (for example transplanting instead of planting), choose it here. Use
          &quot;Use calendar from this date&quot; to match days from this date only.
        </p>
        <Select value={plantingStageSelectKey} onValueChange={setPlantingStageSelectKey}>
          <SelectTrigger id={`${idPrefix}-stage`} className="w-full">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__calendar__">{`Use calendar from this date${calendarStageHint}`}</SelectItem>
            {templateStages.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  const openPlantingEditModal = () => {
    setPlantingReason('');
    setPlantingStageSelectKey(manualStageKey ?? '__calendar__');
    setChangePlantingModalOpen(true);
  };

  const closePlantingModal = () => {
    setChangePlantingModalOpen(false);
    setPlantingReason('');
    const k = project.planning?.manualCurrentStage?.stageKey;
    setPlantingStageSelectKey(k ?? '__calendar__');
  };

  const expectedChallengeItems = preSeasonChallenges.map((c) => ({
    id: c.id,
    title: c.title || c.description || '—',
    description: c.description && c.title ? c.description : undefined,
    challengeType: c.challengeType,
    severity: c.severity,
  }));

  const applyTemplateToForm = (templateId: string) => {
    const template = suggestedTemplates.find((t) => t.id === templateId);
    if (!template) return;
    if (import.meta.env?.DEV) {
      console.log('[ProjectPlanningPage] apply template to challenge form', {
        templateId,
        title: template.title,
      });
    }
    setNewChallengeTitle(template.title);
    setNewChallengeDescription(template.description ?? '');
    setNewChallengeType((template.challengeType as ChallengeType) ?? 'other');
    setNewChallengeSeverity((template.severity as any) ?? 'medium');
    setShowAddPreSeasonForm(true);
  };

  const startEditChallenge = (id: string) => {
    const existing = preSeasonChallenges.find((c) => c.id === id);
    if (!existing) return;
    setEditingChallengeId(id);
    setEditChallengeTitle(existing.title ?? '');
    setEditChallengeDescription(existing.description ?? '');
    setEditChallengeType((existing.challengeType as ChallengeType) ?? 'other');
    setEditChallengeSeverity((existing.severity as any) ?? 'medium');
    setShowAddPreSeasonForm(false);
  };

  const cancelEditChallenge = () => {
    setEditingChallengeId(null);
    setEditChallengeTitle('');
    setEditChallengeDescription('');
    setEditChallengeType('other');
    setEditChallengeSeverity('medium');
  };

  const handleSaveChallengeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChallengeId) return;
    setSavingChallengeEdit(true);
    try {
      if (import.meta.env?.DEV) {
        console.log('[ProjectPlanningPage] challenge edit payload', {
          id: editingChallengeId,
          title: editChallengeTitle.trim(),
          challengeType: editChallengeType,
          severity: editChallengeSeverity,
        });
      }
      await updateSeasonChallenge(editingChallengeId, {
        title: editChallengeTitle.trim(),
        description: editChallengeDescription.trim(),
        challengeType: editChallengeType,
        severity: editChallengeSeverity,
      });
      invalidateSeasonChallengesQuery(queryClient);
      toast.success('Challenge updated.');
      cancelEditChallenge();
    } catch (err) {
      console.error('Failed to update challenge:', err);
      toast.error('Failed to update challenge.');
    } finally {
      setSavingChallengeEdit(false);
    }
  };

  const handleDeleteChallenge = async (id: string) => {
    const ok = typeof window !== 'undefined' ? window.confirm('Delete this expected challenge?') : false;
    if (!ok) return;
    try {
      if (import.meta.env?.DEV) {
        console.log('[ProjectPlanningPage] challenge delete', { id });
      }
      await deleteSeasonChallenge(id);
      invalidateSeasonChallengesQuery(queryClient);
      toast.success('Challenge deleted.');
      if (editingChallengeId === id) cancelEditChallenge();
    } catch (err) {
      console.error('Failed to delete challenge:', err);
      toast.error('Failed to delete challenge.');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-8" role="main">
      <PlanningHero
        projectName={project.name}
        plantingDate={plantingDateObj ? formatDate(plantingDateObj) : 'Not set'}
        expectedHarvest={harvestWindowStr}
        seasonLength={seasonLengthDays ? `${seasonLengthDays} days` : null}
        currentStage={effectiveStage?.stage.label ?? null}
        onBack={() => navigate(`/projects/${project.id}`)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="space-y-6 xl:col-span-2">
          {/* 2. Planting Plan */}
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Planting Plan</h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground cursor-help"
                      aria-label="More information"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      Set the season start date. Use Edit to fix the date and, if needed, the growth step (for example
                      transplanting vs planting). Changes are logged and the season timeline updates.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {hasPlantingDate && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={openPlantingEditModal}
                >
                  Edit
                </button>
              )}
            </div>
            {!hasPlantingDate ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSavePlantingDate(e);
                }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Planting date</label>
                  <input
                    type="date"
                    className="fv-input"
                    value={plantingDateInput}
                    onChange={(e) => setPlantingDateInput(e.target.value)}
                    required
                  />
                </div>
                {renderPlantingStageSelect('planting-first')}
                <button type="submit" className="fv-btn fv-btn--primary" disabled={savingPlanting || !plantingDateInput}>
                  {savingPlanting ? 'Saving…' : 'Set planting date'}
                </button>
              </form>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{formatDate(project.plantingDate)}</span>
                </div>
                {templateStages.length > 0 ? (
                  <p className="text-xs text-muted-foreground pl-6">
                    <span>Growth stage: </span>
                    <span className="font-medium text-foreground">{effectiveStage?.stage.label ?? '—'}</span>
                    {manualStageKey ? (
                      <span className="ml-1">— adjusted; calendar would suggest {currentStageForDay?.stage.label ?? '—'}.</span>
                    ) : (
                      <span className="ml-1">— from days since this date.</span>
                    )}
                  </p>
                ) : null}
              </div>
            )}

            {changePlantingModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
                onClick={closePlantingModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="planting-modal-title"
              >
                <div
                  className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-6 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 id="planting-modal-title" className="text-lg font-semibold">Change planting plan</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSavePlantingDate(e);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Planned planting date</label>
                      <input
                        type="date"
                        className="fv-input w-full"
                        value={plantingDateInput}
                        onChange={(e) => setPlantingDateInput(e.target.value)}
                      />
                    </div>
                    {renderPlantingStageSelect('planting-modal')}
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Reason for change</label>
                      <textarea
                        className="fv-input w-full resize-none"
                        rows={3}
                        value={plantingReason}
                        onChange={(e) => setPlantingReason(e.target.value)}
                        placeholder="E.g. delayed rains, seed delivery delay, field not ready..."
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        className="fv-btn fv-btn--secondary"
                        onClick={closePlantingModal}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="fv-btn fv-btn--primary"
                        disabled={savingPlanting}
                      >
                        {savingPlanting ? 'Saving…' : 'Save Change'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* 3. Seed / Variety */}
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Seed / Variety</h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground cursor-help"
                      aria-label="More information"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>Capture what you plan to plant (seed + variety). Supplier/batch helps traceability later.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {hasExistingSeed && !editingSeed && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setEditingSeed(true)}
                >
                  Edit
                </button>
              )}
            </div>
            {!hasExistingSeed || editingSeed ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveSeed(e);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Seed name</label>
                    <input
                      className="fv-input"
                      value={seedName}
                      onChange={(e) => setSeedName(e.target.value)}
                      placeholder="e.g. Hybrid Tomato X123"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Variety</label>
                    <input
                      className="fv-input"
                      value={seedVariety}
                      onChange={(e) => setSeedVariety(e.target.value)}
                      placeholder="e.g. Indeterminate salad type"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 relative" ref={supplierDropdownRef}>
                    <label className="text-sm font-medium text-foreground">Supplier</label>
                    <input
                      ref={supplierInputRef}
                      className="fv-input"
                      value={seedSupplier}
                      onChange={(e) => setSeedSupplier(e.target.value)}
                      onFocus={() => setSupplierDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
                      placeholder="Type to search or select supplier..."
                      autoComplete="off"
                    />
                    {supplierDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                        {filteredSuppliersForInput.length > 0 ? (
                          <ul className="py-1">
                            {filteredSuppliersForInput.map((s) => (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                                  onMouseDown={(e) => { e.preventDefault(); setSeedSupplier(s.name); setSupplierDropdownOpen(false); supplierInputRef.current?.blur(); }}
                                >
                                  {s.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : noSupplierMatch ? (
                          <div className="px-3 py-3 text-sm">
                            <p className="text-muted-foreground mb-2">No supplier found</p>
                            <button
                              type="button"
                              className="fv-btn fv-btn--primary text-xs inline-flex items-center gap-1"
                              onMouseDown={(e) => { e.preventDefault(); handleAddNewSupplier(); }}
                              disabled={addingSupplier}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {addingSupplier ? 'Adding…' : `Add "${seedSupplier.trim()}" as supplier`}
                            </button>
                          </div>
                        ) : (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Type to search suppliers</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Batch / lot number</label>
                    <input
                      className="fv-input"
                      value={seedBatch}
                      onChange={(e) => setSeedBatch(e.target.value)}
                      placeholder="e.g. LOT-2026-08-1234"
                    />
                  </div>
                </div>
                {hasExistingSeed && editingSeed && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Reason for change</label>
                    <textarea
                      className="fv-input w-full resize-none"
                      rows={2}
                      value={seedReason}
                      onChange={(e) => setSeedReason(e.target.value)}
                      placeholder="E.g. switching variety, new supplier..."
                      required
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  {hasExistingSeed && editingSeed && (
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={() => { setEditingSeed(false); setSeedReason(''); }}
                    >
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="fv-btn fv-btn--primary" disabled={savingSeed || !seedName.trim() || (hasExistingSeed && editingSeed && !seedReason.trim())}>
                    {savingSeed ? 'Saving…' : hasExistingSeed ? 'Save changes' : 'Save seed plan'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
                <p><span className="text-muted-foreground">Seed:</span> <span className="font-medium">{seedName || '—'}</span></p>
                <p><span className="text-muted-foreground">Variety:</span> <span className="font-medium">{seedVariety || '—'}</span></p>
                <p><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{seedSupplier || '—'}</span></p>
                <p><span className="text-muted-foreground">Batch:</span> <span className="font-medium">{seedBatch || '—'}</span></p>
              </div>
            )}

          </div>

          {/* Suggested Challenges from reusable templates */}
          {suggestedTemplates.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Suggested Challenges
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Reusable templates for this crop and company. Click &ldquo;Use&rdquo; to prefill the expected challenge form.
              </p>
              <ul className="space-y-2">
                {suggestedTemplates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{t.title}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                      onClick={() => applyTemplateToForm(t.id)}
                    >
                      Use
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Expected Challenges */}
          <ExpectedChallengesCard
            challenges={expectedChallengeItems}
            onAddChallenge={() => setShowAddPreSeasonForm(true)}
            renderItemActions={(c) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => startEditChallenge(c.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-destructive hover:underline"
                  onClick={() => handleDeleteChallenge(c.id)}
                >
                  Delete
                </button>
              </div>
            )}
            addForm={
              editingChallengeId ? (
                <form onSubmit={handleSaveChallengeEdit} className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Title</label>
                    <input
                      className="fv-input w-full"
                      value={editChallengeTitle}
                      onChange={(e) => setEditChallengeTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <textarea
                      className="fv-input w-full resize-none"
                      rows={2}
                      value={editChallengeDescription}
                      onChange={(e) => setEditChallengeDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Challenge type</label>
                      <select
                        className="fv-select w-full"
                        value={editChallengeType}
                        onChange={(e) => setEditChallengeType(e.target.value as ChallengeType)}
                      >
                        <option value="weather">Weather</option>
                        <option value="pests">Pests</option>
                        <option value="diseases">Diseases</option>
                        <option value="prices">Prices</option>
                        <option value="labor">Labour / People</option>
                        <option value="equipment">Equipment</option>
                        <option value="other">Custom (not listed)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Intensity</label>
                      <select
                        className="fv-select w-full"
                        value={editChallengeSeverity}
                        onChange={(e) => setEditChallengeSeverity(e.target.value as 'low' | 'medium' | 'high')}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="fv-btn fv-btn--secondary"
                      onClick={cancelEditChallenge}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="fv-btn fv-btn--secondary"
                      disabled={savingChallengeEdit || !editChallengeTitle.trim()}
                    >
                      {savingChallengeEdit ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              ) : showAddPreSeasonForm ? (
                <form onSubmit={handleAddExpectedChallenge} className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Title</label>
                    <input
                      className="fv-input w-full"
                      placeholder="E.g. High whitefly pressure expected"
                      value={newChallengeTitle}
                      onChange={(e) => setNewChallengeTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <textarea
                      className="fv-input w-full resize-none"
                      rows={2}
                      placeholder="Add details for this planned challenge"
                      value={newChallengeDescription}
                      onChange={(e) => setNewChallengeDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Challenge type</label>
                      <select
                        className="fv-select w-full"
                        value={newChallengeType}
                        onChange={(e) => setNewChallengeType(e.target.value as ChallengeType)}
                      >
                        <option value="weather">Weather</option>
                        <option value="pests">Pests</option>
                        <option value="diseases">Diseases</option>
                        <option value="prices">Prices</option>
                        <option value="labor">Labour / People</option>
                        <option value="equipment">Equipment</option>
                        <option value="other">Custom (not listed)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Intensity</label>
                      <select
                        className="fv-select w-full"
                        value={newChallengeSeverity}
                        onChange={(e) => setNewChallengeSeverity(e.target.value as 'low' | 'medium' | 'high')}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <Label htmlFor="save-as-reusable" className="text-sm font-medium cursor-pointer">
                      Save as reusable challenge template
                    </Label>
                    <Switch
                      id="save-as-reusable"
                      checked={saveAsReusable}
                      onCheckedChange={setSaveAsReusable}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    {preSeasonChallenges.length > 0 && (
                      <button
                        type="button"
                        className="fv-btn fv-btn--secondary"
                        onClick={() => setShowAddPreSeasonForm(false)}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      className="fv-btn fv-btn--secondary"
                      disabled={savingChallenge || !newChallengeTitle.trim()}
                    >
                      {savingChallenge ? 'Adding…' : 'Add planned challenge'}
                    </button>
                  </div>
                </form>
              ) : undefined
            }
          />

          {/* Season Stages */}
          <SeasonStagesBuilder
            stages={templateStages.map((s) => ({
              key: s.key,
              label: s.label,
              dayStart: s.dayStart,
              dayEnd: s.dayEnd,
              color: s.color,
            }))}
            currentStageIndex={effectiveStage?.index ?? null}
          />
        </div>

        {/* Right: summary & history */}
        <div className="space-y-6">
          <PlanningSummaryCard
            nextStage={summaryNextStage}
            expectedHarvestWindow={harvestWindowStr}
            totalStages={templateStages.length}
            seasonDuration={seasonLengthDays ? `${seasonLengthDays} days` : null}
            expectedChallengesCount={totalExpectedChallenges}
          />
          <PlanningHistoryCard
            entries={planHistory}
            formatDate={(d) => formatDate(d)}
          />
        </div>
      </div>
    </div>
  );
}

