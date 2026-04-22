import React, { useState, useMemo, useEffect } from 'react';
import { Calendar as CalendarIcon, User, Briefcase } from 'lucide-react';
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
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useQuery } from '@tanstack/react-query';
import { createWorkCard } from '@/services/operationsWorkCardService';
import { EmployeeService } from '@/services/localData/EmployeeService';
import { FarmService } from '@/services/localData/FarmService';
import type { Employee } from '@/types';
import { logger } from "@/lib/logger";
import { isProjectClosed } from '@/lib/projectClosed';
import { useFarmWorkCategories } from '@/hooks/useFarmWorkCategories';
import { workersCountFromInput } from '@/lib/workersInput';

interface PlanWorkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialFarmId?: string | null;
  initialProjectId?: string | null;
  /** When opening from Farm Work quick actions, pre-fill work type (matches base + custom categories). */
  initialWorkCategory?: string | null;
}

export function PlanWorkModal({
  open,
  onOpenChange,
  onSuccess,
  initialFarmId = null,
  initialProjectId = null,
  initialWorkCategory = null,
}: PlanWorkModalProps) {
  const { user } = useAuth();
  const { projects, activeProject, activeFarmId } = useProject();
  const companyId = user?.companyId ?? null;
  const { allWorkTypes } = useFarmWorkCategories(companyId);

  // Fetch employees from Supabase
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await EmployeeService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return EmployeeService.listEmployees(companyId);
    },
    enabled: !!companyId,
  });
  const { data: farms = [] } = useQuery({
    queryKey: ['farms', companyId ?? ''],
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await FarmService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return FarmService.listFarmsByCompany(companyId);
    },
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

  // Filter employees who have operations.view or operations.recordDailyWork permission
  const openProjects = useMemo(
    () => projects.filter((p) => !isProjectClosed(p)),
    [projects],
  );

  const operationsEmployees = useMemo(() => {
    const filtered = employees.filter(emp => {
      if (emp.status !== 'active') return false;
      const permissions = emp.permissions as Record<string, boolean> | undefined;
      if (!permissions || Object.keys(permissions).length === 0) return false;
      // Check for operations permissions (flat key format)
      return permissions['operations.view'] === true || permissions['operations.recordDailyWork'] === true;
    });
    
    // Debug: log what we found
    if (import.meta.env.DEV) {
      logger.log('[PlanWorkModal] employees filtering', {
        total: employees.length,
        active: employees.filter(e => e.status === 'active').length,
        withPermissions: employees.filter(e => e.permissions && Object.keys(e.permissions as object).length > 0).length,
        withOpsPermission: filtered.length,
        samplePermissions: employees.slice(0, 3).map(e => ({ name: e.name, permissions: e.permissions })),
      });
    }
    
    return filtered;
  }, [employees]);

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [workTypeQuery, setWorkTypeQuery] = useState('');
  const [workTypeMenuOpen, setWorkTypeMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    farmId: '',
    projectId: '',
    workTitle: '',
    workCategory: '',
    plannedDate: new Date(),
    plannedWorkersStr: '0',
    plannedRatePerPerson: 0,
    allocatedManagerId: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setFormData((prev) => {
      const preferredFarmId =
        (initialFarmId ??
          activeProject?.farmId ??
          activeFarmId ??
          prev.farmId) ||
        selectorFarms[0]?.id ||
        '';
      const projectsForFarm = openProjects.filter((p) => p.farmId === preferredFarmId);
      const preferredProjectId =
        initialProjectId ??
        (activeProject && activeProject.farmId === preferredFarmId ? activeProject.id : null) ??
        (projectsForFarm.some((p) => p.id === prev.projectId) ? prev.projectId : null) ??
        '';
      const next = {
        ...prev,
        farmId: preferredFarmId,
        projectId: preferredProjectId,
        plannedWorkersStr: '0',
      };
      if (initialWorkCategory) {
        return {
          ...next,
          workTitle: initialWorkCategory,
          workCategory: initialWorkCategory,
        };
      }
      return {
        ...next,
        workTitle: '',
        workCategory: '',
        plannedDate: new Date(),
        plannedRatePerPerson: 0,
        allocatedManagerId: '',
        notes: '',
      };
    });
    setWorkTypeQuery(initialWorkCategory ?? '');
    setWorkTypeMenuOpen(false);
  }, [
    open,
    openProjects,
    activeProject?.id,
    activeProject?.farmId,
    activeFarmId,
    selectorFarms,
    initialFarmId,
    initialProjectId,
    initialWorkCategory,
  ]);

  const selectedEmployee = useMemo(() => {
    return operationsEmployees.find(e => e.id === formData.allocatedManagerId);
  }, [operationsEmployees, formData.allocatedManagerId]);
  const projectsForSelectedFarm = useMemo(
    () => openProjects.filter((p) => p.farmId === formData.farmId),
    [openProjects, formData.farmId],
  );
  const selectedProject = useMemo(
    () => projectsForSelectedFarm.find((p) => p.id === formData.projectId) ?? null,
    [projectsForSelectedFarm, formData.projectId],
  );
  const filteredWorkTypes = useMemo(() => {
    const q = workTypeQuery.trim().toLowerCase();
    if (!q) return allWorkTypes;
    return allWorkTypes.filter((type) => type.toLowerCase().includes(q));
  }, [workTypeQuery, allWorkTypes]);

  const selectWorkType = (value: string) => {
    setFormData((prev) => ({ ...prev, workCategory: value, workTitle: value }));
    setWorkTypeQuery(value);
    setWorkTypeMenuOpen(false);
  };

  const parsedPlannedWorkers = workersCountFromInput(formData.plannedWorkersStr);
  const plannedTotal = parsedPlannedWorkers * formData.plannedRatePerPerson;

  const validateStepOne = () => {
    if (!formData.farmId) {
      toast.error('Please select a farm');
      return false;
    }
    if (!formData.workCategory) {
      toast.error('Please select a work type');
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateStepOne()) return;
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!validateStepOne()) {
      return;
    }

    setSaving(true);
    try {
      const plannedWorkers = workersCountFromInput(formData.plannedWorkersStr);
      if (plannedWorkers <= 0) {
        toast.error('Planned workers must be greater than zero');
        setSaving(false);
        return;
      }
      const effectiveWorkTitle = formData.workTitle.trim() || formData.workCategory;
      await createWorkCard({
        companyId: companyId!,
        farmId: selectedProject?.farmId ?? formData.farmId,
        projectId: formData.projectId || null,
        workTitle: effectiveWorkTitle,
        workCategory: formData.workCategory,
        plannedDate: format(formData.plannedDate, 'yyyy-MM-dd'),
        plannedWorkers,
        plannedRatePerPerson: formData.plannedRatePerPerson,
        notes: formData.notes.trim() || null,
        allocatedManagerId: formData.allocatedManagerId || null,
        allocatedWorkerName: selectedEmployee?.name ?? null,
        createdByAdminId: user?.id ?? '',
        createdByAdminName: user?.name ?? null,
        actorUserId: user?.id ?? '',
        actorUserName: user?.name ?? null,
      });

      toast.success('Work card created successfully');
      
      // Reset form
      const nextProjectId =
        activeProject &&
        !isProjectClosed(activeProject) &&
        projectsForSelectedFarm.some((p) => p.id === activeProject.id)
          ? activeProject.id
          : '';
      setFormData({
        farmId: formData.farmId,
        projectId: nextProjectId,
        workTitle: '',
        workCategory: '',
        plannedDate: new Date(),
        plannedWorkersStr: '0',
        plannedRatePerPerson: 0,
        allocatedManagerId: '',
        notes: '',
      });
      setWorkTypeQuery('');
      setStep(1);

      onSuccess?.();
    } catch (error) {
      console.error('Failed to create work card:', error);
      toast.error('Failed to create work card');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Plan Work
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pt-2">
          <span>Step {step} of 2</span>
          <span>{step === 1 ? 'Work details' : 'Staffing and notes'}</span>
        </div>

        <div className="space-y-4 py-4">
          {step === 1 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="farm">Farm *</Label>
                <Select
                  value={formData.farmId || 'none'}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      farmId: v === 'none' ? '' : v,
                      projectId: '',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select farm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select farm</SelectItem>
                    {selectorFarms.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

              <div className="space-y-2">
                <Label htmlFor="workCategory">Work Type *</Label>
                <div className="relative">
                  <Input
                    id="workCategory"
                    value={workTypeQuery}
                    placeholder="Type to search work type"
                    onFocus={() => setWorkTypeMenuOpen(true)}
                    onBlur={() => window.setTimeout(() => setWorkTypeMenuOpen(false), 120)}
                    onChange={(e) => {
                      const value = e.target.value;
                      setWorkTypeQuery(value);
                      const exact = allWorkTypes.find((type) => type.toLowerCase() === value.trim().toLowerCase());
                      setFormData((prev) => ({
                        ...prev,
                        workCategory: exact ?? '',
                        workTitle: exact ?? prev.workTitle,
                      }));
                      setWorkTypeMenuOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredWorkTypes.length > 0) {
                        e.preventDefault();
                        selectWorkType(filteredWorkTypes[0]);
                      }
                    }}
                  />
                  {workTypeMenuOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-44 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                      {filteredWorkTypes.map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={cn(
                            'w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60',
                            formData.workCategory === type && 'bg-muted',
                          )}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => selectWorkType(type)}
                        >
                          {type}
                        </button>
                      ))}
                      {filteredWorkTypes.length === 0 && (
                        <p className="px-2 py-2 text-xs text-muted-foreground">No work type matches.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.plannedDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.plannedDate ? format(formData.plannedDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.plannedDate}
                      onSelect={(date) => date && setFormData(prev => ({ ...prev, plannedDate: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plannedWorkers">Planned Workers</Label>
                  <Input
                    id="plannedWorkers"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={formData.plannedWorkersStr}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        plannedWorkersStr: e.target.value,
                      }))
                    }
                    onBlur={() =>
                      setFormData((prev) => ({
                        ...prev,
                        plannedWorkersStr:
                          prev.plannedWorkersStr.trim() === ''
                            ? '0'
                            : String(workersCountFromInput(prev.plannedWorkersStr)),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plannedRate">Rate per Person (KSh)</Label>
                  <Input
                    id="plannedRate"
                    type="number"
                    min={0}
                    value={formData.plannedRatePerPerson}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      plannedRatePerPerson: parseFloat(e.target.value) || 0
                    }))}
                  />
                </div>
              </div>

              {plannedTotal > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-sm text-muted-foreground">Planned Total</p>
                  <p className="text-xl font-semibold">KSh {plannedTotal.toLocaleString()}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="allocatedWorker">Allocate Worker</Label>
                <Select
                  value={formData.allocatedManagerId || 'none'}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, allocatedManagerId: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select worker (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No assignment</SelectItem>
                    {operationsEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {emp.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only employees with Operations permission are shown
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional instructions or notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button type="button" onClick={handleNextStep} disabled={saving}>
              Next
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={saving}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Creating...' : 'Create Work Card'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
