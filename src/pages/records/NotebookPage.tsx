import { useEffect, useMemo, useRef, useState } from "react";
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
import "./notebookPage.css";

type FarmNotebookEntryRow = {
  id: string;
  company_id: string | null;
  crop_slug: string | null;
  title: string | null;
  content: string | null;
  attachments: unknown | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  source?: string | null;
  source_note_id?: string | null;
  is_admin_note?: boolean | null;
  sent_by_developer?: boolean | null;
  developer_updated?: boolean | null;
};

const warningKeywords = ["NB", "NOTE", "DON'T", "DO NOT", "WARNING"];
const positiveKeywords = ["CREATE", "PLANT", "APPLY", "START", "ADD"];
const underlineKeywords = ["IMPORTANT", "MAKE SURE", "ALWAYS"];

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function replaceAllKeywordsEscaped(htmlEscaped: string, keywords: string[], className: string) {
  let out = htmlEscaped;
  for (const word of keywords) {
    const escapedWord = escapeHtml(word);
    out = out.replace(new RegExp(escapedWord, "gi"), (m) => `<span class="${className}">${m}</span>`);
  }
  return out;
}

function formatLineToHtml(line: string) {
  const upper = line.toUpperCase().trimStart();
  const isWarningLine = warningKeywords.some((w) => upper.startsWith(w));

  let formatted = escapeHtml(line);
  formatted = replaceAllKeywordsEscaped(formatted, positiveKeywords, "text-positive");
  formatted = replaceAllKeywordsEscaped(formatted, underlineKeywords, "text-underline");

  const safe = formatted.length ? formatted : "&nbsp;";
  return isWarningLine ? `<div class="nb-line line-warning">${safe}</div>` : `<div class="nb-line">${safe}</div>`;
}

export default function NotebookPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cropSlug: rawCropSlug, noteId: rawNoteId } = useParams();
  const cropSlug = decodeURIComponent(String(rawCropSlug ?? "")).trim();
  const noteIdParam = rawNoteId ? decodeURIComponent(String(rawNoteId)) : null;

  const { user } = useAuth();
  const scope = useCompanyScope();
  const isDeveloperRoute = location.pathname.startsWith("/developer/records");

  const [noteId, setNoteId] = useState<string | null>(noteIdParam);
  const [loading, setLoading] = useState<boolean>(!!noteIdParam);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [developerCompanyId, setDeveloperCompanyId] = useState<string>("");
  const [currentNoteCompanyId, setCurrentNoteCompanyId] = useState<string | null>(null);
  const [noteSource, setNoteSource] = useState<string | null>(null);

  const lastSavedRef = useRef<{ title: string; content: string; attachmentsKey: string } | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    setNoteId(noteIdParam);
  }, [noteIdParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!noteIdParam) {
        setLoading(false);
        lastSavedRef.current = { title: "", content: "", attachmentsKey: "[]" };
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
        const nextAttachments =
          Array.isArray(row.attachments) ? (row.attachments as any[]).map((v) => String(v)) : [];
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

  const handleAttachments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploads = await Promise.all(
        files.map(async (file) => {
          const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
          const key = `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;
          const path = `attachments/${key}`;
          const { data, error } = await supabase.storage.from("notes").upload(path, file, {
            upsert: false,
          });
          if (error) throw error;
          return data?.path ? String(data.path) : null;
        }),
      );

      const paths = uploads.filter(Boolean) as string[];
      if (paths.length) {
        setAttachments((prev) => Array.from(new Set([...prev, ...paths])));
        toast.success("Uploaded attachments");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload attachments.");
    } finally {
      setUploading(false);
      // allow selecting same file again
      e.target.value = "";
    }
  };

  const attachmentsKey = useMemo(() => JSON.stringify(attachments ?? []), [attachments]);

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

  const formattedContent = useMemo(() => {
    return content
      .split("\n")
      .map((line) => formatLineToHtml(line))
      .join("");
  }, [content]);

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
            onChange={handleAttachments}
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

        <textarea
          className="notebook-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing…"
        />

        {attachments.length ? (
          <div className="notebook-attachments">
            <div className="notebook-attachments-title">Attachments</div>
            <div className="notebook-attachments-list">
              {attachments.map((p) => (
                <div key={p} className="notebook-attachment-item">
                  <span className="notebook-attachment-path">{p}</span>
                  <Button
                    variant="ghost"
                    className="h-7 px-2 rounded-lg"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setAttachments((prev) => prev.filter((x) => x !== p));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="notebook-smart-preview">
          <div className="notebook-smart-preview-title">Smart preview</div>
          <div
            className="notebook-smart-preview-body"
            dangerouslySetInnerHTML={{ __html: formattedContent }}
          />
        </div>
      </div>
    </div>
  );
}

