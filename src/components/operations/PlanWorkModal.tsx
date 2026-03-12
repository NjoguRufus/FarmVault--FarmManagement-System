import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, User, Briefcase, MapPin } from 'lucide-react';
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
import { listEmployees } from '@/services/employeesSupabaseService';
import { createWorkCard } from '@/services/operationsWorkCardService';
import type { Employee } from '@/types';

interface PlanWorkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
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

export function PlanWorkModal({ open, onOpenChange, onSuccess }: PlanWorkModalProps) {
  const { user } = useAuth();
  const { projects, activeProject } = useProject();
  const companyId = user?.companyId ?? null;

  // Fetch employees from Supabase
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', companyId],
    queryFn: () => listEmployees(companyId!),
    enabled: !!companyId,
  });

  // Filter employees who have operations.view or operations.recordDailyWork permission
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
      console.log('[PlanWorkModal] employees filtering', {
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
  const [formData, setFormData] = useState({
    projectId: activeProject?.id ?? '',
    workTitle: '',
    workCategory: '',
    plannedDate: new Date(),
    plannedWorkers: 1,
    plannedRatePerPerson: 0,
    allocatedManagerId: '',
    notes: '',
  });

  const selectedEmployee = useMemo(() => {
    return operationsEmployees.find(e => e.id === formData.allocatedManagerId);
  }, [operationsEmployees, formData.allocatedManagerId]);

  const plannedTotal = formData.plannedWorkers * formData.plannedRatePerPerson;

  const handleSubmit = async () => {
    if (!formData.projectId) {
      toast.error('Please select a project');
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

    setSaving(true);
    try {
      await createWorkCard({
        companyId: companyId!,
        projectId: formData.projectId,
        workTitle: formData.workTitle.trim(),
        workCategory: formData.workCategory,
        plannedDate: format(formData.plannedDate, 'yyyy-MM-dd'),
        plannedWorkers: formData.plannedWorkers,
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
      setFormData({
        projectId: activeProject?.id ?? '',
        workTitle: '',
        workCategory: '',
        plannedDate: new Date(),
        plannedWorkers: 1,
        plannedRatePerPerson: 0,
        allocatedManagerId: '',
        notes: '',
      });

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

        <div className="space-y-4 py-4">
          {/* Project Selection */}
          <div className="space-y-2">
            <Label htmlFor="project">Farm / Project *</Label>
            <Select
              value={formData.projectId}
              onValueChange={(v) => setFormData(prev => ({ ...prev, projectId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {p.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Work Name */}
          <div className="space-y-2">
            <Label htmlFor="workTitle">Work Name *</Label>
            <Input
              id="workTitle"
              placeholder="e.g., Apply DAP fertilizer to Field A"
              value={formData.workTitle}
              onChange={(e) => setFormData(prev => ({ ...prev, workTitle: e.target.value }))}
            />
          </div>

          {/* Work Type */}
          <div className="space-y-2">
            <Label htmlFor="workCategory">Work Type *</Label>
            <Select
              value={formData.workCategory}
              onValueChange={(v) => setFormData(prev => ({ ...prev, workCategory: v }))}
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

          {/* Date */}
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

          {/* Workers and Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plannedWorkers">Planned Workers</Label>
              <Input
                id="plannedWorkers"
                type="number"
                min={1}
                value={formData.plannedWorkers}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  plannedWorkers: parseInt(e.target.value) || 1 
                }))}
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

          {/* Planned Total */}
          {plannedTotal > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">Planned Total</p>
              <p className="text-xl font-semibold">KSh {plannedTotal.toLocaleString()}</p>
            </div>
          )}

          {/* Allocate Worker */}
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

          {/* Notes */}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create Work Card'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
