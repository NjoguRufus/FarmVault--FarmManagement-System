import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryStockRow } from '@/services/inventoryReadModelService';
import { recordInventoryUsage, logInventoryAuditEvent } from '@/services/inventoryReadModelService';
import { toast } from 'sonner';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import type { Project } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';

interface RecordUsageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  item?: InventoryStockRow | null;
  projects: Project[];
  onRecorded?: () => void;
}

export function RecordUsageModal({
  open,
  onOpenChange,
  companyId,
  item,
  projects,
  onRecorded,
}: RecordUsageModalProps) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [quantity, setQuantity] = useState('');
  const [projectId, setProjectId] = useState('');
  const [cropStage, setCropStage] = useState('');
  const [usedOn, setUsedOn] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const resolvePackageLabel = (packagingType: string | null | undefined, itemName: string | null | undefined) => {
    if (packagingType === 'sack') return 'sacks';
    if (packagingType === 'bottle') {
      return (itemName ?? '').toLowerCase().includes('drum') ? 'drums' : 'bottles';
    }
    if (packagingType === 'box') return 'boxes';
    if (packagingType === 'pack') return 'bottles';
    return 'items';
  };

  const toSingular = (label: string) => {
    if (label === 'bottles') return 'bottle';
    if (label === 'drums') return 'drum';
    if (label === 'sacks') return 'sack';
    if (label === 'boxes') return 'box';
    return 'item';
  };

  const availableStock = Number(item?.current_stock ?? 0);
  const quantityNumber = Number(quantity);
  const exceedsAvailableStock = Number.isFinite(quantityNumber) && quantityNumber > availableStock;
  const packageSize = Number(item?.unit_size ?? 1) > 0 ? Number(item?.unit_size) : 1;
  const packageUnitLabel = (item?.unit_size_label ?? item?.unit ?? 'units').trim();
  const packageLabel = resolvePackageLabel(item?.packaging_type, item?.name);
  const packageLabelSingular = toSingular(packageLabel);
  const availablePackageCount = packageSize > 0 ? availableStock / packageSize : 0;
  const availablePackageCountText = Number.isInteger(availablePackageCount)
    ? String(Math.floor(availablePackageCount))
    : availablePackageCount.toFixed(1).replace(/\.0$/, '');

  const normalizeStageLabel = (raw?: string | null) => {
    const value = (raw ?? '').trim();
    if (!value) return '';
    // Handles values like "t • Nursery/Seedling" from progress widgets.
    if (value.includes('•')) {
      const parts = value.split('•').map((p) => p.trim()).filter(Boolean);
      return parts[parts.length - 1] ?? value;
    }
    return value;
  };

  const resolveProjectStage = (project?: Project | null) => {
    if (!project) return '';
    return (
      normalizeStageLabel(project.currentStage) ||
      normalizeStageLabel(project.stageSelected) ||
      normalizeStageLabel(project.stageAutoDetected) ||
      ''
    );
  };

  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().slice(0, 10);
      setUsedOn(today);
      const selectedProject = projects.find((p) => p.id === projectId);
      if (selectedProject) {
        setCropStage(resolveProjectStage(selectedProject));
      } else if (!projectId && projects.length === 1) {
        // When there is only one relevant project, preselect and autofill stage.
        const onlyProject = projects[0];
        setProjectId(onlyProject.id);
        setCropStage(resolveProjectStage(onlyProject));
      }
    } else {
      setQuantity('');
      setProjectId('');
      setCropStage('');
      setPurpose('');
      setNotes('');
    }
  }, [open]);

  useEffect(() => {
    const effectiveProjectId = projectId === '__none__' ? '' : projectId;
    const selectedProject = projects.find((p) => p.id === effectiveProjectId);
    if (!selectedProject) {
      if (projectId === '__none__' || !projectId) {
        setCropStage('');
      }
      return;
    }
    setCropStage(resolveProjectStage(selectedProject));
  }, [projectId, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error('Quantity must be greater than zero.');
      return;
    }
    if (qty > availableStock) {
      toast.error(`Usage cannot exceed available stock (${availableStock.toLocaleString()} ${item.unit || 'units'}).`);
      return;
    }
    setSaving(true);
    try {
      const effectiveProjectId = projectId === '__none__' ? '' : projectId;
      await recordInventoryUsage({
        companyId,
        itemId: item.id,
        quantity: qty,
        projectId: effectiveProjectId || undefined,
        cropStage: cropStage || undefined,
        usedOn: usedOn || new Date().toISOString(),
        purpose: purpose || undefined,
        notes: notes || undefined,
      });

      await logInventoryAuditEvent({
        companyId,
        action: 'USAGE_RECORDED',
        inventoryItemId: item.id,
        itemName: item.name,
        quantity: qty,
        unit: item.unit || 'units',
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
        notes: notes || purpose || undefined,
        metadata: { 
          purpose: purpose || undefined,
          cropStage: cropStage || undefined,
        },
      });

      addNotification({
        title: 'Usage Recorded',
        message: `${user?.name ?? 'User'} used ${qty} ${item.unit || 'units'} of ${item.name}`,
        toastType: 'warning',
      });

      toast.success('Usage recorded.');
      onOpenChange(false);
      onRecorded?.();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[RecordUsageModal] error', error);
      }
      toast.error(error?.message || 'Failed to record usage.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Record Usage</DialogTitle>
        </DialogHeader>
        {item ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                Current: {item.current_stock.toLocaleString()} {item.unit}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Quantity (number of items)</label>
                <Input
                  type="number"
                  className="fv-input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min={0}
                  max={Math.max(0, Number(item.current_stock ?? 0))}
                  required
                />
                {packageSize > 0 && (
                  <p className="text-xs text-muted-foreground">
                    1 {packageLabelSingular} = {packageSize.toLocaleString()} {packageUnitLabel}
                  </p>
                )}
                {exceedsAvailableStock && (
                  <p className="text-xs text-destructive">
                    Usage cannot exceed available stock ({availablePackageCountText} {packageLabel} available).
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Used On</label>
                <Input
                  type="date"
                  className="fv-input"
                  value={usedOn}
                  onChange={(e) => setUsedOn(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Project (optional)</label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="fv-input">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Radix Select does not allow empty-string item values; treat "None" as undefined project */}
                    <SelectItem value="__none__">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Crop Stage (optional)</label>
                <Input
                  className="fv-input"
                  value={cropStage}
                  onChange={(e) => setCropStage(e.target.value)}
                  placeholder="e.g. Flowering, Fruiting"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Purpose</label>
              <Input
                className="fv-input"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Spray for pests, top dressing"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <Textarea
                className="fv-input resize-none"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes (block, weather, operator, etc.)"
              />
            </div>

            <DialogFooter>
              <button
                type="button"
                className="fv-btn fv-btn--secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="fv-btn fv-btn--primary"
              >
                {saving ? 'Saving…' : 'Record Usage'}
              </button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Select an item to record usage.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

