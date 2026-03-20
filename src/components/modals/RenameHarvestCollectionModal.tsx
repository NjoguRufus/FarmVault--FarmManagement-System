import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MouseEvent } from 'react';

interface RenameHarvestCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onSave: (nextName: string) => Promise<void>;
}

export function RenameHarvestCollectionModal({
  open,
  onOpenChange,
  currentName,
  onSave,
}: RenameHarvestCollectionModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(currentName ?? '');
    setError(null);
    setSubmitting(false);
  }, [open, currentName]);

  useEffect(() => {
    if (!open) return;
    // Autofocus on open for faster correction of misnaming mistakes.
    inputRef.current?.focus();
    inputRef.current?.select?.();
  }, [open]);

  const trimmed = useMemo(() => name.trim(), [name]);
  const canSave = trimmed.length > 0 && trimmed.length <= 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const next = name.trim();
    if (!next) {
      setError('Name cannot be empty.');
      return;
    }
    if (next.length > 100) {
      setError('Maximum length is 100 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSave(next);
      onOpenChange(false);
    } catch (err: unknown) {
      // Keep modal open; parent is responsible for toasts on server errors.
      const message = (err as { message?: string })?.message ?? 'Rename failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (submitting) {
      e.preventDefault();
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Rename Collection</DialogTitle>
          <DialogDescription>You can update the name of this harvest collection.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              maxLength={100}
              autoFocus
            />
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>{trimmed.length > 0 ? `${trimmed.length}/100` : ' '}</span>
              {!canSave && trimmed.length > 0 && trimmed.length > 100 ? <span className="text-destructive">Too long</span> : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancelClick} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

