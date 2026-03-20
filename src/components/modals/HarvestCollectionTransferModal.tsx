import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

type TargetProject = {
  id: string;
  name: string;
};

interface HarvestCollectionTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProjectId: string;
  currentProjectName: string;
  targetProjects: TargetProject[];
  onSubmit: (params: { targetProjectId: string; reason: string | null }) => Promise<void>;
}

export function HarvestCollectionTransferModal({
  open,
  onOpenChange,
  currentProjectId,
  currentProjectName,
  targetProjects,
  onSubmit,
}: HarvestCollectionTransferModalProps) {
  const [targetProjectId, setTargetProjectId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTargetProjectId('');
    setReason('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  const availableTargets = useMemo(
    () => targetProjects.filter((project) => project.id !== currentProjectId),
    [targetProjects, currentProjectId],
  );

  const isValidTarget = availableTargets.some((project) => project.id === targetProjectId);
  const canSubmit = !submitting && isValidTarget;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!targetProjectId || targetProjectId === currentProjectId) {
      setError('Please choose a different project.');
      return;
    }
    if (!isValidTarget) {
      setError('Selected project is not available for transfer in this company.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const trimmedReason = reason.trim();
      await onSubmit({
        targetProjectId,
        reason: trimmedReason.length > 0 ? trimmedReason : null,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Transfer failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[95vw] sm:w-full border-emerald-900/40 bg-card/95 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Transfer Collection</DialogTitle>
          <DialogDescription>
            Move this harvest collection to another project within the same company. Entries and totals will remain intact.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Current project</Label>
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
              {currentProjectName || 'Current project'}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-target-project">Target project</Label>
            <Select value={targetProjectId} onValueChange={setTargetProjectId}>
              <SelectTrigger id="transfer-target-project" disabled={submitting}>
                <SelectValue placeholder="Select target project" />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableTargets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No other projects are available in this company.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-reason">Reason (optional)</Label>
            <Textarea
              id="transfer-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Add context for this project reassignment"
              maxLength={280}
              disabled={submitting}
              className="min-h-[96px]"
            />
          </div>

          <div className="rounded-md border border-emerald-800/30 bg-emerald-950/10 px-3 py-2 text-xs text-emerald-200">
            This action moves the collection to a different project. This does not delete entries or totals.
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transferring...
                </>
              ) : (
                'Transfer Collection'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
