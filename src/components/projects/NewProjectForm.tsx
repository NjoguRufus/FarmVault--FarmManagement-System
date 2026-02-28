import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Info, Sprout } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { addDoc, collection, doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { generateStageTimeline, getCropStages } from '@/lib/cropStageConfig';
import { EnvironmentType } from '@/types';
import { cn } from '@/lib/utils';
import {
  cropSupportsEnvironment,
  findCropKnowledgeByTypeKey,
  getEffectiveEnvironmentForCrop,
  getEnvironmentOptionsForCrop,
  normalizeCropTypeKey,
  toProjectCropTypeKey,
} from '@/knowledge/cropCatalog';
import { detectStageForCrop } from '@/knowledge/stageDetection';
import { getLegacyStartingStageIndex } from '@/lib/stageDetection';
import { useCropCatalog } from '@/hooks/useCropCatalog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface NewProjectFormProps {
  onCancel: () => void;
  onSuccess?: () => void;
}

type WizardStep = 1 | 2;
type StageConfidence = 'high' | 'medium' | 'low';

type ProjectFormState = {
  projectName: string;
  cropTypeKey: string;
  environmentType: EnvironmentType;
  plantingDate: Date | undefined;
  currentStage: string;
  location: string;
  acreage: string;
  budget: string;
};

const CONFIDENCE_STYLES: Record<StageConfidence, string> = {
  high: 'border-emerald-300 bg-emerald-100 text-emerald-700',
  medium: 'border-amber-300 bg-amber-100 text-amber-700',
  low: 'border-slate-300 bg-slate-100 text-slate-700',
};

function formatDateLabel(date: Date | undefined) {
  if (!date || Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function toStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <div className={cn('font-medium', step === 1 ? 'text-emerald-600 font-semibold' : 'text-muted-foreground')}>
          1 Crop Setup
        </div>
        <div className="h-px flex-1 bg-border/70" />
        <div className={cn('font-medium', step === 2 ? 'text-emerald-600 font-semibold' : 'text-muted-foreground')}>
          2 Farm Details
        </div>
      </div>
      <div className="h-1 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300 ease-out"
          style={{ width: step === 1 ? '50%' : '100%' }}
        />
      </div>
    </div>
  );
}

