import React, { useEffect, useState } from 'react';
import { ShieldCheck, Clock4, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  grantSubscriptionOverride,
  removeSubscriptionOverride,
  getCompanySubscription,
  type CompanySubscriptionRecord,
} from '@/services/subscriptionAdminService';

export interface OverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  companyName?: string | null;
}

export function OverrideModal({
  open,
  onOpenChange,
  companyId,
  companyName,
}: OverrideModalProps) {
  const [type, setType] = useState<'full_free' | 'timed_free'>('timed_free');
  const [duration, setDuration] = useState<'7' | '14' | '30' | 'custom'>('7');
  const [customDays, setCustomDays] = useState<string>('30');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<CompanySubscriptionRecord | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);

  useEffect(() => {
    if (open && companyId) {
      setInitialLoading(true);
      getCompanySubscription(companyId)
        .then((rec) => setRecord(rec))
        .finally(() => setInitialLoading(false));
    }
  }, [open, companyId]);

  const handleClose = () => {
    if (loading) return;
    onOpenChange(false);
  };

  const parseDurationDays = (): number => {
    if (duration === '7') return 7;
    if (duration === '14') return 14;
    if (duration === '30') return 30;
    const value = parseInt(customDays || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 30;
  };

  const handleGrant = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      await grantSubscriptionOverride({
        companyId,
        type,
        durationDays: parseDurationDays(),
        note: note.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      await removeSubscriptionOverride(companyId);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const hasActiveOverride = !!record?.override?.enabled;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Grant subscription override
          </DialogTitle>
          <DialogDescription>
            Temporarily unlock all features for{' '}
            <span className="font-medium text-foreground">
              {companyName || companyId}
            </span>
            . Use overrides sparingly.
          </DialogDescription>
        </DialogHeader>
        {initialLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading current override…</p>
        ) : (
          <div className="space-y-4">
            {hasActiveOverride && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                <Clock4 className="h-4 w-4 mt-0.5" />
                <div>
                  <p className="font-semibold">Active override</p>
                  <p className="mt-0.5">
                    Ends{' '}
                    {record?.override?.endAt?.toDate
                      ? record.override.endAt.toDate().toLocaleString()
                      : 'soon'}
                    .
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Override type</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`fv-chip ${type === 'timed_free' ? 'fv-chip--selected' : ''}`}
                  onClick={() => setType('timed_free')}
                >
                  Timed free access
                </button>
                <button
                  type="button"
                  className={`fv-chip ${type === 'full_free' ? 'fv-chip--selected' : ''}`}
                  onClick={() => setType('full_free')}
                >
                  Full free (all features)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Duration</p>
              <div className="grid grid-cols-4 gap-2">
                {(['7', '14', '30', 'custom'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`fv-chip ${duration === d ? 'fv-chip--selected' : ''}`}
                    onClick={() => setDuration(d)}
                  >
                    {d === 'custom' ? 'Custom' : `${d} days`}
                  </button>
                ))}
              </div>
              {duration === 'custom' && (
                <div className="mt-2">
                  <input
                    type="number"
                    min={1}
                    className="fv-input h-8 text-sm max-w-[120px]"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    placeholder="Days"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Reason / note (required for audits)
              </label>
              <textarea
                className="fv-input min-h-[70px] resize-y text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why you granted this override, e.g. onboarding, sales demo, support…"
              />
            </div>
          </div>
        )}
        <DialogFooter className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {hasActiveOverride ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleRemove}
              disabled={loading}
            >
              <XCircle className="h-3.5 w-3.5" />
              Remove override
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Only developers can see and manage overrides.
            </span>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="fv-btn fv-btn--secondary text-xs"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="fv-btn fv-btn--primary text-xs"
              onClick={handleGrant}
              disabled={loading || !companyId}
            >
              {loading ? 'Saving…' : 'Save override'}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

