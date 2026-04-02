import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CropRecordRow, CropRecordDetail } from '@/services/recordsService';
import { getCropRecordDetail, listDeveloperNotebookCropsAll } from '@/services/recordsService';
import { fetchDeveloperCompanies } from '@/services/developerService';
import {
  useSendDeveloperCropRecord,
  useSendDeveloperCropRecordWithAttachments,
  useCreateDeveloperCropRecordTemplate,
} from '@/hooks/useRecordsNotebook';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarkdownContent } from '@/components/records/MarkdownContent';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type DeveloperNotebookTab = 'add' | 'sendExisting';

export type SendExistingNoteFormState = {
  companyId: string | null;
  cropId: string | 'all' | null;
  recordId: string | null;
};

export interface DeveloperNotebookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: CropRecordRow[];
  /** Open on Send existing tab with this record pre-selected (e.g. row action). */
  initialRecordId?: string | null;
  /** Default tab when opening without a pre-selected record. */
  initialTab?: DeveloperNotebookTab;
  sendButtonClassName?: string;
}

function mutationBusy(m: { isPending?: boolean; isLoading?: boolean }): boolean {
  return Boolean(m.isPending ?? m.isLoading);
}

export function DeveloperNotebookModal({
  open,
  onOpenChange,
  records,
  initialRecordId = null,
  initialTab = 'add',
  sendButtonClassName,
}: DeveloperNotebookModalProps) {
  const [tab, setTab] = useState<DeveloperNotebookTab>(initialTab);
  const [form, setForm] = useState<SendExistingNoteFormState>({
    companyId: null,
    cropId: 'all',
    recordId: null,
  });
  const [previewRecord, setPreviewRecord] = useState<CropRecordRow | null>(null);

  const [addCropId, setAddCropId] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addContent, setAddContent] = useState('');
  const [pushCompanyId, setPushCompanyId] = useState('');
  const [pushFiles, setPushFiles] = useState<File[]>([]);
  const [devNoteSaved, setDevNoteSaved] = useState(false);

  const seededForOpenCycleRef = useRef<string | null>(null);
  const prevDialogOpenRef = useRef(false);

  const companiesQuery = useQuery({
    queryKey: ['developer', 'notebook-modal', 'companies'],
    queryFn: () => fetchDeveloperCompanies({ limit: 500, offset: 0 }),
    enabled: open,
    staleTime: 60_000,
  });

  const cropsQuery = useQuery({
    queryKey: ['developer', 'notebook-modal', 'all-crops'],
    queryFn: listDeveloperNotebookCropsAll,
    enabled: open,
    staleTime: 60_000,
  });

  const companyItems = companiesQuery.data?.items ?? [];
  const systemCrops = cropsQuery.data ?? [];

  const sendMutation = useSendDeveloperCropRecord();
  const pushToCompanyMutation = useSendDeveloperCropRecordWithAttachments();
  const createDevTemplateMutation = useCreateDeveloperCropRecordTemplate();

  const resetSendForm = useCallback(() => {
    setForm({ companyId: null, cropId: 'all', recordId: null });
    setPreviewRecord(null);
  }, []);

  const resetAddForm = useCallback(() => {
    setAddTitle('');
    setAddContent('');
    setPushFiles([]);
    setAddCropId('');
    setPushCompanyId('');
    setDevNoteSaved(false);
  }, []);

  useEffect(() => {
    if (!open) {
      seededForOpenCycleRef.current = null;
      prevDialogOpenRef.current = false;
      return;
    }

    if (initialRecordId) {
      const r = records.find((x) => String(x.record_id) === String(initialRecordId));
      const seedKey = `id:${initialRecordId}`;
      if (r && seededForOpenCycleRef.current !== seedKey) {
        seededForOpenCycleRef.current = seedKey;
        setTab('sendExisting');
        setForm({
          companyId: String(r.company_id ?? '').trim() || null,
          cropId: String(r.crop_id ?? '').trim() || 'all',
          recordId: r.record_id,
        });
        setPreviewRecord(r);
      }
      prevDialogOpenRef.current = true;
      return;
    }

    const justOpened = !prevDialogOpenRef.current;
    prevDialogOpenRef.current = true;

    if (justOpened && seededForOpenCycleRef.current !== 'blank') {
      seededForOpenCycleRef.current = 'blank';
      setTab(initialTab);
      resetSendForm();
      resetAddForm();
    }
  }, [open, initialRecordId, records, initialTab, resetSendForm, resetAddForm]);

  const filteredRecords = useMemo(() => {
    if (!form.cropId || form.cropId === 'all') return records;
    return records.filter((r) => r.crop_id === form.cropId);
  }, [records, form.cropId]);

  const handleCompanyChange = (value: string) => {
    setForm((prev) => ({ ...prev, companyId: value || null }));
  };

  const handleCropFilterChange = (value: string) => {
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

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetSendForm();
      resetAddForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSendExisting = async () => {
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

  const handleSaveDeveloperNote = async () => {
    const cropId = addCropId.trim();
    const title = addTitle.trim();
    const content = addContent.trim();

    if (!cropId) {
      toast.error('Select a crop.');
      return;
    }
    if (!title || !content) {
      toast.error('Title and content are required.');
      return;
    }

    try {
      await createDevTemplateMutation.mutateAsync({ cropId, title, content });
      toast.success('Saved as a FarmVault developer note.');
      setDevNoteSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save developer note.');
    }
  };

  const handlePushToCompany = async () => {
    const companyId = pushCompanyId.trim();
    const cropId = addCropId.trim();
    const title = addTitle.trim();
    const content = addContent.trim();

    if (!companyId) {
      toast.error('Select a company to send to.');
      return;
    }
    if (!cropId || !title || !content) {
      toast.error('Crop, title, and content are required.');
      return;
    }

    try {
      await pushToCompanyMutation.mutateAsync({
        companyId,
        cropId,
        title,
        content,
        files: pushFiles,
      });
      toast.success('Note sent to company.');
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send to company.');
    }
  };

  const primaryClass = sendButtonClassName ?? 'bg-[#1F7A63] hover:bg-[#176553] text-white';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
        <DialogHeader>
          <DialogTitle>Developer notebook</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as DeveloperNotebookTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-10">
            <TabsTrigger value="add" className="text-sm">
              Add note
            </TabsTrigger>
            <TabsTrigger value="sendExisting" className="text-sm">
              Send existing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="mt-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              This is a <span className="font-medium text-foreground">FarmVault developer</span> note first (not tied to a
              tenant). Optionally push the same content into a company workspace below.
            </p>

            <div className="space-y-2">
              <Label>Crop</Label>
              <Select value={addCropId} onValueChange={setAddCropId} disabled={cropsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={cropsQuery.isLoading ? 'Loading crops…' : 'Select crop'} />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {systemCrops.map((c) => (
                    <SelectItem key={c.crop_id} value={c.crop_id}>
                      {c.crop_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cropsQuery.isError ? (
                <p className="text-xs text-red-600">Could not load system crops. Deploy migrations 20260402270000+.</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="Subject" />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                placeholder="Supports Markdown."
                rows={5}
                className="resize-y min-h-[100px]"
              />
            </div>

            {devNoteSaved ? (
              <p className="text-xs font-medium text-[#1F7A63]">Developer note saved. You can push to a company below.</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className={cn(primaryClass)}
                disabled={mutationBusy(createDevTemplateMutation)}
                onClick={() => void handleSaveDeveloperNote()}
              >
                {mutationBusy(createDevTemplateMutation) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save developer note
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Optional: send to a company</p>
              <p className="text-xs text-muted-foreground">
                Creates a record in that company&apos;s notebook using the crop, title, and content above. Attachments apply
                only to this company copy.
              </p>
              <div className="space-y-2">
                <Label>Company</Label>
                <Select value={pushCompanyId} onValueChange={setPushCompanyId} disabled={companiesQuery.isLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={companiesQuery.isLoading ? 'Loading…' : 'Select company'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {companyItems.map((co) => {
                      const id = String(co.company_id ?? co.id ?? '');
                      if (!id) return null;
                      return (
                        <SelectItem key={id} value={id}>
                          {co.company_name ?? co.name ?? id}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Attachments</Label>
                <Input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
                  className="cursor-pointer"
                  onChange={(e) => setPushFiles(Array.from(e.target.files ?? []))}
                />
                <p className="text-xs text-muted-foreground">Optional. JPG, PNG, WebP, PDF.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-[#1F7A63]/40 text-[#1F7A63] hover:bg-[#1F7A63]/10"
                disabled={mutationBusy(pushToCompanyMutation)}
                onClick={() => void handlePushToCompany()}
              >
                {mutationBusy(pushToCompanyMutation) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Send to company
              </Button>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Close
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="sendExisting" className="mt-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Copy an existing notebook entry into a company workspace. Companies match the developer Companies page;
              crops filter which records appear in the list.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Company</p>
                <Select
                  value={form.companyId ?? ''}
                  onValueChange={handleCompanyChange}
                  disabled={companiesQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {companyItems.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        {companiesQuery.isLoading ? 'Loading…' : 'No companies'}
                      </SelectItem>
                    ) : (
                      companyItems.map((co) => {
                        const id = String(co.company_id ?? co.id ?? '');
                        if (!id) return null;
                        return (
                          <SelectItem key={id} value={id}>
                            {co.company_name ?? co.name ?? id}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Target crop (filter)</p>
                <Select
                  value={form.cropId ?? 'all'}
                  onValueChange={handleCropFilterChange}
                  disabled={cropsQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All crops" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All crops</SelectItem>
                    {systemCrops.map((c) => (
                      <SelectItem key={c.crop_id} value={c.crop_id}>
                        {c.crop_name}
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
                  <SelectValue
                    placeholder={filteredRecords.length ? 'Select record' : 'No records for this filter'}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {filteredRecords.length === 0 ? (
                    <SelectItem value="__none_rec__" disabled>
                      No records for this crop filter
                    </SelectItem>
                  ) : (
                    filteredRecords
                      .filter((r) => String(r.record_id ?? '').trim() !== '')
                      .map((r) => (
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
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                  Select a record to preview before sending.
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground truncate">{previewRecord.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {previewRecord.crop_name} ·{' '}
                        {previewRecord.source_type === 'developer' ? 'Developer' : 'Company'}
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
                      content={previewRecord.content_preview || '*No preview*'}
                      className="prose-xs max-w-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className={cn(primaryClass)}
                disabled={mutationBusy(sendMutation)}
                onClick={() => void handleSendExisting()}
              >
                {mutationBusy(sendMutation) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Send to company
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
