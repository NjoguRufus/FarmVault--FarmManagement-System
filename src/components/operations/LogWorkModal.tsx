import React, { useState, useMemo, useCallback } from 'react';
import { Calendar as CalendarIcon, Plus, Trash2, Package, MapPin, Briefcase, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useQuery } from '@tanstack/react-query';
import { listInventoryStock } from '@/services/inventoryReadModelService';
import { createWorkCard, recordWork, recordInventoryUsageForWorkCard } from '@/services/operationsWorkCardService';
import { listFarmsByCompany } from '@/services/farmsService';
import { recordInventoryUsage } from '@/services/inventoryService';
import { createAdminAlert } from '@/services/adminAlertService';
import type { InputUsed } from '@/types';

interface LogWorkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialFarmId?: string | null;
  initialProjectId?: string | null;
}

const WORK_TYPES = [
  'Spraying',
  'Fertilizer Application',
  'Watering',
  'Weeding',
  'Tying',
  'Harvesting',
  'Planting',
  'Land Preparation',
  'Pruning',
  'Pest Control',
  'General Maintenance',
  'Other',
];

/**
 * Maps work types to allowed inventory category keywords.
 * Matches against both `category` (ID or enum) and `category_name` fields
 * using case-insensitive substring matching for resilience against
 * different naming conventions in the database.
 */
const WORK_TYPE_CATEGORY_FILTER: Record<string, string[] | null> = {
  'Fertilizer Application': ['fertilizer'],
  'Spraying': ['chemical', 'pesticide'],
  'Pest Control': ['chemical', 'pesticide'],
  'Watering': ['fuel', 'diesel', 'petrol'],
  'Planting': ['seed'],
  'Tying': ['tying', 'rope', 'sack'],
  'Harvesting': ['tying', 'rope', 'sack'],
};

interface InputItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  currentStock: number;
}

