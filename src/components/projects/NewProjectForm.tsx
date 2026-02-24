import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Sprout } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { generateStageTimeline, getCropStages } from '@/lib/cropStageConfig';
import { CropType } from '@/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
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

export function NewProjectForm({ onCancel, onSuccess }: NewProjectFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [cropType, setCropType] = useState<CropType>('tomatoes');
  const [location, setLocation] = useState('');
  const [acreage, setAcreage] = useState('');
  const [budget, setBudget] = useState('');
  const [plantingDate, setPlantingDate] = useState<Date | undefined>(new Date());
  const [startingStageIndex, setStartingStageIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const stages = useMemo(() => getCropStages(cropType), [cropType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !plantingDate || saving) return;

    setSaving(true);
    try {
      // Create project first so it appears immediately while stages are generated.
      const projectRef = await addDoc(collection(db, 'projects'), {
        name,
        companyId: user.companyId,
        cropType,
        status: 'active',
        startDate: plantingDate,
        plantingDate,
        startingStageIndex,
        location,
        acreage: Number(acreage || '0'),
        budget: Number(budget || '0'),
        createdAt: serverTimestamp(),
        createdBy: user.id,
        setupComplete: false,
      });

      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onSuccess?.();

      // Stage creation can continue after the modal/page closes.
      (async () => {
        try {
          const stageDefs = getCropStages(cropType);
          const timeline = generateStageTimeline(cropType, plantingDate, startingStageIndex);

          for (let i = 0; i < stageDefs.length; i++) {
            const def = stageDefs[i];
            if (i < startingStageIndex) {
              const completedStartDate = new Date(plantingDate);
              completedStartDate.setDate(completedStartDate.getDate() - (startingStageIndex - i) * 7);
              const completedEndDate = new Date(completedStartDate);
              completedEndDate.setDate(completedEndDate.getDate() + def.expectedDurationDays - 1);
              await addDoc(collection(db, 'projectStages'), {
                projectId: projectRef.id,
                companyId: user.companyId,
                cropType,
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
                cropType,
                stageName: timelineStage.stageName,
                stageIndex: timelineStage.stageIndex,
                startDate: timelineStage.startDate,
                endDate: timelineStage.endDate,
                expectedDurationDays: timelineStage.expectedDurationDays,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            New Project
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define your crop, planting date and starting stage. FarmVault will generate the
            entire season timeline.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Project Name</label>
          <input
            className="fv-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Butterscotch Tomatoes - Season 1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Crop</label>
            <Select
              value={cropType}
              onValueChange={(val) => {
                const asCrop = val as CropType;
                setCropType(asCrop);
                setStartingStageIndex(0);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select crop" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tomatoes">Tomatoes</SelectItem>
                <SelectItem value="french-beans">French Beans</SelectItem>
                <SelectItem value="capsicum">Capsicum</SelectItem>
                <SelectItem value="maize">Maize</SelectItem>
                <SelectItem value="watermelons">Watermelons</SelectItem>
                <SelectItem value="rice">Rice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Starting Stage</label>
            <Select
              value={String(startingStageIndex)}
              onValueChange={(val) => setStartingStageIndex(Number(val))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select starting stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.order} value={String(stage.order)}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Planting Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="fv-input flex items-center justify-between text-left"
                >
                  <span>
                    {plantingDate
                      ? plantingDate.toLocaleDateString('en-KE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Select date'}
                  </span>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Calendar
                  mode="single"
                  selected={plantingDate}
                  onSelect={setPlantingDate}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Location</label>
              <input
                className="fv-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="North Field"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Acreage (acres)</label>
            <input
              className="fv-input"
              type="number"
              min={0}
              value={acreage}
              onChange={(e) => setAcreage(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Budget (KES)</label>
            <input
              className="fv-input"
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            className="fv-btn fv-btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="fv-btn fv-btn--primary"
          >
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}

