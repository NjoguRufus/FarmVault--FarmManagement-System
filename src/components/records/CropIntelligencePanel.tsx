import React, { useState } from 'react';
import type {
  CropIntelligenceResponse,
  CropRecordInsightsResponse,
  CropKnowledgeProfileForm,
  CropKnowledgeChallengeForm,
  CropKnowledgePracticeForm,
  CropKnowledgeChemicalForm,
  CropKnowledgeTimingWindowForm,
} from '@/services/recordsService';
import { MarkdownContent } from '@/components/records/MarkdownContent';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useUpsertCropKnowledgeProfile,
  useAddCropKnowledgeChallenge,
  useAddCropKnowledgePractice,
  useAddCropKnowledgeChemical,
  useAddCropKnowledgeTimingWindow,
} from '@/hooks/useRecordsNotebook';
import { toast } from 'sonner';

interface CropIntelligencePanelProps {
  cropId: string;
  intelligence: CropIntelligenceResponse | null | undefined;
  insights: CropRecordInsightsResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function CropIntelligencePanel({
  cropId,
  intelligence,
  insights,
  isLoading,
  isError,
}: CropIntelligencePanelProps) {
  if (isLoading) {
    return (
      <div className="fv-card p-8 flex items-center justify-center text-sm text-muted-foreground">
        Loading crop intelligence…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="fv-card p-8 text-sm text-red-500">
        Failed to load crop intelligence. Please try again later.
      </div>
    );
  }

  if (!intelligence) {
    return (
      <div className="fv-card p-8 text-sm text-muted-foreground">
        No crop intelligence available for this crop yet.
      </div>
    );
  }

  const {
    crop,
    profile,
    challenges,
    practices,
    chemicals,
    timing_windows: timingWindows,
    record_summary: recordSummary,
  } = intelligence;

  const summary = insights?.summary ?? {
    total_records: recordSummary.records_count ?? 0,
    company_notes: recordSummary.company_notes_count ?? 0,
    developer_notes: recordSummary.developer_notes_count ?? 0,
    distinct_companies: 0,
    latest_record_at: recordSummary.latest_record_at ?? null,
  };

  const [profileOpen, setProfileOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [chemicalOpen, setChemicalOpen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);

  const [profileForm, setProfileForm] = useState<CropKnowledgeProfileForm>({
    maturityMinDays: profile.maturity_min_days ?? null,
    maturityMaxDays: profile.maturity_max_days ?? null,
    bestTimingNotes: profile.best_timing_notes ?? '',
    harvestWindowNotes: profile.harvest_window_notes ?? '',
    seasonalNotes: profile.seasonal_notes ?? '',
    fertilizerNotes: profile.fertilizer_notes ?? '',
    marketNotes: profile.market_notes ?? '',
    irrigationNotes: profile.irrigation_notes ?? '',
    generalNotes: profile.general_notes ?? '',
  });

  const [challengeForm, setChallengeForm] = useState<CropKnowledgeChallengeForm>({
    challengeName: '',
    challengeType: 'general',
    severity: '',
    notes: '',
  });

  const [practiceForm, setPracticeForm] = useState<CropKnowledgePracticeForm>({
    title: '',
    practiceType: 'general',
    notes: '',
  });

  const [chemicalForm, setChemicalForm] = useState<CropKnowledgeChemicalForm>({
    chemicalName: '',
    purpose: '',
    dosage: '',
    stageNotes: '',
    phiNotes: '',
    mixNotes: '',
  });

  const [timingForm, setTimingForm] = useState<CropKnowledgeTimingWindowForm>({
    title: '',
    plantingStart: '',
    plantingEnd: '',
    harvestStart: '',
    harvestEnd: '',
    durationNotes: '',
    notes: '',
  });

  const upsertProfile = useUpsertCropKnowledgeProfile(cropId);
  const addChallenge = useAddCropKnowledgeChallenge(cropId);
  const addPractice = useAddCropKnowledgePractice(cropId);
  const addChemical = useAddCropKnowledgeChemical(cropId);
  const addTiming = useAddCropKnowledgeTimingWindow(cropId);

  const handleOpenProfile = () => {
    setProfileForm({
      maturityMinDays: profile.maturity_min_days ?? null,
      maturityMaxDays: profile.maturity_max_days ?? null,
      bestTimingNotes: profile.best_timing_notes ?? '',
      harvestWindowNotes: profile.harvest_window_notes ?? '',
      seasonalNotes: profile.seasonal_notes ?? '',
      fertilizerNotes: profile.fertilizer_notes ?? '',
      marketNotes: profile.market_notes ?? '',
      irrigationNotes: profile.irrigation_notes ?? '',
      generalNotes: profile.general_notes ?? '',
    });
    setProfileOpen(true);
  };

  const parseNumberOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isNaN(num) ? null : num;
  };

  const handleSaveProfile = async () => {
    try {
      await upsertProfile.mutateAsync({
        ...profileForm,
        maturityMinDays: profileForm.maturityMinDays,
        maturityMaxDays: profileForm.maturityMaxDays,
      });
      toast.success('Crop profile saved.');
      setProfileOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to save crop profile.';
      toast.error(message);
    }
  };

  const handleSaveChallenge = async () => {
    if (!challengeForm.challengeName.trim()) {
      toast.error('Challenge name is required.');
      return;
    }
    try {
      await addChallenge.mutateAsync(challengeForm);
      toast.success('Challenge added.');
      setChallengeOpen(false);
      setChallengeForm({
        challengeName: '',
        challengeType: 'general',
        severity: '',
        notes: '',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to add challenge.';
      toast.error(message);
    }
  };

  const handleSavePractice = async () => {
    if (!practiceForm.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    try {
      await addPractice.mutateAsync(practiceForm);
      toast.success('Practice added.');
      setPracticeOpen(false);
      setPracticeForm({
        title: '',
        practiceType: 'general',
        notes: '',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to add practice.';
      toast.error(message);
    }
  };

  const handleSaveChemical = async () => {
    if (!chemicalForm.chemicalName.trim()) {
      toast.error('Chemical name is required.');
      return;
    }
    try {
      await addChemical.mutateAsync(chemicalForm);
      toast.success('Chemical added.');
      setChemicalOpen(false);
      setChemicalForm({
        chemicalName: '',
        purpose: '',
        dosage: '',
        stageNotes: '',
        phiNotes: '',
        mixNotes: '',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to add chemical.';
      toast.error(message);
    }
  };

  const handleSaveTiming = async () => {
    if (!timingForm.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    try {
      await addTiming.mutateAsync(timingForm);
      toast.success('Timing window added.');
      setTimingOpen(false);
      setTimingForm({
        title: '',
        plantingStart: '',
        plantingEnd: '',
        harvestStart: '',
        harvestEnd: '',
        durationNotes: '',
        notes: '',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to add timing window.';
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="fv-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Crop</p>
          <p className="text-sm font-semibold text-foreground">{crop.crop_name}</p>
        </div>
        <div className="fv-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Total notes</p>
          <p className="text-sm font-semibold text-foreground">{summary.total_records}</p>
        </div>
        <div className="fv-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Company vs Developer notes</p>
          <p className="text-sm font-semibold text-foreground">
            {summary.company_notes} company · {summary.developer_notes} developer
          </p>
        </div>
        <div className="fv-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Latest note</p>
          <p className="text-sm font-semibold text-foreground">
            {summary.latest_record_at ? new Date(summary.latest_record_at).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      {/* Profile */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Crop Profile</h2>
          <Button variant="outline" size="xs" onClick={handleOpenProfile}>
            Add Profile Notes
          </Button>
        </div>
        <div className="fv-card p-4 space-y-3 text-sm text-muted-foreground">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Maturity</p>
              <p className="text-sm text-foreground">
                {profile.maturity_min_days && profile.maturity_max_days
                  ? `${profile.maturity_min_days}–${profile.maturity_max_days} days`
                  : 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Best timing</p>
              <p className="text-sm whitespace-pre-wrap">
                {profile.best_timing_notes || 'No notes yet.'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Harvest window</p>
              <p className="text-sm whitespace-pre-wrap">
                {profile.harvest_window_notes || 'No notes yet.'}
              </p>
            </div>
          </div>
          {profile.seasonal_notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">Seasonal notes</p>
              <MarkdownContent content={profile.seasonal_notes} />
            </div>
          )}
          {profile.fertilizer_notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">Fertilizer</p>
              <MarkdownContent content={profile.fertilizer_notes} />
            </div>
          )}
          {profile.market_notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">Market</p>
              <MarkdownContent content={profile.market_notes} />
            </div>
          )}
          {profile.irrigation_notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">Irrigation</p>
              <MarkdownContent content={profile.irrigation_notes} />
            </div>
          )}
          {profile.general_notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">General</p>
              <MarkdownContent content={profile.general_notes} />
            </div>
          )}
        </div>
      </section>

      {/* Challenges */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Common Challenges</h2>
          <Button variant="outline" size="xs" onClick={() => setChallengeOpen(true)}>
            Add Challenge
          </Button>
        </div>
        {challenges.length === 0 ? (
          <div className="fv-card p-4 text-xs text-muted-foreground">No challenges recorded yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {challenges.map((c) => (
              <div key={c.id} className="fv-card p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{c.challenge_name}</p>
                  <span className="fv-badge text-[10px] capitalize">{c.challenge_type}</span>
                </div>
                {c.severity && (
                  <p className="text-[11px] text-muted-foreground">
                    Severity: <span className="capitalize">{c.severity}</span>
                  </p>
                )}
                {c.notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{c.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Practices */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Best Practices</h2>
          <Button variant="outline" size="xs" onClick={() => setPracticeOpen(true)}>
            Add Practice
          </Button>
        </div>
        {practices.length === 0 ? (
          <div className="fv-card p-4 text-xs text-muted-foreground">No practices configured yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {practices.map((p) => (
              <div key={p.id} className="fv-card p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{p.title}</p>
                  <span className="fv-badge text-[10px] capitalize">{p.practice_type}</span>
                </div>
                {p.notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{p.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Chemicals */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Chemicals</h2>
          <Button variant="outline" size="xs" onClick={() => setChemicalOpen(true)}>
            Add Chemical
          </Button>
        </div>
        {chemicals.length === 0 ? (
          <div className="fv-card p-4 text-xs text-muted-foreground">No chemicals configured yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chemicals.map((chem) => (
              <div key={chem.id} className="fv-card p-4 space-y-1">
                <p className="text-sm font-medium text-foreground">{chem.chemical_name}</p>
                {chem.purpose && (
                  <p className="text-xs text-muted-foreground">Purpose: {chem.purpose}</p>
                )}
                {chem.dosage && (
                  <p className="text-xs text-muted-foreground">Dosage: {chem.dosage}</p>
                )}
                {chem.stage_notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">
                    {chem.stage_notes}
                  </p>
                )}
                {chem.phi_notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">
                    PHI: {chem.phi_notes}
                  </p>
                )}
                {chem.mix_notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">
                    Mix: {chem.mix_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Timing windows */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Timing Windows</h2>
          <Button variant="outline" size="xs" onClick={() => setTimingOpen(true)}>
            Add Timing Window
          </Button>
        </div>
        {timingWindows.length === 0 ? (
          <div className="fv-card p-4 text-xs text-muted-foreground">No timing windows configured yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {timingWindows.map((tw) => (
              <div key={tw.id} className="fv-card p-4 space-y-1 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground">{tw.title}</p>
                <p>
                  <span className="font-medium">Planting:</span>{' '}
                  {tw.planting_start && tw.planting_end
                    ? `${new Date(tw.planting_start).toLocaleDateString()} → ${new Date(
                        tw.planting_end,
                      ).toLocaleDateString()}`
                    : 'Not specified'}
                </p>
                <p>
                  <span className="font-medium">Harvest:</span>{' '}
                  {tw.harvest_start && tw.harvest_end
                    ? `${new Date(tw.harvest_start).toLocaleDateString()} → ${new Date(
                        tw.harvest_end,
                      ).toLocaleDateString()}`
                    : 'Not specified'}
                </p>
                {tw.duration_notes && (
                  <p className="whitespace-pre-wrap mt-1">{tw.duration_notes}</p>
                )}
                {tw.notes && <p className="whitespace-pre-wrap mt-1">{tw.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent notes from insights */}
      {insights?.recent_notes && insights.recent_notes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Notes</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.recent_notes.map((note) => (
              <div key={note.record_id} className="fv-card p-4 space-y-1 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground truncate">{note.title}</p>
                {note.created_at && (
                  <p>{new Date(note.created_at).toLocaleDateString()}</p>
                )}
                <p className="line-clamp-3 whitespace-pre-wrap mt-1">{note.content_preview}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Profile modal */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Crop Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Maturity Min Days</p>
                <Input
                  value={profileForm.maturityMinDays ?? ''}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      maturityMinDays: parseNumberOrNull(e.target.value),
                    }))
                  }
                  placeholder="e.g. 70"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Maturity Max Days</p>
                <Input
                  value={profileForm.maturityMaxDays ?? ''}
                  onChange={(e) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      maturityMaxDays: parseNumberOrNull(e.target.value),
                    }))
                  }
                  placeholder="e.g. 90"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Best Timing Notes</p>
                <Textarea
                  rows={3}
                  value={profileForm.bestTimingNotes}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, bestTimingNotes: e.target.value }))
                  }
                  placeholder="Describe the best planting or management timing for this crop."
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Harvest Window Notes</p>
                <Textarea
                  rows={3}
                  value={profileForm.harvestWindowNotes}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, harvestWindowNotes: e.target.value }))
                  }
                  placeholder="Describe the ideal harvest window."
                />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Seasonal Notes</p>
                <Textarea
                  rows={3}
                  value={profileForm.seasonalNotes}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, seasonalNotes: e.target.value }))
                  }
                  placeholder="Seasonal behavior, rains, heat, etc."
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Fertilizer Notes</p>
                <Textarea
                  rows={3}
                  value={profileForm.fertilizerNotes}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, fertilizerNotes: e.target.value }))
                  }
                  placeholder="Fertilizer program and key notes."
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Market Notes</p>
                <Textarea
                  rows={3}
                  value={profileForm.marketNotes}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, marketNotes: e.target.value }))
                  }
                  placeholder="Market preferences, pricing patterns, quality notes."
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Irrigation Notes</p>
                <Textarea
                  rows={3}
                  value={profileForm.irrigationNotes}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, irrigationNotes: e.target.value }))
                  }
                  placeholder="Irrigation strategy and key risks."
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">General Notes</p>
                <Textarea
                  rows={3}
                  value={profileForm.generalNotes}
                  onChange={(e) =>
                    setProfileForm((prev) => ({ ...prev, generalNotes: e.target.value }))
                  }
                  placeholder="Any other important notes about this crop."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} disabled={upsertProfile.isLoading}>
              {upsertProfile.isLoading && (
                <span className="mr-1 h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Challenge modal */}
      <Dialog open={challengeOpen} onOpenChange={setChallengeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Challenge</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Challenge Name</p>
              <Input
                autoFocus
                value={challengeForm.challengeName}
                onChange={(e) =>
                  setChallengeForm((prev) => ({ ...prev, challengeName: e.target.value }))
                }
                placeholder="e.g. Powdery mildew during flowering"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Challenge Type</p>
                <Select
                  value={challengeForm.challengeType}
                  onValueChange={(value) =>
                    setChallengeForm((prev) => ({
                      ...prev,
                      challengeType: value as CropKnowledgeChallengeForm['challengeType'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pest">Pest</SelectItem>
                    <SelectItem value="disease">Disease</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                    <SelectItem value="climate">Climate</SelectItem>
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Severity</p>
                <Select
                  value={challengeForm.severity}
                  onValueChange={(value) =>
                    setChallengeForm((prev) => ({
                      ...prev,
                      severity: value === 'none' ? '' : (value as CropKnowledgeChallengeForm['severity']),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <Textarea
                rows={4}
                value={challengeForm.notes}
                onChange={(e) =>
                  setChallengeForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Describe the challenge, conditions, and any observed triggers."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChallengeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveChallenge} disabled={addChallenge.isLoading}>
              {addChallenge.isLoading && (
                <span className="mr-1 h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Practice modal */}
      <Dialog open={practiceOpen} onOpenChange={setPracticeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Practice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Title</p>
              <Input
                autoFocus
                value={practiceForm.title}
                onChange={(e) =>
                  setPracticeForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g. Pre-planting soil preparation"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Practice Type</p>
              <Select
                value={practiceForm.practiceType}
                onValueChange={(value) =>
                  setPracticeForm((prev) => ({
                    ...prev,
                    practiceType: value as CropKnowledgePracticeForm['practiceType'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planting">Planting</SelectItem>
                  <SelectItem value="fertilizer">Fertilizer</SelectItem>
                  <SelectItem value="foliar">Foliar</SelectItem>
                  <SelectItem value="spray">Spray</SelectItem>
                  <SelectItem value="harvest">Harvest</SelectItem>
                  <SelectItem value="irrigation">Irrigation</SelectItem>
                  <SelectItem value="timing">Timing</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <Textarea
                rows={4}
                value={practiceForm.notes}
                onChange={(e) =>
                  setPracticeForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Describe the practice, when to apply it, and any key watchouts."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPracticeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePractice} disabled={addPractice.isLoading}>
              {addPractice.isLoading && (
                <span className="mr-1 h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chemical modal */}
      <Dialog open={chemicalOpen} onOpenChange={setChemicalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Chemical</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Chemical Name</p>
              <Input
                autoFocus
                value={chemicalForm.chemicalName}
                onChange={(e) =>
                  setChemicalForm((prev) => ({ ...prev, chemicalName: e.target.value }))
                }
                placeholder="e.g. Fungicide X"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Purpose</p>
              <Textarea
                rows={3}
                value={chemicalForm.purpose}
                onChange={(e) =>
                  setChemicalForm((prev) => ({ ...prev, purpose: e.target.value }))
                }
                placeholder="What this chemical is used for."
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Dosage</p>
              <Textarea
                rows={3}
                value={chemicalForm.dosage}
                onChange={(e) =>
                  setChemicalForm((prev) => ({ ...prev, dosage: e.target.value }))
                }
                placeholder="e.g. 20 ml per 20 L, etc."
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Stage Notes</p>
              <Textarea
                rows={3}
                value={chemicalForm.stageNotes}
                onChange={(e) =>
                  setChemicalForm((prev) => ({ ...prev, stageNotes: e.target.value }))
                }
                placeholder="Which growth stage(s) this applies to."
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">PHI Notes</p>
              <Textarea
                rows={3}
                value={chemicalForm.phiNotes}
                onChange={(e) =>
                  setChemicalForm((prev) => ({ ...prev, phiNotes: e.target.value }))
                }
                placeholder="Pre-harvest interval guidance."
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Mix Notes</p>
              <Textarea
                rows={3}
                value={chemicalForm.mixNotes}
                onChange={(e) =>
                  setChemicalForm((prev) => ({ ...prev, mixNotes: e.target.value }))
                }
                placeholder="Compatibility, tank-mix notes, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChemicalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveChemical} disabled={addChemical.isLoading}>
              {addChemical.isLoading && (
                <span className="mr-1 h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timing window modal */}
      <Dialog open={timingOpen} onOpenChange={setTimingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Timing Window</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Title</p>
              <Input
                autoFocus
                value={timingForm.title}
                onChange={(e) =>
                  setTimingForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g. Main season planting"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Planting Start</p>
                <Input
                  value={timingForm.plantingStart}
                  onChange={(e) =>
                    setTimingForm((prev) => ({ ...prev, plantingStart: e.target.value }))
                  }
                  placeholder="e.g. 10 January"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Planting End</p>
                <Input
                  value={timingForm.plantingEnd}
                  onChange={(e) =>
                    setTimingForm((prev) => ({ ...prev, plantingEnd: e.target.value }))
                  }
                  placeholder="e.g. 2 March"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Harvest Start</p>
                <Input
                  value={timingForm.harvestStart}
                  onChange={(e) =>
                    setTimingForm((prev) => ({ ...prev, harvestStart: e.target.value }))
                  }
                  placeholder="e.g. Week 3 of June"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Harvest End</p>
                <Input
                  value={timingForm.harvestEnd}
                  onChange={(e) =>
                    setTimingForm((prev) => ({ ...prev, harvestEnd: e.target.value }))
                  }
                  placeholder="e.g. 48–50 days after planting"
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Duration Notes</p>
              <Textarea
                rows={3}
                value={timingForm.durationNotes}
                onChange={(e) =>
                  setTimingForm((prev) => ({ ...prev, durationNotes: e.target.value }))
                }
                placeholder="Free text to describe duration, gaps, or special notes."
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <Textarea
                rows={3}
                value={timingForm.notes}
                onChange={(e) =>
                  setTimingForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Extra details for this timing window."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTiming} disabled={addTiming.isLoading}>
              {addTiming.isLoading && (
                <span className="mr-1 h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}