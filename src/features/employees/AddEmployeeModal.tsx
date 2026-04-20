/**
 * Modal to add an employee using addEmployee() (Clerk identity; Supabase data only).
 */
import React from 'react';
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { EMPLOYEE_ROLE_LABELS, EMPLOYEE_ROLES, PERMISSION_KEYS } from '@/config/accessControl';
import { useAddEmployeeForm } from './useAddEmployeeForm';
import { toast } from 'sonner';
import { AccessControlPermissionEditor } from '@/components/permissions/AccessControlPermissionEditor';
import { getPresetPermissions } from '@/lib/employees/permissionPresets';

interface AddEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddEmployeeModal({ open, onOpenChange, onSuccess }: AddEmployeeModalProps) {
  const { state, update, submit, reset, saving, error } = useAddEmployeeForm();
  const roleValue = state.role || state.permission_preset;
  const canEditPermissions = roleValue === 'custom' || roleValue === 'operations-manager';
  const allowedKeys = React.useMemo(
    () => new Set(Object.keys(state.permissions).filter((k) => state.permissions[k] === true)),
    [state.permissions]
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await submit();
    if (result?.success) {
      toast.success('Employee added');
      handleOpenChange(false);
      onSuccess?.();
    }
  };

  const canSubmit =
    !saving &&
    Boolean(state.email.trim()) &&
    Boolean(roleValue) &&
    (!canEditPermissions || allowedKeys.size > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-emp-name">Full name</Label>
            <Input
              id="add-emp-name"
              value={state.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-emp-email">Email</Label>
            <Input
              id="add-emp-email"
              type="email"
              value={state.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="jane@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-emp-phone">Phone</Label>
            <Input
              id="add-emp-phone"
              value={state.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+254 700 000 000"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={roleValue}
                onValueChange={(v) => {
                  const next = (v as any) || '';
                  update('role', next);
                  update('permission_preset', next || 'custom');
                  if (next === 'operations-manager') {
                    update('permissions', getPresetPermissions('operations-manager'));
                    return;
                  }
                  if (next !== 'custom') update('permissions', {});
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_ROLES.filter((r) => r !== 'custom').map((r) => (
                    <SelectItem key={r} value={r}>
                      {EMPLOYEE_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">{EMPLOYEE_ROLE_LABELS.custom}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-emp-dept">Department</Label>
              <Input
                id="add-emp-dept"
                value={state.department}
                onChange={(e) => update('department', e.target.value)}
                placeholder="General"
              />
            </div>
          </div>

          {canEditPermissions && (
            <div className="space-y-2">
              <Label>Access & permissions</Label>
              <p className="text-xs text-muted-foreground">
                Select the permissions this employee should have. Nothing is saved until you click Save.
              </p>
              <AccessControlPermissionEditor
                allowedKeys={allowedKeys}
                onChange={(next) => {
                  const flat: Record<string, boolean> = {};
                  PERMISSION_KEYS.forEach((k) => {
                    flat[k] = next.has(k);
                  });
                  update('permissions', flat);
                }}
              />
              {allowedKeys.size === 0 && (
                <p className="text-xs text-destructive">
                  Select at least one permission to continue.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? 'Saving…' : 'Save employee'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
