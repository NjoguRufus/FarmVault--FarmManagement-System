import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NOTE_CATEGORIES } from '@/constants/notes';
import { MarkdownContent } from './MarkdownContent';
import type { NoteCategory } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface NoteFormValues {
  title: string;
  category: NoteCategory;
  content: string;
  highlights: string[];
  tags: string[];
  status?: 'draft' | 'published';
}

const defaultValues: NoteFormValues = {
  title: '',
  category: 'general',
  content: '',
  highlights: [],
  tags: [],
  status: 'draft',
};

export function NoteEditorModal({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  showStatus,
  title: modalTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<NoteFormValues> | null;
  onSubmit: (values: NoteFormValues) => Promise<void>;
  showStatus?: boolean;
  title?: string;
}) {
  const [form, setForm] = useState<NoteFormValues>({ ...defaultValues });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ...defaultValues,
        ...initialValues,
        highlights: initialValues?.highlights ?? [],
        tags: initialValues?.tags ?? [],
      });
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const highlightsText = (form.highlights ?? []).join('\n');
  const tagsText = (form.tags ?? []).join(', ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <div className="relative">
          <DialogHeader>
            <DialogTitle>{modalTitle ?? 'Edit Note'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Note title"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as NoteCategory }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showStatus && (
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status ?? 'draft'}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'draft' | 'published' }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Highlights (one per line)</Label>
              <Textarea
                value={highlightsText}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    highlights: e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="Key point 1&#10;Key point 2"
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Content (Markdown)</Label>
              <Tabs defaultValue="edit" className="mt-1">
                <TabsList>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="edit">
                  <Textarea
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    placeholder="Use **bold**, lists with -, and > ⚠️ for warnings."
                    rows={8}
                    className="font-mono text-sm"
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <ScrollArea className="h-[200px] rounded-md border p-3">
                    <MarkdownContent content={form.content} />
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
            <div>
              <Label>Tags (comma separated)</Label>
              <Input
                value={tagsText}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    tags: e.target.value.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="tag1, tag2"
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
