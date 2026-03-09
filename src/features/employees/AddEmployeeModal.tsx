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
import { EMPLOYEE_ROLE_LABELS, EMPLOYEE_ROLES } from '@/config/accessControl';
import { useAddEmployeeForm } from './useAddEmployeeForm';
import { toast } from 'sonner';

interface AddEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddEmployeeModal({ open, onOpenChange, onSuccess }: AddEmployeeModalProps) {
  const { state, update, submit, reset, saving, error } = useAddEmployeeForm();

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
                value={state.role || state.permission_preset}
                onValueChange={(v) => {
                  update('role', (v as any) || '');
                  update('permission_preset', (v as any) || 'viewer');
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
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add employee'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
