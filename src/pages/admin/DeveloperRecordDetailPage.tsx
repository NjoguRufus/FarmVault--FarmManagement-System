import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Pencil, Paperclip, Image as ImageIcon } from 'lucide-react';
import { useCropRecordDetail, useUpdateCropRecord } from '@/hooks/useRecordsNotebook';
import { MarkdownContent } from '@/components/records/MarkdownContent';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { uploadRecordAttachment, addCropRecordAttachment } from '@/services/recordsService';

function sourceBadge(source: 'company' | 'developer') {
  if (source === 'developer') {
    return (
      <span className="fv-badge text-[11px] bg-primary/10 text-primary border-primary/40">
        Developer note
      </span>
    );
  }
  return (
    <span className="fv-badge text-[11px] bg-emerald-50 text-emerald-700 border-emerald-300">
      Company note
    </span>
  );
}

export default function DeveloperRecordDetailPage() {
  const navigate = useNavigate();
  const params = useParams<{ cropId?: string; recordId?: string }>();
  const recordId = params.recordId ?? params.cropId;

  const { data, isLoading, isError } = useCropRecordDetail(recordId);
  const update = useUpdateCropRecord(recordId ?? '');

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const [attachOpen, setAttachOpen] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);

  React.useEffect(() => {
    if (data && editOpen) {
      setEditTitle(data.title ?? '');
      setEditContent(data.content ?? '');
    }
  }, [data, editOpen]);

  const handleSaveEdit = async () => {
    if (!data) return;
    const t = editTitle.trim();
    const c = editContent.trim();
    if (!t || !c) {
      toast.error('Title and content are required.');
      return;
    }
    try {
      await update.mutateAsync({ title: t, content: c });
      toast.success('Note updated.');
      setEditOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast.error('Failed to update note.');
    }
  };

  const handleAddAttachment = async () => {
    if (!data) return;
    if (!files || files.length === 0) {
      toast.error('Select at least one file.');
      return;
    }
    try {
      setUploading(true);
      const companyId = data.company_id;
      const cropId = data.crop_id;
      const total = files.length;
      let index = 0;
      // eslint-disable-next-line no-restricted-syntax
      for (const file of Array.from(files)) {
        index += 1;
        setUploadProgressText(`Uploading ${index} of ${total}…`);
        const uploaded = await uploadRecordAttachment(
          file,
          'developer',
          companyId,
          cropId,
          data.record_id,
        );
        await addCropRecordAttachment(data.record_id, uploaded.fileUrl, uploaded.fileName, uploaded.fileType);
      }
      toast.success('Attachment(s) added.');
      setFiles(null);
      setAttachOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to add attachment.';
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadProgressText(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {isLoading ? (
        <div className="fv-card p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !data ? (
        <div className="fv-card p-8 text-sm text-red-500">
          Failed to load record. It may have been deleted.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-foreground">{data.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">
                  {data.crop_name}
                </span>
                {sourceBadge(data.source_type)}
                {data.company_name && (
                  <span className="px-2 py-0.5 rounded bg-muted/70">
                    {data.company_name}
                  </span>
                )}
                {data.created_at && (
                  <span>Created {new Date(data.created_at).toLocaleString()}</span>
                )}
                {data.updated_at && data.updated_at !== data.created_at && (
                  <span>Updated {new Date(data.updated_at).toLocaleString()}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAttachOpen(true)}
              >
                <Paperclip className="h-4 w-4 mr-1" />
                Add Attachment
              </Button>
            </div>
          </div>

          <div className="fv-card p-4">
            <MarkdownContent content={data.content || '*No content provided*'} />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
            {data.attachments.length === 0 ? (
              <div className="fv-card p-4 text-xs text-muted-foreground">
                No attachments yet. You can link images, PDFs, or other files using URLs.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.attachments.map((att) => {
                  const isImage = (att.file_type ?? '').startsWith('image/');
                  return (
                    <a
                      key={att.id}
                      href={att.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="fv-card p-3 flex gap-3 items-start hover:border-primary/30 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={att.file_url} alt={att.file_name ?? 'Attachment'} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {att.file_name || 'Attachment'}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {att.file_type || 'File'}
                        </div>
                        {att.created_at && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Added {new Date(att.created_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Note</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title"
                />
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={update.isLoading}>
                  {update.isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Attachment</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Upload images (JPG, PNG, WEBP) or PDFs. Files will be stored securely in FarmVault and linked to this note.
                </p>
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setFiles(e.target.files)}
                  className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted"
                />
                {uploadProgressText && (
                  <p className="text-[11px] text-muted-foreground">{uploadProgressText}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAttachOpen(false)} disabled={uploading}>
                  Cancel
                </Button>
                <Button onClick={handleAddAttachment} disabled={uploading}>
                  {uploading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

