import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MarkdownContent } from './MarkdownContent';
import { RECORD_CATEGORIES } from '@/services/recordsService';
import type { RecordCategory } from '@/types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function parseChips(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface RecordEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'library' | 'company';
  cropId: string;
  cropName?: string;
  initial?: {
    id?: string;
    category: RecordCategory;
    title: string;
    content: string;
    highlights: string[];
    tags: string[];
    status?: 'draft' | 'published';
  };
  onSave: (data: {
    category: RecordCategory;
    title: string;
    content: string;
    highlights: string[];
    tags: string[];
    status?: 'draft' | 'published';
  }) => Promise<void>;
}

export function RecordEditorModal({
  open,
  onOpenChange,
  mode,
  cropId,
  cropName,
  initial,
  onSave,
}: RecordEditorModalProps) {
  const [category, setCategory] = useState<RecordCategory>(initial?.category ?? 'General');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [highlightsText, setHighlightsText] = useState(
    initial?.highlights?.join(', ') ?? ''
  );
  const [tagsText, setTagsText] = useState(initial?.tags?.join(', ') ?? '');
  const [status, setStatus] = useState<'draft' | 'published'>(initial?.status ?? 'draft');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setCategory(initial?.category ?? 'General');
      setTitle(initial?.title ?? '');
      setContent(initial?.content ?? '');
      setHighlightsText(initial?.highlights?.join(', ') ?? '');
      setTagsText(initial?.tags?.join(', ') ?? '');
      setStatus(initial?.status ?? 'draft');
    }
  }, [open, initial]);

  const highlights = useMemo(() => parseChips(highlightsText), [highlightsText]);
  const tags = useMemo(() => parseChips(tagsText), [tagsText]);

  const handleSubmit = async () => {
    const t = title.trim();
    if (!t) {
      toast.error('Title is required.');
      return;
    }
    if (!content.trim()) {
      toast.error('Content is required.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        category,
        title: t,
        content: content.trim(),
        highlights,
        tags,
        ...(mode === 'library' ? { status } : undefined),
      });
      toast.success('Record saved.');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? 'Edit record' : 'New record'}
            {cropName && ` · ${cropName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as RecordCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === 'library' && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as 'draft' | 'published')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Title</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 bg-background text-foreground"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Record title"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Highlights (comma or newline)</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 bg-background text-foreground resize-none"
              rows={2}
              value={highlightsText}
              onChange={(e) => setHighlightsText(e.target.value)}
              placeholder="Key point 1, Key point 2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Tags (comma or newline)</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 bg-background text-foreground"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="tag1, tag2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Content (Markdown)</label>
            <Tabs defaultValue="write">
              <TabsList>
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="mt-2">
                <textarea
                  className="w-full border rounded-md px-3 py-2 bg-background text-foreground font-mono text-sm resize-y min-h-[200px]"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="**Bold** and lists supported. Use > ⚠️ Important: for warnings."
                />
              </TabsContent>
              <TabsContent value="preview" className="mt-2 border rounded-md p-4 min-h-[200px] bg-muted/30">
                <MarkdownContent content={content || '*No content yet*'} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
