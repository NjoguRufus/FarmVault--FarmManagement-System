import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar as CalendarIcon, ChevronLeft, Info, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  addDoc,
  writeBatch,
} from 'firebase/firestore';
import { arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ChallengeType, CropStage, Project, SeasonChallenge, Supplier } from '@/types';
import { useProjectStages } from '@/hooks/useProjectStages';
import { useCollection } from '@/hooks/useCollection';
import { useQueryClient } from '@tanstack/react-query';
import { generateStageTimeline, type GeneratedStage } from '@/lib/cropStageConfig';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function ProjectPlanningPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const companyId = user?.companyId || null;
  const role = user?.role;
  const canEdit = role === 'company-admin' || role === 'manager' || role === 'admin';

  const { data: project, isLoading: projectLoading, refetch: refetchProject } = useQuery<Project | null>({
    queryKey: ['project', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return null;
      const ref = doc(db, 'projects', projectId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data() as any;
      if (data.companyId !== companyId) return null;
      return { id: snap.id, ...(data as Project) };
    },
  });

  const { data: stages = [], isLoading: stagesLoading, refetch: refetchStages } = useProjectStages(
    companyId,
    projectId,
  );

  const { data: suppliers = [] } = useCollection<Supplier>('suppliers', 'suppliers');
  const { data: allSeasonChallenges = [] } = useCollection<SeasonChallenge>(
    'project-planning-season-challenges',
    'seasonChallenges'
  );
  const companySuppliers = useMemo(
    () => (companyId ? suppliers.filter((s) => s.companyId === companyId) : suppliers),
    [suppliers, companyId],
  );
  const supplierNames = useMemo(() => companySuppliers.map((s) => s.name).filter(Boolean), [companySuppliers]);

  const handleAddNewSupplier = async () => {
    const name = seedSupplier.trim();
    if (!name || !companyId || addingSupplier) return;
    setAddingSupplier(true);
    try {
      await addDoc(collection(db, 'suppliers'), {
        name,
        contact: '',
        email: null,
        category: 'Seeds',
        categories: ['Seeds'],
        rating: 0,
        status: 'active',
        companyId,
        createdAt: serverTimestamp(),
      });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSupplierDropdownOpen(false);
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

  const preSeasonChallenges = useMemo(() => {
    if (!project) return [];

    const fromSeason = allSeasonChallenges
      .filter(
        (c) => c.projectId === project.id && String((c as any).source ?? '') === 'preseason-plan'
      )
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
        pending: Boolean((c as any).pending),
      }));

    const linkedPlanningIds = new Set(
      fromSeason
        .map((c) => c.sourcePlanChallengeId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const fromPlanning = expectedChallenges
      .filter((c: any) => !linkedPlanningIds.has(String(c.id ?? '')))
      .map((c: any) => ({
        id: String(c.id ?? ''),
        title: String(c.title ?? c.description ?? ''),
        description: String(c.description ?? ''),
        challengeType: c.challengeType as ChallengeType | undefined,
        severity: c.severity as 'low' | 'medium' | 'high' | undefined,
        status: c.status as 'identified' | 'mitigating' | 'resolved' | undefined,
        addedAt: c.addedAt,
        addedBy: String(c.addedBy ?? 'unknown'),
        sourcePlanChallengeId: c.id,
        pending: false,
      }));

    return [...fromSeason, ...fromPlanning].sort(
      (a, b) => toChallengeTime(b.addedAt) - toChallengeTime(a.addedAt)
    );
  }, [allSeasonChallenges, expectedChallenges, project]);

  const hasPlantingDate = Boolean(project?.plantingDate);
  const hasExistingSeed = Boolean(project?.planning?.seed && (project.planning.seed as any)?.name);

  useEffect(() => {
    if (!project?.plantingDate) {
      setPlantingDateInput('');
      return;
    }
    const raw = project.plantingDate as any;
    const dateObj: Date =
      raw && typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
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
    const oldDate =
      rawOld && typeof rawOld.toDate === 'function'
        ? (rawOld.toDate() as Date)
        : rawOld
        ? new Date(rawOld)
        : null;
    const changed =
      !oldDate || oldDate.getTime() !== newDate.getTime();
    if (!changed) return;
    // Reason required only when changing an existing date (not first time)
    if (oldDate && !plantingReason.trim()) return;

    setSavingPlanting(true);
    try {
      const projectRef = doc(db, 'projects', projectId);
      const changedAt = new Date().toISOString();
      const historyEntry = {
        field: 'plantingDate',
        oldValue: oldDate && !isNaN(oldDate.getTime()) ? oldDate.toISOString() : null,
        newValue: newDate.toISOString(),
        reason: plantingReason.trim() || (oldDate ? '' : 'Initial planting date'),
        changedAt,
        changedBy: user?.id ?? 'unknown',
      };

      await updateDoc(projectRef, {
        plantingDate: newDate,
        'planning.planHistory': arrayUnion(historyEntry),
      });

      // Recalculate stages for active + pending only
      if (project.cropType) {
        const startIndex = project.startingStageIndex ?? 0;
        const timeline = generateStageTimeline(project.cropType, newDate, startIndex);
        const byIndex = new Map<number, GeneratedStage>();
        timeline.forEach((t) => byIndex.set(t.stageIndex, t));

        const batch = writeBatch(db);
        sortedStages.forEach((s) => {
          if (!s.startDate || !s.endDate) return;
          const start = new Date(s.startDate);
          const end = new Date(s.endDate);
          const isCompleted = today > end;
          if (isCompleted) return; // preserve completed

          const updated = byIndex.get(s.stageIndex);
          if (!updated) return;

          const stageRef = doc(db, 'projectStages', s.id);
          batch.update(stageRef, {
            startDate: updated.startDate,
            endDate: updated.endDate,
            recalculated: true,
            recalculatedAt: serverTimestamp(),
            recalculationReason: 'Change of plan: planting date updated',
          });
        });
        await batch.commit();
      }

      await Promise.all([refetchProject(), refetchStages()]);
      setPlantingReason('');
      setChangePlantingModalOpen(false);
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
    try {
      // If supplier name is not in list, add it to Suppliers so it appears there
      if (seedSupplier.trim() && !companySuppliers.some((s) => s.name.trim().toLowerCase() === seedSupplier.trim().toLowerCase())) {
        if (companyId) {
          await addDoc(collection(db, 'suppliers'), {
            name: seedSupplier.trim(),
            contact: '',
            email: null,
            category: 'Seeds',
            categories: ['Seeds'],
            rating: 0,
            status: 'active',
            companyId,
            createdAt: serverTimestamp(),
          });
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        }
      }

      const projectRef = doc(db, 'projects', projectId);
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

      const update: any = {
        'planning.seed': newSeed,
      };
      if (historyEntries.length) {
        update['planning.planHistory'] = arrayUnion(...historyEntries);
      } else if (isFirstTimeSeed) {
        update['planning.planHistory'] = arrayUnion({
          field: 'planning.seed',
          oldValue: null,
          newValue: seedName,
          reason: 'Initial seed plan',
          changedAt,
          changedBy: user?.id ?? 'unknown',
        });
      }

      await updateDoc(projectRef, update);
      await refetchProject();
      setSeedReason('');
      setChangeSeedModalOpen(false);
      setEditingSeed(false);
    } finally {
      setSavingSeed(false);
    }
  };

  const handleAddExpectedChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !companyId || !projectId) return;
    if (!newChallengeTitle.trim()) return;

    setSavingChallenge(true);
    try {
      const projectRef = doc(db, 'projects', projectId);
      const seasonChallengeRef = doc(collection(db, 'seasonChallenges'));
      const changedAt = new Date().toISOString();
      const challengeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry = {
        id: challengeId,
        title: newChallengeTitle.trim(),
        description: newChallengeDescription.trim(),
        challengeType: newChallengeType,
        severity: newChallengeSeverity,
        status: 'identified' as const,
        addedAt: changedAt,
        addedBy: user?.id ?? 'unknown',
      };
      const historyEntry = {
        field: 'planning.expectedChallenges',
        oldValue: null,
        newValue: entry.title,
        reason: `Added expected challenge (${entry.challengeType})`,
        changedAt,
        changedBy: user?.id ?? 'unknown',
      };

      const batch = writeBatch(db);
      batch.set(seasonChallengeRef, {
        title: entry.title,
        description: entry.description || entry.title,
        challengeType: entry.challengeType,
        severity: entry.severity,
        status: 'identified',
        projectId: project.id,
        companyId: project.companyId,
        cropType: project.cropType,
        stageIndex: project.startingStageIndex || 0,
        createdBy: user?.id ?? 'unknown',
        createdByName: user?.name ?? user?.email ?? 'Unknown',
        dateIdentified: serverTimestamp(),
        createdAt: serverTimestamp(),
        source: 'preseason-plan',
        sourcePlanChallengeId: entry.id,
      });
      batch.update(projectRef, {
        'planning.expectedChallenges': arrayUnion(entry),
        'planning.planHistory': arrayUnion(historyEntry),
      });
      await batch.commit();
      await refetchProject();
      queryClient.invalidateQueries({ queryKey: ['seasonChallenges'] });
      setNewChallengeTitle('');
      setNewChallengeDescription('');
      setNewChallengeType('other');
      setNewChallengeSeverity('medium');
      setShowAddPreSeasonForm(false);
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

  return (
    <div className="space-y-8 animate-fade-in" role="main">
      {/* Back + Planning mode (same row) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          className="fv-btn fv-btn--secondary"
          onClick={() => navigate(`/projects/${project.id}`)}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Project
        </button>
        <div className="flex items-center gap-1.5 rounded-lg border bg-amber-50/80 dark:bg-amber-900/20 px-2.5 py-1.5 text-xs font-medium text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span>Planning mode</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground cursor-help"
                aria-label="More information"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Changes here affect project timelines and reports. All edits are logged as immutable change-of-plan events.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left: forms */}
        <div className="space-y-6 xl:col-span-2">
          {/* 1️⃣ Planting Date Planning */}
          <div className="fv-card space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Planting Date Planning</h2>
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
                    <p>Plan and adjust the season start date. Any change is recorded as a change of plan and future stages are recalculated, while completed stages are preserved.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {hasPlantingDate && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setChangePlantingModalOpen(true)}
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
                <button type="submit" className="fv-btn fv-btn--primary" disabled={savingPlanting || !plantingDateInput}>
                  {savingPlanting ? 'Saving…' : 'Set planting date'}
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{formatDate(project.plantingDate)}</span>
              </div>
            )}

            {changePlantingModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
                onClick={() => { setChangePlantingModalOpen(false); setPlantingReason(''); }}
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
                        onClick={() => { setChangePlantingModalOpen(false); setPlantingReason(''); }}
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

          {/* 2️⃣ Seed / Variety Planning */}
          <div className="fv-card space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Seed & Variety Planning</h2>
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
                    <p>Capture the exact seed, variety, supplier, and batch. This enables yield analysis and traceability across seasons.</p>
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

          {/* 3️⃣ Pre-season / planned challenges */}
          <div className="fv-card space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Pre-season / Planned Challenges</h2>
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
                  <p>Record anticipated risks such as pest pressure, late rains, or labour constraints. These are separate from actual season challenges and help compare plan vs reality.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {showAddPreSeasonForm ? (
              <form onSubmit={handleAddExpectedChallenge} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Title</label>
                  <input
                    className="fv-input"
                    placeholder="E.g. High whitefly pressure expected"
                    value={newChallengeTitle}
                    onChange={(e) => setNewChallengeTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <textarea
                    className="fv-input resize-none"
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
                    <label className="text-sm font-medium text-foreground">Severity</label>
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
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={() => setShowAddPreSeasonForm(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add another challenge
                </button>
              </div>
            )}
            <div className="space-y-2">
              {preSeasonChallenges.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No pre-season challenges recorded yet.
                </p>
              )}
              {preSeasonChallenges.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 border border-border/60 rounded-lg px-3 py-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-foreground">{c.title || c.description}</p>
                      {c.challengeType && (
                        <span className="fv-badge text-xs bg-muted text-muted-foreground capitalize">
                          {c.challengeType}
                        </span>
                      )}
                      {c.severity && (
                        <span className="fv-badge text-xs capitalize">{c.severity}</span>
                      )}
                    </div>
                    {c.title && c.description && (
                      <p className="text-sm text-muted-foreground">{c.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        Added on {formatDate(c.addedAt)} by {c.addedBy}
                      </p>
                      {(c as any).pending && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          Syncing...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: summary & history */}
        <div className="space-y-6">
          {/* 4️⃣ Planning summary panel */}
          <div className="fv-card space-y-3">
            <h2 className="text-lg font-semibold">Planning Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current planting date</span>
                <span className="font-medium">{formatDate(project.plantingDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seed</span>
                <span className="font-medium">
                  {seedName || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Variety</span>
                <span className="font-medium">
                  {seedVariety || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan changes</span>
                <span className="font-medium">{totalPlanChanges}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected challenges</span>
                <span className="font-medium">{totalExpectedChallenges}</span>
              </div>
            </div>
          </div>

          {/* 5️⃣ Planning history timeline */}
          <div className="fv-card space-y-3">
            <h2 className="text-lg font-semibold">Planning History</h2>
            {planHistory.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No change-of-plan events recorded yet. All future edits from this page will appear here.
              </p>
            )}
            {planHistory.length > 0 && (
              <div className="space-y-3 text-sm">
                {planHistory
                  .slice()
                  .reverse()
                  .map((h, idx) => (
                    <div key={idx} className="border-l border-border/60 pl-3 ml-1">
                      <p className="font-medium">
                        {h.field === 'plantingDate'
                          ? 'Changed planting date'
                          : `Changed ${h.field}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        From: <code className="px-1">{String(h.oldValue ?? '—')}</code> → To:{' '}
                        <code className="px-1">{String(h.newValue ?? '—')}</code>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reason: {h.reason}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

