import React, { useMemo, useState } from 'react';
import type { CropRecordRow, CropRecordDetail } from '@/services/recordsService';
import { getCropRecordDetail } from '@/services/recordsService';
import { useSendDeveloperCropRecord } from '@/hooks/useRecordsNotebook';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MarkdownContent } from '@/components/records/MarkdownContent';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export type SendExistingNoteFormState = {
  companyId: string | null;
  cropId: string | 'all' | null;
  recordId: string | null;
};

export interface SendExistingNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: CropRecordRow[];
}

export function SendExistingNoteModal({ open, onOpenChange, records }: SendExistingNoteModalProps) {
  const [form, setForm] = useState<SendExistingNoteFormState>({
    companyId: null,
    cropId: 'all',
    recordId: null,
  });
  const [previewRecord, setPreviewRecord] = useState<CropRecordRow | null>(null);

  const sendMutation = useSendDeveloperCropRecord();

  const companies = useMemo(
    () =>
      Array.from(
        new Map(
          records.map((r) => [
            r.company_id,
            {
              id: r.company_id,
              name: r.company_name ?? r.company_id,
            },
          ]),
        ).values(),
      ),
    [records],
  );

  const crops = useMemo(
    () =>
      Array.from(
        new Map(
          records.map((r) => [
            r.crop_id,
            {
              id: r.crop_id,
              name: r.crop_name,
            },
          ]),
        ).values(),
      ),
    [records],
  );

  const filteredRecords = useMemo(() => {
    if (!form.cropId || form.cropId === 'all') return records;
    return records.filter((r) => r.crop_id === form.cropId);
  }, [records, form.cropId]);

  const handleCompanyChange = (value: string) => {
    setForm((prev) => ({ ...prev, companyId: value || null }));
  };

  const handleCropChange = (value: string) => {
    const v = (value || 'all') as 'all' | string;
    setForm((prev) => ({
      ...prev,
      cropId: v,
      recordId: null,
    }));
    setPreviewRecord(null);
  };

  const handleRecordChange = (value: string) => {
    const id = value || null;
    setForm((prev) => ({ ...prev, recordId: id }));
    const row = filteredRecords.find((r) => r.record_id === id) ?? null;
    setPreviewRecord(row);
  };

  const resetState = () => {
    setForm({ companyId: null, cropId: 'all', recordId: null });
    setPreviewRecord(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const handleSend = async () => {
    const companyId = form.companyId?.trim() ?? '';
    const recordId = form.recordId?.trim() ?? '';

    if (!companyId) {
      toast.error('Select a target company.');
      return;
    }
    if (!recordId) {
      toast.error('Select a record to send.');
      return;
    }

    let detail: CropRecordDetail | null = null;
    try {
      detail = await getCropRecordDetail(recordId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error('Failed to load record detail.');
      return;
    }

    if (!detail) {
      toast.error('Record could not be loaded.');
      return;
    }

    try {
      await sendMutation.mutateAsync({
        companyId,
        cropId: detail.crop_id,
        title: detail.title,
        content: detail.content ?? '',
      });
      toast.success('Note sent to company.');
      handleClose(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to send note.';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send Existing Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Send an existing notebook entry into a company&apos;s records. Choose the destination company,
            target crop filter, and the specific note to share.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Company</p>
              <Select value={form.companyId ?? ''} onValueChange={handleCompanyChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.length === 0 ? (
                    <SelectItem value="" disabled>
                      No companies available
                    </SelectItem>
                  ) : (
                    companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Target crop</p>
              <Select value={form.cropId ?? 'all'} onValueChange={handleCropChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All crops" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All crops</SelectItem>
                  {crops.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Record</p>
            <Select value={form.recordId ?? ''} onValueChange={handleRecordChange}>
              <SelectTrigger>
                <SelectValue placeholder={filteredRecords.length ? 'Select record' : 'No records available'} />
              </SelectTrigger>
              <SelectContent>
                {filteredRecords.length === 0 ? (
                  <SelectItem value="" disabled>
                    No records for this crop filter
                  </SelectItem>
                ) : (
                  filteredRecords.map((r) => (
                    <SelectItem key={r.record_id} value={r.record_id}>
                      {r.title} — {r.crop_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            {!previewRecord ? (
              <div className="fv-card p-4 text-xs text-muted-foreground">
                Select a record to preview its content before sending.
              </div>
            ) : (
              <div className="fv-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground truncate">{previewRecord.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {previewRecord.crop_name} ·{' '}
                      {previewRecord.source_type === 'developer' ? 'Developer note' : 'Company note'}
                    </p>
                  </div>
                  {previewRecord.attachments_count > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {previewRecord.attachments_count} attachment
                      {previewRecord.attachments_count === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
                <div className="border-t pt-2">
                  <MarkdownContent
                    content={previewRecord.content_preview || '*No preview content available*'}
                    className="prose-xs max-w-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sendMutation.isLoading}>
            {sendMutation.isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

