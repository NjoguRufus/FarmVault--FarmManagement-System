import React, { useState, useMemo, useEffect } from 'react';
import { Calendar as CalendarIcon, User, Package, Plus, X, AlertTriangle } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { useQuery } from '@tanstack/react-query';
import {
  recordWork,
  editWork,
  recordInventoryUsageForWorkCard,
  type WorkCard,
  type InputUsed,
} from '@/services/operationsWorkCardService';
import { recordInventoryUsage, listInventoryStock, type InventoryStockRow } from '@/services/inventoryReadModelService';
import { createAdminAlert } from '@/services/adminAlertService';
import type { Employee } from '@/types';

interface RecordWorkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workCard: WorkCard | null;
  isEdit?: boolean;
  onSuccess?: () => void;
}

interface InputEntry {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  currentStock?: number;
}

export function RecordWorkModal({ open, onOpenChange, workCard, isEdit = false, onSuccess }: RecordWorkModalProps) {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';

  // Fetch employees
  const { data: employees = [] } = useCollection<Employee>('employees', 'employees', {
    companyScoped: true,
    companyId,
    isDeveloper,
  });

  // Fetch inventory items
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-stock', companyId],
    queryFn: () => listInventoryStock({ companyId: companyId! }),
    enabled: !!companyId,
  });

  const activeEmployees = useMemo(() => {
    return employees.filter(e => e.status === 'active');
  }, [employees]);

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    actualDate: new Date(),
    actualWorkers: 1,
    actualRatePerPerson: 0,
    workDone: '',
    executionNotes: '',
    workerIds: [] as string[],
  });
  const [inputs, setInputs] = useState<InputEntry[]>([]);
  const [showInputSelector, setShowInputSelector] = useState(false);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [inputQuantity, setInputQuantity] = useState('');

  // Initialize form when the modal opens or the target card changes.
  // Do not depend on `inventoryItems` here — React Query often returns a new array reference each render,
  // which would retrigger this effect and cause "Maximum update depth exceeded".
  const workCardId = workCard?.id;
  useEffect(() => {
    if (!open || !workCard) return;
    if (isEdit) {
      setFormData({
        actualDate: workCard.actualDate ? new Date(workCard.actualDate) : new Date(),
        actualWorkers: workCard.actualWorkers ?? 1,
        actualRatePerPerson: workCard.actualRatePerPerson ?? 0,
        workDone: workCard.workDone ?? '',
        executionNotes: workCard.executionNotes ?? '',
        workerIds: workCard.workerIds ?? [],
      });
      setInputs(
        workCard.inputsUsed?.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          quantity: i.quantity,
          unit: i.unit,
        })) ?? [],
      );
    } else {
      setFormData({
        actualDate: new Date(),
        actualWorkers: workCard.plannedWorkers,
        actualRatePerPerson: workCard.plannedRatePerPerson,
        workDone: '',
        executionNotes: '',
        workerIds: [],
      });
      setInputs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when dialog/card identity changes only; full workCard read intentionally
  }, [open, workCardId, isEdit]);

  // Merge live stock levels from inventory without resetting the whole form.
  useEffect(() => {
    if (!open || !workCardId) return;
    setInputs((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const next = prev.map((row) => {
        const stock = inventoryItems.find((inv) => inv.id === row.itemId)?.current_stock;
        const merged = stock ?? row.currentStock;
        if (merged === row.currentStock) return row;
        changed = true;
        return { ...row, currentStock: merged };
      });
      return changed ? next : prev;
    });
  }, [open, workCardId, inventoryItems]);

  const actualTotal = formData.actualWorkers * formData.actualRatePerPerson;

  const handleAddInput = () => {
    if (!selectedInputId || !inputQuantity) return;
    
    const item = inventoryItems.find(i => i.id === selectedInputId);
    if (!item) return;

    const qty = parseFloat(inputQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    setInputs(prev => [
      ...prev,
      {
        itemId: item.id,
        itemName: item.name,
        quantity: qty,
        unit: item.unit ?? 'units',
        currentStock: item.current_stock,
      },
    ]);

    setSelectedInputId('');
    setInputQuantity('');
    setShowInputSelector(false);
  };

  const handleRemoveInput = (index: number) => {
    setInputs(prev => prev.filter((_, i) => i !== index));
  };

  const handleWorkerToggle = (employeeId: string) => {
    setFormData(prev => ({
      ...prev,
      workerIds: prev.workerIds.includes(employeeId)
        ? prev.workerIds.filter(id => id !== employeeId)
        : [...prev.workerIds, employeeId],
    }));
  };

  const getWorkerNames = () => {
    return formData.workerIds
      .map(id => employees.find(e => e.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const hasLowStockWarning = inputs.some(i => 
    i.currentStock !== undefined && i.quantity > i.currentStock
  );

  const handleSubmit = async () => {
    if (!workCard) return;

    if (!formData.workDone.trim()) {
      toast.error('Please describe the work done');
      return;
    }

    if (formData.actualWorkers <= 0 || formData.actualRatePerPerson <= 0) {
      toast.error('Workers and rate must be greater than zero');
      return;
    }

    setSaving(true);
    try {
      const inputsUsed: InputUsed[] = inputs.map(i => ({
        itemId: i.itemId,
        itemName: i.itemName,
        quantity: i.quantity,
        unit: i.unit,
      }));

      const workerNames = getWorkerNames();

      if (isEdit) {
        await editWork({
          id: workCard.id,
          actualDate: format(formData.actualDate, 'yyyy-MM-dd'),
          actualWorkers: formData.actualWorkers,
          actualRatePerPerson: formData.actualRatePerPerson,
          workDone: formData.workDone.trim(),
          executionNotes: formData.executionNotes.trim() || null,
          workerIds: formData.workerIds,
          workerNames,
          inputsUsed,
          actorUserId: user?.id ?? '',
          actorUserName: user?.name ?? null,
        });
      } else {
        await recordWork({
          id: workCard.id,
          actualDate: format(formData.actualDate, 'yyyy-MM-dd'),
          actualWorkers: formData.actualWorkers,
          actualRatePerPerson: formData.actualRatePerPerson,
          workDone: formData.workDone.trim(),
          executionNotes: formData.executionNotes.trim() || null,
          workerIds: formData.workerIds,
          workerNames,
          inputsUsed,
          actorUserId: user?.id ?? '',
          actorUserName: user?.name ?? null,
        });
      }

      // Record inventory usage for each input
      for (const input of inputsUsed) {
        try {
          await recordInventoryUsage({
            companyId: companyId!,
            itemId: input.itemId,
            quantity: input.quantity,
            projectId: workCard.projectId ?? undefined,
            usedOn: format(formData.actualDate, 'yyyy-MM-dd'),
            purpose: `Work card: ${workCard.workTitle}`,
            notes: `Used for: ${formData.workDone}`,
          });
        } catch (err) {
          console.error('Failed to record inventory usage for', input.itemName, err);
        }
      }

      // Record in work card inventory usage table
      if (inputsUsed.length > 0) {
        await recordInventoryUsageForWorkCard({
          workCardId: workCard.id,
          companyId: companyId!,
          inputsUsed,
          actorUserId: user?.id ?? '',
          actorUserName: user?.name ?? null,
        });
      }

      // Create admin alert
      await createAdminAlert({
        companyId: companyId!,
        severity: 'normal',
        module: 'operations',
        action: isEdit ? 'WORK_EDITED' : 'WORK_LOGGED',
        actorUserId: user?.id ?? undefined,
        actorName: user?.name ?? undefined,
        targetId: workCard.id,
        targetLabel: workCard.workTitle,
        metadata: {
          workDone: formData.workDone,
          actualWorkers: formData.actualWorkers,
          inputsCount: inputsUsed.length,
        },
      });

      toast.success(isEdit ? 'Work updated successfully' : 'Work recorded successfully');
      onSuccess?.();
    } catch (error) {
      console.error('Failed to record work:', error);
      toast.error('Failed to record work');
    } finally {
      setSaving(false);
    }
  };

  if (!workCard) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Work' : 'Record Work'}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{workCard.workTitle}</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Work Done */}
          <div className="space-y-2">
            <Label htmlFor="workDone">Work Done Today *</Label>
            <Textarea
              id="workDone"
              placeholder="Describe the work completed..."
              value={formData.workDone}
              onChange={(e) => setFormData(prev => ({ ...prev, workDone: e.target.value }))}
              rows={3}
            />
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
                    !formData.actualDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.actualDate ? format(formData.actualDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.actualDate}
                  onSelect={(date) => date && setFormData(prev => ({ ...prev, actualDate: date }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Workers and Rate */}
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
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-xl font-semibold">KSh {actualTotal.toLocaleString()}</p>
            </div>
          )}

          {/* Inputs Used */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Inputs Used</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowInputSelector(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Input
              </Button>
            </div>

            {inputs.length > 0 && (
              <div className="space-y-2">
                {inputs.map((input, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      input.currentStock !== undefined && input.quantity > input.currentStock
                        ? 'border-amber-300 bg-amber-50'
                        : 'bg-muted/30'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-teal-600" />
                      <div>
                        <p className="font-medium text-sm">{input.itemName}</p>
                        <p className="text-xs text-muted-foreground">
                          {input.quantity} {input.unit}
                          {input.currentStock !== undefined && (
                            <span className="ml-2">
                              (Stock: {input.currentStock})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveInput(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {showInputSelector && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <Select value={selectedInputId} onValueChange={setSelectedInputId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select inventory item" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.current_stock} {item.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Quantity"
                    value={inputQuantity}
                    onChange={(e) => setInputQuantity(e.target.value)}
                    min={0}
                    step="0.01"
                  />
                  <Button type="button" onClick={handleAddInput}>
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowInputSelector(false);
                      setSelectedInputId('');
                      setInputQuantity('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {hasLowStockWarning && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  Some quantities exceed current stock. Entry will still be allowed.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Workers Involved */}
          <div className="space-y-2">
            <Label>Workers Involved</Label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border bg-muted/30 min-h-[60px]">
              {activeEmployees.map((emp) => (
                <Badge
                  key={emp.id}
                  variant={formData.workerIds.includes(emp.id) ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-colors',
                    formData.workerIds.includes(emp.id) && 'bg-primary'
                  )}
                  onClick={() => handleWorkerToggle(emp.id)}
                >
                  <User className="h-3 w-3 mr-1" />
                  {emp.name}
                </Badge>
              ))}
              {activeEmployees.length === 0 && (
                <p className="text-sm text-muted-foreground">No employees available</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="executionNotes">Notes</Label>
            <Textarea
              id="executionNotes"
              placeholder="Additional notes..."
              value={formData.executionNotes}
              onChange={(e) => setFormData(prev => ({ ...prev, executionNotes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Work' : 'Record Work'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