export function NewProjectForm({ onCancel, onSuccess }: NewProjectFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { crops: cropCatalog } = useCropCatalog(user?.companyId);

  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<ProjectFormState>({
    projectName: '',
    cropTypeKey: 'tomatoes',
    environmentType: 'open_field',
    plantingDate: new Date(),
    currentStage: '',
    location: '',
    acreage: '',
    budget: '',
  });
  const [manualStageOverride, setManualStageOverride] = useState(false);
  const [stepOneError, setStepOneError] = useState('');
  const [stepTwoReadyToSubmit, setStepTwoReadyToSubmit] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedCrop = useMemo(
    () => findCropKnowledgeByTypeKey(cropCatalog, form.cropTypeKey),
    [cropCatalog, form.cropTypeKey],
  );
  const stageOptions = selectedCrop?.stages ?? [];
  const resolvedEnvironmentType = getEffectiveEnvironmentForCrop(selectedCrop, form.environmentType);
  const detectedStage = useMemo(
    () => detectStageForCrop(selectedCrop, form.plantingDate, resolvedEnvironmentType),
    [selectedCrop, form.plantingDate, resolvedEnvironmentType],
  );
  const stageAutoDetected = detectedStage?.stage.key ?? stageOptions[0]?.key ?? '';
  const daysSincePlanting = detectedStage?.daysSincePlanting ?? 0;
  const selectedStageRule = stageOptions.find((stage) => stage.key === form.currentStage) ?? null;
  const autoStageRule = stageOptions.find((stage) => stage.key === stageAutoDetected) ?? null;
  const currentStageRule = selectedStageRule ?? autoStageRule;
  const environmentLabel = resolvedEnvironmentType === 'greenhouse' ? 'Greenhouse' : 'Open Field';

  const plantingDateValidity = useMemo(() => {
    if (!form.plantingDate || Number.isNaN(form.plantingDate.getTime())) return 'invalid';
    const today = toStartOfDay(new Date());
    const planted = toStartOfDay(form.plantingDate);
    return planted.getTime() > today.getTime() ? 'future' : 'valid';
  }, [form.plantingDate]);

  const stageConfidence = useMemo<StageConfidence>(() => {
    if (!selectedCrop || !detectedStage || !autoStageRule) return 'low';
    if (plantingDateValidity !== 'valid') return 'low';

    const day = detectedStage.effectiveDay;
    if (!Number.isFinite(day) || day < 0) return 'low';

    const boundaryDistance = Math.min(
      Math.abs(day - autoStageRule.baseDayStart),
      Math.abs(autoStageRule.baseDayEnd - day),
    );
    return boundaryDistance <= 2 ? 'medium' : 'high';
  }, [selectedCrop, detectedStage, autoStageRule, plantingDateValidity]);

  const confidenceLabel = stageConfidence[0].toUpperCase() + stageConfidence.slice(1);
  const confidenceStyle = CONFIDENCE_STYLES[stageConfidence];
  const stageRangeDay = Math.max(0, detectedStage?.effectiveDay ?? daysSincePlanting);
  const stageTooltipText = selectedCrop && autoStageRule
    ? `FarmVault auto-detected this stage because ${selectedCrop.displayName} is typically in '${autoStageRule.label}' between day ${autoStageRule.baseDayStart}-${autoStageRule.baseDayEnd} after planting. You can change it if your farm conditions differ.`
    : 'FarmVault needs a valid crop and planting date to auto-detect the stage.';

  useEffect(() => {
    if (!selectedCrop && cropCatalog.length > 0) {
      setForm((prev) => ({ ...prev, cropTypeKey: cropCatalog[0].cropTypeKey }));
    }
  }, [selectedCrop, cropCatalog]);

  useEffect(() => {
    const nextEnvironment = getEffectiveEnvironmentForCrop(selectedCrop, form.environmentType);
    if (nextEnvironment !== form.environmentType) {
      setForm((prev) => ({ ...prev, environmentType: nextEnvironment }));
    }
  }, [selectedCrop, form.environmentType]);

  useEffect(() => {
    const currentSelectionStillValid =
      !!form.currentStage && stageOptions.some((stage) => stage.key === form.currentStage);

    if (!manualStageOverride || !currentSelectionStillValid) {
      if (form.currentStage !== stageAutoDetected) {
        setForm((prev) => ({ ...prev, currentStage: stageAutoDetected }));
      }
    }

    if (manualStageOverride && !currentSelectionStillValid) {
      setManualStageOverride(false);
    }
  }, [form.currentStage, stageOptions, stageAutoDetected, manualStageOverride]);

  useEffect(() => {
    if (step !== 2) {
      setStepTwoReadyToSubmit(false);
      return;
    }

    // Guard against accidental submit when Continue and Create buttons overlap in the same footer slot.
    const timer = window.setTimeout(() => {
      setStepTwoReadyToSubmit(true);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [step]);

  const handleContinue = () => {
    if (!form.projectName.trim() || !selectedCrop || !form.plantingDate) {
      setStepOneError('Project name, crop, and planting date are required.');
      return;
    }
    setStepOneError('');
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      handleContinue();
      return;
    }
    if (!stepTwoReadyToSubmit) return;
    if (!user || !form.plantingDate || saving || !selectedCrop) return;

    const finalStageKey = (form.currentStage || stageAutoDetected).trim();
    if (!finalStageKey) return;

    const effectiveEnvironment = getEffectiveEnvironmentForCrop(selectedCrop, form.environmentType);
    const finalManualOverride = manualStageOverride && finalStageKey !== stageAutoDetected;
    const normalizedCropTypeKey = normalizeCropTypeKey(selectedCrop.cropTypeKey);
    const projectCropType = toProjectCropTypeKey(normalizedCropTypeKey);
    const stageOrderIndex = Math.max(
      0,
      stageOptions.findIndex((stage) => stage.key === finalStageKey),
    );
    const legacyDefsForCrop = getCropStages(projectCropType);
    const startingStageIndex = legacyDefsForCrop.length
      ? getLegacyStartingStageIndex(projectCropType, finalStageKey, stageOrderIndex)
      : stageOrderIndex;
    const environmentAdjustment = detectedStage?.environmentDayAdjustment ?? 0;
    const stagesForWrite = selectedCrop.stages;

    setSaving(true);
    try {
      // Create project first so it appears immediately while stages are generated.
      const projectRef = await addDoc(collection(db, 'projects'), {
        name: form.projectName,
        companyId: user.companyId,
        cropType: projectCropType,
        cropTypeKey: normalizedCropTypeKey,
        environmentType: effectiveEnvironment,
        status: 'active',
        startDate: form.plantingDate ? Timestamp.fromDate(form.plantingDate) : null,
        plantingDate: form.plantingDate ? Timestamp.fromDate(form.plantingDate) : null,
        startingStageIndex,
        currentStage: finalStageKey,
        stageSelected: finalStageKey,
        stageAutoDetected: stageAutoDetected || finalStageKey,
        stageWasManuallyOverridden: finalManualOverride,
        daysSincePlanting,
        location: form.location,
        acreage: Number(form.acreage || '0'),
        budget: Number(form.budget || '0'),
        createdAt: serverTimestamp(),
        createdBy: user.id,
        setupComplete: false,
      });

      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onSuccess?.();

      // Stage creation can continue after the modal/page closes.
      (async () => {
        try {
          const legacyDefs = legacyDefsForCrop;
          const canUseLegacyConfig = legacyDefs.length > 0;

          if (canUseLegacyConfig) {
            const timeline = generateStageTimeline(projectCropType, form.plantingDate!, startingStageIndex);

            for (let i = 0; i < legacyDefs.length; i++) {
              const def = legacyDefs[i];
              if (i < startingStageIndex) {
                const completedStartDate = new Date(form.plantingDate!);
                completedStartDate.setDate(completedStartDate.getDate() - (startingStageIndex - i) * 7);
                const completedEndDate = new Date(completedStartDate);
                completedEndDate.setDate(completedEndDate.getDate() + def.expectedDurationDays - 1);
                await addDoc(collection(db, 'projectStages'), {
                  projectId: projectRef.id,
                  companyId: user.companyId,
                  cropType: projectCropType,
                  stageName: def.name,
                  stageIndex: def.order,
                  startDate: completedStartDate,
                  endDate: completedEndDate,
                  expectedDurationDays: def.expectedDurationDays,
                  status: 'completed',
                  createdAt: serverTimestamp(),
                });
              } else {
                const timelineStage = timeline.find((t) => t.stageIndex === def.order);
                if (!timelineStage) continue;
                await addDoc(collection(db, 'projectStages'), {
                  projectId: projectRef.id,
                  companyId: user.companyId,
                  cropType: projectCropType,
                  stageName: timelineStage.stageName,
                  stageIndex: timelineStage.stageIndex,
                  startDate: timelineStage.startDate,
                  endDate: timelineStage.endDate,
                  expectedDurationDays: timelineStage.expectedDurationDays,
                  createdAt: serverTimestamp(),
                });
              }
            }
          } else {
            for (let i = 0; i < stagesForWrite.length; i++) {
              const stage = stagesForWrite[i];
              const adjustedStart = Math.max(0, stage.baseDayStart + environmentAdjustment);
              const adjustedEnd = Math.max(adjustedStart, stage.baseDayEnd + environmentAdjustment);
              const startDate = new Date(form.plantingDate!);
              startDate.setDate(startDate.getDate() + adjustedStart);
              const endDate = new Date(form.plantingDate!);
              endDate.setDate(endDate.getDate() + adjustedEnd);
              const expectedDurationDays = Math.max(1, adjustedEnd - adjustedStart + 1);

              await addDoc(collection(db, 'projectStages'), {
                projectId: projectRef.id,
                companyId: user.companyId,
                cropType: projectCropType,
                stageName: stage.label,
                stageIndex: i,
                startDate,
                endDate,
                expectedDurationDays,
                ...(i < stageOrderIndex ? { status: 'completed' } : {}),
                createdAt: serverTimestamp(),
              });
            }
          }

          await updateDoc(doc(db, 'projects', projectRef.id), { setupComplete: true });
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          queryClient.invalidateQueries({ queryKey: ['projectStages'] });
          queryClient.invalidateQueries({ queryKey: ['project'] });
        } catch (err) {
          console.error('Error creating stages:', err);
        }
      })();
    } finally {
      setSaving(false);
    }
  };

  const cropSetupSummary = [
    `Project: ${form.projectName || 'Not set'}`,
    `Crop: ${selectedCrop?.displayName ?? 'Not selected'} | ${environmentLabel}`,
    `Stage: ${currentStageRule?.label ?? 'Not selected'}`,
    `Planting: ${formatDateLabel(form.plantingDate)}`,
  ];

  const stageChangePill = (className?: string) => (
    <Select
      value={form.currentStage || stageAutoDetected}
      onValueChange={(value) => {
        setForm((prev) => ({ ...prev, currentStage: value }));
        setManualStageOverride(value !== stageAutoDetected);
      }}
    >
      <SelectTrigger
        className={cn(
          'h-7 w-auto min-w-[120px] rounded-full border-emerald-300 bg-emerald-100 px-3 text-[11px] font-medium text-emerald-700 focus:ring-emerald-400 focus:ring-offset-0',
          className,
        )}
      >
        <span>Change Stage</span>
      </SelectTrigger>
      <SelectContent>
        {stageOptions.map((stage) => (
          <SelectItem key={stage.key} value={stage.key}>
            {stage.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex min-h-[640px] flex-col space-y-4">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            {step === 1 ? 'Create a Project' : 'Farm Details'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 1
              ? 'FarmVault auto-detects stage from planting date. You can adjust before saving.'
              : 'Add location and size details for reporting and budgeting.'}
          </p>
        </div>
        <StepIndicator step={step} />
      </div>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {step === 1 ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Project Name</label>
                <input
                  className="fv-input"
                  value={form.projectName}
                  onChange={(e) => setForm((prev) => ({ ...prev, projectName: e.target.value }))}
                  required
                  placeholder="Kilele - Season 1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Crop</label>
                  <Select
                    value={normalizeCropTypeKey(form.cropTypeKey)}
                    onValueChange={(value) => {
                      const nextCrop = findCropKnowledgeByTypeKey(cropCatalog, value);
                      setForm((prev) => ({
                        ...prev,
                        cropTypeKey: value,
                        environmentType: getEffectiveEnvironmentForCrop(nextCrop, prev.environmentType),
                      }));
                      setManualStageOverride(false);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select crop" />
                    </SelectTrigger>
                    <SelectContent>
                      {cropCatalog.map((crop) => (
                        <SelectItem key={crop.id} value={normalizeCropTypeKey(crop.cropTypeKey)}>
                          {crop.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Environment</label>
                  {cropSupportsEnvironment(selectedCrop) ? (
                    <Select
                      value={resolvedEnvironmentType}
                      onValueChange={(value) => {
                        setForm((prev) => ({ ...prev, environmentType: value as EnvironmentType }));
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select environment" />
                      </SelectTrigger>
                      <SelectContent>
                        {getEnvironmentOptionsForCrop(selectedCrop).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option === 'open_field' ? 'Open Field' : 'Greenhouse'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div
                      className="h-10 rounded-md border border-border/70 bg-muted/35 px-3 text-sm text-muted-foreground flex items-center"
                      aria-label="Environment fixed to open field"
                    >
                      Open Field (Fixed)
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Planting Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="fv-input flex items-center justify-between text-left"
                    >
                      <span>{formatDateLabel(form.plantingDate)}</span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.plantingDate}
                      onSelect={(date) => setForm((prev) => ({ ...prev, plantingDate: date }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3 transition-opacity duration-200">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="flex w-full items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700/80">Likely Stage</p>
                      <div className="md:hidden">{stageChangePill()}</div>
                    </div>
                    <p className="text-sm font-semibold text-emerald-900">
                      {autoStageRule?.label ?? 'Stage not detected'}
                    </p>
                    {manualStageOverride && (
                      <p className="mt-1 text-[11px] font-medium text-emerald-700">Manual</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-emerald-700/80">Crop Age</p>
                    <p className="text-sm font-semibold text-emerald-900">Day {daysSincePlanting}</p>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700/80">Confidence</p>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                          confidenceStyle,
                        )}
                      >
                        {confidenceLabel}
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100"
                          aria-label="Why this stage"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">{stageTooltipText}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <p className="mt-2 text-xs text-emerald-800/80">Based on planting date and crop timeline.</p>
                <p className="mt-1 text-xs text-emerald-800/80">
                  Why: Stage range covers day {stageRangeDay} after planting.
                </p>
                <div className="mt-2 hidden md:flex md:justify-end">{stageChangePill()}</div>
                {manualStageOverride && (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-emerald-800/80">
                      Auto-detected: {autoStageRule?.label ?? 'Not detected'} ({confidenceLabel}). You selected:{' '}
                      {selectedStageRule?.label ?? 'Not selected'}.
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, currentStage: stageAutoDetected }));
                        setManualStageOverride(false);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              {stepOneError && <p className="text-xs text-destructive">{stepOneError}</p>}
            </>
          ) : (
            <>
              <div className="rounded-lg border border-border/70 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {cropSetupSummary.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                    onClick={() => setStep(1)}
                  >
                    Edit Crop Setup
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Location</label>
                <input
                  className="fv-input"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="North Field"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Acreage (acres)</label>
                  <input
                    className="fv-input"
                    type="number"
                    min={0}
                    value={form.acreage}
                    onChange={(e) => setForm((prev) => ({ ...prev, acreage: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Budget (KES)</label>
                  <input
                    className="fv-input"
                    type="number"
                    min={0}
                    value={form.budget}
                    onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 mt-4 border-t border-border/60 bg-background/95 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {step === 1 ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="fv-btn fv-btn--secondary"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fv-btn fv-btn--primary"
                onClick={handleContinue}
              >
                Continue
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="fv-btn fv-btn--secondary"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={saving || !stepTwoReadyToSubmit}
                className="fv-btn fv-btn--primary"
              >
                {saving ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