export function LogWorkModal({
  open,
  onOpenChange,
  onSuccess,
  initialFarmId = null,
  initialProjectId = null,
}: LogWorkModalProps) {
  const { user } = useAuth();
  const { projects, activeProject, activeFarmId } = useProject();
  const companyId = user?.companyId ?? null;

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    farmId: '',
    projectId: activeProject?.id ?? '',
    workTitle: '',
    workCategory: '',
    workDate: new Date(),
    workDone: '',
    actualWorkers: 1,
    actualRatePerPerson: 0,
    notes: '',
  });
  const { data: farms = [] } = useQuery({
    queryKey: ['farms', companyId ?? ''],
    queryFn: () => listFarmsByCompany(companyId),
    enabled: Boolean(companyId),
  });
  const selectorFarms = useMemo(
    () =>
      farms.filter(
        (f) =>
          f.status !== 'closed' &&
          !(
            f.name.trim().toLowerCase() === 'legacy farm' &&
            f.location.trim().toLowerCase() === 'unspecified'
          ),
      ),
    [farms],
  );

  const [inputs, setInputs] = useState<InputItem[]>([]);
  const projectsForSelectedFarm = useMemo(
    () => projects.filter((p) => p.farmId === formData.farmId),
    [projects, formData.farmId],
  );
  const selectedProject = useMemo(
    () => projectsForSelectedFarm.find((p) => p.id === formData.projectId) ?? null,
    [projectsForSelectedFarm, formData.projectId],
  );
  React.useEffect(() => {
    if (!open) return;
    const preferredFarmId =
      (initialFarmId ??
        activeProject?.farmId ??
        activeFarmId ??
        formData.farmId) ||
      selectorFarms[0]?.id ||
      '';
    const preferredProjectId =
      initialProjectId ??
      (activeProject && activeProject.farmId === preferredFarmId ? activeProject.id : null) ??
      '';
    setFormData((prev) => ({ ...prev, farmId: preferredFarmId, projectId: preferredProjectId ?? '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    initialFarmId,
    initialProjectId,
    activeProject?.farmId,
    activeProject?.id,
    activeFarmId,
    selectorFarms,
  ]);

  // Fetch inventory items for input selection
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-stock', companyId],
    queryFn: () => listInventoryStock({ companyId: companyId! }),
    enabled: !!companyId,
  });

  // Filter inventory items based on selected work type
  const filteredInventoryItems = useMemo(() => {
    const keywords = WORK_TYPE_CATEGORY_FILTER[formData.workCategory] ?? null;
    // null means no filter — show all items (General Maintenance, Other, etc.)
    if (!keywords) return inventoryItems;

    return inventoryItems.filter((item) => {
      const cat = (item.category ?? '').toLowerCase();
      const catName = (item.category_name ?? '').toLowerCase();
      return keywords.some(
        (kw) => cat.includes(kw) || catName.includes(kw)
      );
    });
  }, [inventoryItems, formData.workCategory]);

  const actualTotal = formData.actualWorkers * formData.actualRatePerPerson;

  // When work type changes, clear any previously selected inputs
  // since they may no longer match the new category filter
  const handleWorkCategoryChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, workCategory: value }));
    setInputs(prev =>
      prev.map(input => ({
        ...input,
        itemId: '',
        itemName: '',
        unit: '',
        currentStock: 0,
        quantity: 0,
      }))
    );
  }, []);

  const addInput = () => {
    setInputs(prev => [...prev, { itemId: '', itemName: '', quantity: 0, unit: '', currentStock: 0 }]);
  };

  const removeInput = (index: number) => {
    setInputs(prev => prev.filter((_, i) => i !== index));
  };

  const updateInput = (index: number, field: keyof InputItem, value: string | number) => {
    setInputs(prev => prev.map((input, i) => {
      if (i !== index) return input;
      
      if (field === 'itemId') {
        const item = inventoryItems.find(inv => inv.id === value);
        return {
          ...input,
          itemId: value as string,
          itemName: item?.name ?? '',
          unit: item?.unit ?? '',
          currentStock: item?.current_stock ?? 0,
        };
      }
      
      return { ...input, [field]: value };
    }));
  };

  const hasLowStockWarning = inputs.some(input => 
    input.itemId && input.quantity > input.currentStock
  );

  const handleSubmit = async () => {
    if (!formData.farmId) {
      toast.error('Please select a farm');
      return;
    }
    if (!formData.workTitle.trim()) {
      toast.error('Please enter a work name');
      return;
    }
    if (!formData.workCategory) {
      toast.error('Please select a work type');
      return;
    }
    if (!formData.workDone.trim()) {
      toast.error('Please describe the work done');
      return;
    }

    setSaving(true);
    try {
      // Step 1: Create the work card in "planned" status
      const workCard = await createWorkCard({
        companyId: companyId!,
        farmId: selectedProject?.farmId ?? formData.farmId,
        projectId: formData.projectId || null,
        workTitle: formData.workTitle.trim(),
        workCategory: formData.workCategory,
        plannedDate: format(formData.workDate, 'yyyy-MM-dd'),
        plannedWorkers: formData.actualWorkers,
        plannedRatePerPerson: formData.actualRatePerPerson,
        notes: formData.notes.trim() || null,
        allocatedManagerId: user?.id ?? null,
        allocatedWorkerName: user?.name ?? null,
        createdByAdminId: user?.id ?? '',
        createdByAdminName: user?.name ?? null,
        actorUserId: user?.id ?? '',
        actorUserName: user?.name ?? null,
      });

      // Step 2: Immediately record the work (move to "logged" status)
      const inputsUsed: InputUsed[] = inputs
        .filter(i => i.itemId && i.quantity > 0)
        .map(i => ({
          itemId: i.itemId,
          itemName: i.itemName,
          quantity: i.quantity,
          unit: i.unit,
        }));

      await recordWork({
        id: workCard.id,
        expectedRowVersion: workCard.rowVersion ?? null,
        actorUserId: user?.id ?? '',
        actorUserName: user?.name ?? null,
        actualDate: format(formData.workDate, 'yyyy-MM-dd'),
        actualWorkers: formData.actualWorkers,
        actualRatePerPerson: formData.actualRatePerPerson,
        workDone: formData.workDone.trim(),
        executionNotes: formData.notes.trim() || null,
        inputsUsed,
        workerIds: [],
      });

      // Step 3: Record inventory usage for each input
      for (const input of inputsUsed) {
        try {
          await recordInventoryUsage({
            companyId: companyId!,
            itemId: input.itemId,
            quantity: input.quantity,
            reason: `Work: ${formData.workTitle}`,
            projectId: formData.projectId || null,
            actorUserId: user?.id ?? '',
            actorUserName: user?.name ?? null,
          });
        } catch (err) {
          console.warn('[LogWorkModal] Failed to record inventory usage for', input.itemName, err);
        }
      }

      // Step 4: Record in work card inventory usage table
      if (inputsUsed.length > 0) {
        await recordInventoryUsageForWorkCard({
          workCardId: workCard.id,
          companyId: companyId!,
          inputsUsed,
          actorUserId: user?.id ?? '',
          actorUserName: user?.name ?? null,
        });
      }

      // Step 5: Create admin alert
      await createAdminAlert({
        companyId: companyId!,
        type: 'work_logged',
        title: 'Work Logged',
        message: `${user?.name ?? 'Employee'} logged work: ${formData.workTitle}`,
        severity: 'info',
        metadata: {
          workCardId: workCard.id,
          workTitle: formData.workTitle,
          loggedBy: user?.name,
        },
      });

      toast.success('Work logged successfully');
      
      // Reset form
      setFormData({
        farmId: formData.farmId,
        projectId: activeProject?.id ?? '',
        workTitle: '',
        workCategory: '',
        workDate: new Date(),
        workDone: '',
        actualWorkers: 1,
        actualRatePerPerson: 0,
        notes: '',
      });
      setInputs([]);

      onSuccess?.();
    } catch (error) {
      console.error('Failed to log work:', error);
      toast.error('Failed to log work');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Log Work
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Row 1: Farm + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="farm">Farm *</Label>
              <Select
                value={formData.farmId || 'none'}
                onValueChange={(v) => setFormData(prev => ({ ...prev, farmId: v === 'none' ? '' : v, projectId: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select farm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select farm</SelectItem>
                  {selectorFarms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {f.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !formData.workDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.workDate ? format(formData.workDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.workDate}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, workDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Row 1b: Project optional */}
          <div className="space-y-2">
            <Label htmlFor="project">Project (optional)</Label>
            <Select
              value={formData.projectId || 'none'}
              onValueChange={(v) => setFormData(prev => ({ ...prev, projectId: v === 'none' ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project (farm-only)</SelectItem>
                {projectsForSelectedFarm.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      {p.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: Work Name + Work Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workTitle">Work Name *</Label>
              <Input
                id="workTitle"
                placeholder="e.g., Applied DAP fertilizer"
                value={formData.workTitle}
                onChange={(e) => setFormData(prev => ({ ...prev, workTitle: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workCategory">Work Type *</Label>
              <Select
                value={formData.workCategory}
                onValueChange={handleWorkCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select work type" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Workers + Rate per Person */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="actualWorkers">Workers</Label>
              <Input
                id="actualWorkers"
                type="number"
                min={1}
                value={formData.actualWorkers}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  actualWorkers: parseInt(e.target.value) || 1
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actualRate">Rate per Person (KSh)</Label>
              <Input
                id="actualRate"
                type="number"
                min={0}
                value={formData.actualRatePerPerson}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  actualRatePerPerson: parseFloat(e.target.value) || 0
                }))}
              />
            </div>
          </div>

          {/* Total */}
          {actualTotal > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-xl font-semibold">KSh {actualTotal.toLocaleString()}</p>
            </div>
          )}

          {/* Row 4: Inputs Used */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Inputs Used (Optional)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addInput}>
                <Plus className="h-4 w-4 mr-1" />
                Add Input
              </Button>
            </div>

            {inputs.map((input, index) => (
              <div key={index} className="flex gap-2 items-start p-3 rounded-lg border bg-muted/20">
                <div className="flex-1 space-y-2">
                  <Select
                    value={input.itemId || 'none'}
                    onValueChange={(v) => updateInput(index, 'itemId', v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select item</SelectItem>
                      {filteredInventoryItems.length > 0 ? (
                        filteredInventoryItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              {item.name} ({item.current_stock} {item.unit})
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          No matching inventory items for this work type
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Qty"
                      value={input.quantity || ''}
                      onChange={(e) => updateInput(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground self-center">
                      {input.unit || 'unit'}
                    </span>
                  </div>
                  {input.itemId && input.quantity > input.currentStock && (
                    <p className="text-xs text-amber-600">
                      Low stock: only {input.currentStock} {input.unit} available
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeInput(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {hasLowStockWarning && (
            <Alert variant="default" className="border-amber-300 bg-amber-50">
              <AlertDescription className="text-amber-800">
                Some items have low stock. The work will still be logged.
              </AlertDescription>
            </Alert>
          )}

          {/* Row 5: Work Done */}
          <div className="space-y-2">
            <Label htmlFor="workDone">Work Done *</Label>
            <Textarea
              id="workDone"
              placeholder="Describe what was accomplished..."
              value={formData.workDone}
              onChange={(e) => setFormData(prev => ({ ...prev, workDone: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Logging...' : 'Log Work'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
