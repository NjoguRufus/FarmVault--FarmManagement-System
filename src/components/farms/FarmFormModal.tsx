import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createFarm } from '@/services/farmsService';
import { useAuth } from '@/contexts/AuthContext';
import type { Farm, FarmOwnershipType } from '@/types';

interface FarmFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (farm: Farm) => void;
  initialName?: string;
}

export function FarmFormModal({ open, onOpenChange, onCreated, initialName = '' }: FarmFormModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [farmName, setFarmName] = useState(initialName);
  const [location, setLocation] = useState('');
  const [ownershipType, setOwnershipType] = useState<FarmOwnershipType>('owned');
  const [leaseCost, setLeaseCost] = useState('');
  const [leaseDuration, setLeaseDuration] = useState('');
  const [leaseDurationType, setLeaseDurationType] = useState<'months' | 'years'>('months');
  const [saving, setSaving] = useState(false);

  const leased = ownershipType === 'leased';
  const canSave = useMemo(() => {
    if (!farmName.trim() || !location.trim()) return false;
    if (!leased) return true;
    return Number(leaseCost) > 0 && Number(leaseDuration) > 0;
  }, [farmName, location, leased, leaseCost, leaseDuration]);

  const reset = () => {
    setFarmName(initialName);
    setLocation('');
    setOwnershipType('owned');
    setLeaseCost('');
    setLeaseDuration('');
    setLeaseDurationType('months');
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) return message;
    }
    return 'Could not create farm.';
  };

  const handleSave = async () => {
    if (!user?.companyId) {
      toast.error('No active company selected.');
      return;
    }
    if (!canSave || saving) return;

    setSaving(true);
    try {
      const farm = await createFarm({
        companyId: user.companyId,
        name: farmName.trim(),
        location: location.trim(),
        ownershipType,
        leaseCost: leased ? Number(leaseCost) : null,
        leaseDuration: leased ? Number(leaseDuration) : null,
        leaseDurationType: leased ? leaseDurationType : null,
      });
      await queryClient.invalidateQueries({ queryKey: ['farms', user.companyId] });
      onCreated?.(farm);
      toast.success('Farm created');
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Farm</DialogTitle>
          <DialogDescription>Add a farm for project selection.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="farm-name">Farm Name</Label>
            <Input
              id="farm-name"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              placeholder="e.g. North Block Farm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="farm-location">Location</Label>
            <Input
              id="farm-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Limuru, Kiambu"
            />
          </div>

          <div className="space-y-1">
            <Label>Ownership Type</Label>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="ownershipType"
                  checked={ownershipType === 'owned'}
                  onChange={() => setOwnershipType('owned')}
                />
                Owned
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="ownershipType"
                  checked={ownershipType === 'leased'}
                  onChange={() => setOwnershipType('leased')}
                />
                Leased
              </label>
            </div>
          </div>

          {leased && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="lease-cost">Lease Cost</Label>
                <Input
                  id="lease-cost"
                  type="number"
                  min={0}
                  value={leaseCost}
                  onChange={(e) => setLeaseCost(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lease-duration">Duration</Label>
                <Input
                  id="lease-duration"
                  type="number"
                  min={1}
                  value={leaseDuration}
                  onChange={(e) => setLeaseDuration(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lease-duration-type">Unit</Label>
                <select
                  id="lease-duration-type"
                  className="fv-select h-10 w-full"
                  value={leaseDurationType}
                  onChange={(e) => setLeaseDurationType(e.target.value as 'months' | 'years')}
                >
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave || saving}>
            {saving ? 'Saving...' : 'Save Farm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
