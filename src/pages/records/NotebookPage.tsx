import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Paperclip, Save } from "lucide-react";
import { db, requireCompanyId } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useCompanyScope } from "@/hooks/useCompanyScope";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchDeveloperCompanies } from "@/services/developerService";
import type { NoteAttachmentLayout } from "@/components/records/DraggableAttachment";
import { DraggableAttachment } from "@/components/records/DraggableAttachment";
import { StructuredNotePreview } from "@/components/records/StructuredNotePreview";
import { SmartRichNotesEditor } from "@/components/records/SmartRichNotesEditor";
import { parseNotebookContentToBlocks } from "@/lib/notebook/parseNotebookContentToBlocks";
import { htmlToPlainText } from "@/lib/notebook/htmlToPlainText";
import "./notebookPage.css";

type FarmNotebookEntryRow = {
  id: string;
  company_id: string | null;
  crop_slug: string | null;
  title: string | null;
  content: string | null;
  attachments: unknown | null;
  structured_blocks?: unknown | null;
  raw_text?: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  source?: string | null;
  source_note_id?: string | null;
  is_admin_note?: boolean | null;
  sent_by_developer?: boolean | null;
  developer_updated?: boolean | null;
};

export default function NotebookPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cropSlug: rawCropSlug, noteId: rawNoteId } = useParams();
  const cropSlug = decodeURIComponent(String(rawCropSlug ?? "")).trim();
  const noteIdParam = rawNoteId ? decodeURIComponent(String(rawNoteId)) : null;

  const { user } = useAuth();
  const scope = useCompanyScope();
  const isDeveloperRoute = location.pathname.startsWith("/developer/records");

  const [noteId, setNoteId] = useState<string | null>(noteIdParam && noteIdParam !== "new" ? noteIdParam : null);
  const [loading, setLoading] = useState<boolean>(() => !!noteIdParam && noteIdParam !== "new");
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [attachments, setAttachments] = useState<NoteAttachmentLayout[]>([]);
  const [uploading, setUploading] = useState(false);
  const [developerCompanyId, setDeveloperCompanyId] = useState<string>("");
  const [currentNoteCompanyId, setCurrentNoteCompanyId] = useState<string | null>(null);
  const [noteSource, setNoteSource] = useState<string | null>(null);
  const [editorHydrate, setEditorHydrate] = useState(0);

  const lastSavedRef = useRef<{ title: string; content: string; attachmentsKey: string } | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function newAttachmentId() {
    // crypto.randomUUID is widely supported in modern browsers; fallback for older environments
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeAttachments(raw: unknown): NoteAttachmentLayout[] {
    if (!Array.isArray(raw)) return [];
    const out: NoteAttachmentLayout[] = [];
    for (const item of raw) {
      if (typeof item === "string") {
        out.push({
          id: newAttachmentId(),
          url: item,
          x: 40,
          y: 40,
          width: 180,
          height: 140,
          rotation: 0,
          zIndex: 1,
        });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const anyItem = item as any;
      const url = String(anyItem.url ?? anyItem.publicUrl ?? anyItem.path ?? "");
      if (!url) continue;
      out.push({
        id: String(anyItem.id ?? newAttachmentId()),
        url,
        x: Number.isFinite(anyItem.x) ? Number(anyItem.x) : 40,
        y: Number.isFinite(anyItem.y) ? Number(anyItem.y) : 40,
        width: Number.isFinite(anyItem.width) ? Number(anyItem.width) : 180,
        height: Number.isFinite(anyItem.height) ? Number(anyItem.height) : 140,
        rotation: Number.isFinite(anyItem.rotation) ? Number(anyItem.rotation) : 0,
        zIndex: Number.isFinite(anyItem.zIndex) ? Number(anyItem.zIndex) : 1,
      });
    }
    return out;
  }

  useEffect(() => {
    document.body.classList.add("fv-notebook-fullwidth");
    return () => {
      document.body.classList.remove("fv-notebook-fullwidth");
    };
  }, []);

  const companiesQuery = useMemo(() => isDeveloperRoute, [isDeveloperRoute]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companiesQuery) return;
      try {
        const res = await fetchDeveloperCompanies({ limit: 500, offset: 0 });
        const items = res.items ?? [];
        const mapped = items
          .map((c: any) => {
            const id = String(c.company_id ?? c.id ?? "").trim();
            if (!id) return null;
            return { id, name: String(c.company_name ?? c.name ?? id) };
          })
          .filter(Boolean) as Array<{ id: string; name: string }>;
        if (!cancelled) setCompanies(mapped);
      } catch {
        if (!cancelled) setCompanies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companiesQuery]);

  const companyNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of companies) {
      if (!c?.id) continue;
      m[String(c.id)] = String(c.name ?? c.id);
    }
    return m;
  }, [companies]);

  const developerNoteCompanyId = useMemo(() => {
    if (!isDeveloperRoute) return null;
    const v = String(currentNoteCompanyId ?? developerCompanyId ?? "").trim();
    return v ? v : null;
  }, [currentNoteCompanyId, developerCompanyId, isDeveloperRoute]);

  const developerNoteCompanyName = useMemo(() => {
    if (!developerNoteCompanyId) return null;
    return companyNameById[developerNoteCompanyId] ?? developerNoteCompanyId;
  }, [companyNameById, developerNoteCompanyId]);

  const companyId = useMemo(() => {
    if (isDeveloperRoute) {
      const v = developerCompanyId.trim();
      return v ? v : null;
    }
    if (scope.error) return null;
    try {
      return requireCompanyId(scope.companyId);
    } catch {
      return null;
    }
  }, [scope.companyId, scope.error, isDeveloperRoute, developerCompanyId]);

  useEffect(() => {
    setNoteId(noteIdParam && noteIdParam !== "new" ? noteIdParam : null);
  }, [noteIdParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!noteIdParam) {
        setLoading(false);
        lastSavedRef.current = { title: "", content: "", attachmentsKey: "[]" };
        setEditorHydrate((n) => n + 1);
        return;
      }
      if (noteIdParam === "new") {
        setLoading(false);
        setSaveError(null);
        setTitle("");
        setContent("");
        setAttachments([]);
        setNoteSource(null);
        setNoteId(null);
        lastSavedRef.current = { title: "", content: "", attachmentsKey: "[]" };
        setEditorHydrate((n) => n + 1);
        return;
      }
      try {
        setLoading(true);
        setSaveError(null);
        if (!cropSlug) throw new Error("Missing crop.");

        const base = db
          .public()
          .from("farm_notebook_entries")
          .select("*")
          .eq("id", noteIdParam)
          .eq("crop_slug", cropSlug);

        const { data, error } = isDeveloperRoute
          ? await base.maybeSingle()
          : await base.eq("company_id", companyId).maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Note not found.");

        const row = data as FarmNotebookEntryRow;
        if (cancelled) return;
        setTitle(row.title ?? "");
        setContent(row.content ?? "");
        const nextAttachments = normalizeAttachments(row.attachments);
        setAttachments(nextAttachments);
        setNoteSource(row.source ? String(row.source) : null);
        if (isDeveloperRoute && row.company_id) {
          setDeveloperCompanyId(String(row.company_id));
        }
        if (isDeveloperRoute) {
          setCurrentNoteCompanyId(row.company_id ? String(row.company_id) : null);
        }
        lastSavedRef.current = {
          title: row.title ?? "",
          content: row.content ?? "",
          attachmentsKey: JSON.stringify(nextAttachments),
        };
        setEditorHydrate((n) => n + 1);

        // Reset "updated" flag after developer opens the note
        if (isDeveloperRoute && row.developer_updated === true) {
          void (async () => {
            try {
              await db.public().from("farm_notebook_entries").update({ developer_updated: false }).eq("id", row.id);
            } catch {
              // non-blocking
            }
          })();
        }
      } catch (e) {
        if (!cancelled) {
          setSaveError(e instanceof Error ? e.message : "Failed to load note.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [noteIdParam, companyId, cropSlug, isDeveloperRoute]);

  async function uploadNoteAttachment(file: File) {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
    const filePath = `notes/${fileName}`;

    const { error } = await supabase.storage.from("farm-notes").upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage.from("farm-notes").getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function handleAttachments(files: File[]) {
    const uploads: NoteAttachmentLayout[] = [];

    for (const file of files) {
      const url = await uploadNoteAttachment(file);
      uploads.push({
        id: newAttachmentId(),
        url,
        x: 40,
        y: 40,
        width: 180,
        height: 140,
        rotation: 0,
        zIndex: 1,
      });
    }

    return uploads;
  }

  const onAttachmentsSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const newOnes = await handleAttachments(files);
      if (newOnes.length) {
        setAttachments((prev) => {
          const maxZ = prev.reduce((m, a) => Math.max(m, a.zIndex || 1), 1);
          return [...prev, ...newOnes.map((a, idx) => ({ ...a, zIndex: maxZ + idx + 1 }))];
        });
        toast.success("Uploaded attachments");
      }
    } catch {
      toast.error("Attachment upload failed. Check storage bucket.");
    } finally {
      setUploading(false);
      // allow selecting same file again
      e.target.value = "";
    }
  };

  const attachmentsKey = useMemo(() => JSON.stringify(attachments ?? []), [attachments]);

  const bringFront = useCallback((id: string) => {
    setAttachments((prev) => {
      const maxZ = prev.reduce((m, a) => Math.max(m, a.zIndex || 1), 1);
      return prev.map((a) => (a.id === id ? { ...a, zIndex: maxZ + 1 } : a));
    });
  }, []);

  const updateAttachment = useCallback((next: NoteAttachmentLayout) => {
    setAttachments((prev) => prev.map((a) => (a.id === next.id ? next : a)));
  }, []);

  const deleteAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const saveNote = async (opts?: { showToast?: boolean }) => {
    if (!isDeveloperRoute && scope.error) return;
    if (!companyId) return;
    if (!cropSlug) return;
    if (!user?.id) return;

    const nextTitle = title;
    const nextContent = content;
    const last = lastSavedRef.current;

    if (last && last.title === nextTitle && last.content === nextContent && last.attachmentsKey === attachmentsKey)
      return;
    if (inflightRef.current) return;

    setSaving(true);
    setSaveError(null);

    const plainBody = htmlToPlainText(nextContent);
    const structuredBlocks = parseNotebookContentToBlocks(plainBody);

    const run = (async () => {
      try {
        if (!noteId) {
          const { data, error } = await db
            .public()
            .from("farm_notebook_entries")
            .insert({
              company_id: companyId,
              crop_slug: cropSlug,
              title: nextTitle,
              content: nextContent,
              raw_text: plainBody,
              structured_blocks: structuredBlocks,
              attachments,
              created_by: isDeveloperRoute ? "developer" : user.id,
            })
            .select("id")
            .single();

          if (error) throw error;
          const createdId = String((data as any)?.id ?? "");
          if (!createdId) throw new Error("Insert succeeded but no id returned.");

          setNoteId(createdId);
          // Replace URL so refresh lands on the existing note.
          navigate(
            `${isDeveloperRoute ? "/developer/records" : "/records"}/${encodeURIComponent(cropSlug)}/${encodeURIComponent(createdId)}`,
            { replace: true },
          );
        } else {
          const { error } = await db
            .public()
            .from("farm_notebook_entries")
            .update({
              title: nextTitle,
              content: nextContent,
              raw_text: plainBody,
              structured_blocks: structuredBlocks,
              attachments,
              ...(isDeveloperRoute ? { developer_updated: true } : null),
            })
            .eq("id", noteId);

          if (error) throw error;
        }

        lastSavedRef.current = { title: nextTitle, content: nextContent, attachmentsKey };
        if (opts?.showToast) {
          toast.success("Saved");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to save note.";
        setSaveError(msg);
      } finally {
        setSaving(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = run;
    await run;
  };

  const sendToCompany = async () => {
    if (!isDeveloperRoute) return;
    const targetCompanyId = developerCompanyId.trim();
    if (!targetCompanyId) {
      toast.error("Select a company to send to.");
      return;
    }
    if (!noteId) {
      toast.error("Save the note first.");
      return;
    }

    const { data: existing, error: existsErr } = await db
      .public()
      .from("farm_notebook_entries")
      .select("id")
      .eq("source_note_id", noteId)
      .eq("company_id", targetCompanyId)
      .maybeSingle();
    if (existsErr) {
      toast.error(existsErr.message || "Failed to check existing copy.");
      return;
    }
    if (existing?.id) {
      toast.message("Already sent", { description: "This note was already sent to that company." });
      return;
    }

    const { error } = await db.public().from("farm_notebook_entries").insert({
      company_id: targetCompanyId,
      crop_slug: cropSlug,
      title,
      content,
      raw_text: htmlToPlainText(content),
      structured_blocks: parseNotebookContentToBlocks(htmlToPlainText(content)),
      attachments,
      created_by: "developer",
      source: "developer",
      source_note_id: noteId,
      sent_by_developer: true,
      developer_updated: false,
      is_admin_note: true,
    });
    if (error) {
      toast.error(error.message || "Failed to send to company.");
      return;
    }
    toast.success("Sent to company.");
  };

  // Auto-save drafts while typing (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      void saveNote({ showToast: false });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, attachmentsKey]);

  const structuredPreviewBlocks = useMemo(
    () => parseNotebookContentToBlocks(htmlToPlainText(content)),
    [content],
  );

  const headerSubtitle = useMemo(() => {
    if (saving) return "Saving…";
    if (saveError) return "Save failed";
    return noteId ? "All changes saved" : "Draft";
  }, [saving, saveError, noteId]);

  if (loading) {
    return (
      <div className="min-h-[70vh] rounded-2xl border border-border/60 bg-background/40 p-10 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading note…
      </div>
    );
  }

  return (
    <div className="notebook-shell notes-editor-wrapper">
      <div className="notebook-topbar">
        <Button
          variant="ghost"
          className="rounded-xl"
          onClick={() =>
            navigate(`${isDeveloperRoute ? "/developer/records" : "/records"}/${encodeURIComponent(cropSlug)}`)
          }
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="min-w-0 flex-1 px-2">
          <div className="text-xs text-muted-foreground truncate">{cropSlug}</div>
          <div
            className={cn(
              "text-xs font-medium truncate",
              saveError ? "text-red-600 dark:text-red-300" : "text-muted-foreground",
            )}
          >
            {headerSubtitle}
          </div>
        </div>

        {isDeveloperRoute && developerNoteCompanyName ? (
          <div className="developer-company-chip" title={developerNoteCompanyName}>
            {developerNoteCompanyName}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          {isDeveloperRoute ? (
            <Select value={developerCompanyId} onValueChange={setDeveloperCompanyId}>
              <SelectTrigger className="w-[220px] rounded-xl">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {isDeveloperRoute ? (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => void sendToCompany()}
              disabled={!developerCompanyId.trim() || saving}
              title={
                currentNoteCompanyId && developerCompanyId.trim() === currentNoteCompanyId
                  ? "This note already belongs to that company (will create a copy)."
                  : "Copy this note into the selected company."
              }
            >
              Send to Company
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || saving || (!isDeveloperRoute && scope.error != null) || !companyId}
          >
            <Paperclip className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : "Attach"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onAttachmentsSelected}
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          />
          <Button
            className="rounded-xl"
            onClick={() => void saveNote({ showToast: true })}
            disabled={saving || (!isDeveloperRoute && scope.error != null) || !companyId}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {saveError ? (
        <div className="notebook-error">
          {saveError}
        </div>
      ) : null}

      <div className="notebook-page notes-editor">
        {isDeveloperRoute && developerNoteCompanyName ? (
          <div className="developer-ribbon">{developerNoteCompanyName}</div>
        ) : null}
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          inputMode="text"
        />

        <div ref={canvasRef} className="note-canvas">
          <SmartRichNotesEditor
            className="notebook-textarea-wrap"
            value={content}
            onChange={setContent}
            hydrateNonce={editorHydrate}
            placeholder="Start writing…"
          />

          {attachments.map((a) => (
            <DraggableAttachment
              key={a.id}
              attachment={a}
              containerRef={canvasRef}
              onChange={updateAttachment}
              onDelete={deleteAttachment}
              onBringFront={bringFront}
            />
          ))}
        </div>

        <div className="notebook-smart-preview">
          <div className="notebook-smart-preview-title">Structured preview</div>
          <div className="notebook-smart-preview-body notebook-structured-preview-body">
            <StructuredNotePreview blocks={structuredPreviewBlocks} />
          </div>
        </div>
      </div>
    </div>
  );
}

