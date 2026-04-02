import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import "./fullKnowledge.css";

type FarmNotebookEntryRow = {
  id: string;
  company_id: string | null;
  crop_slug: string | null;
  title: string | null;
  content: string | null;
  created_at: string | null;
  source?: string | null;
};

const CROP_LABELS: Record<string, string> = {
  tomatoes: "Tomatoes",
  "french-beans": "French Beans",
  capsicum: "Capsicum",
  maize: "Maize",
  rice: "Rice",
};

function labelForCrop(slug: string) {
  return CROP_LABELS[slug] ?? slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function FullKnowledgePage() {
  const navigate = useNavigate();
  const { cropSlug: rawCropSlug } = useParams();
  const cropSlug = decodeURIComponent(String(rawCropSlug ?? "")).trim();

  const [rows, setRows] = useState<FarmNotebookEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const cropName = useMemo(() => labelForCrop(cropSlug), [cropSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!cropSlug) {
          setRows([]);
          setError("Missing crop.");
          return;
        }

        // IMPORTANT: NO company filter — global notes across all companies.
        const { data, error: qErr } = await db
          .public()
          .from("farm_notebook_entries")
          .select("*")
          .eq("crop_slug", cropSlug)
          .order("created_at", { ascending: false });

        if (qErr) throw qErr;
        if (!cancelled) setRows((data as FarmNotebookEntryRow[]) ?? []);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load knowledge.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cropSlug]);

  const filteredNotes = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (note) =>
        String(note.title ?? "").toLowerCase().includes(q) ||
        String(note.content ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const categories = useMemo(() => {
    const next: Record<string, FarmNotebookEntryRow[]> = {};
    for (const note of filteredNotes) {
      const key = String(note.crop_slug ?? "").trim() || "General";
      if (!next[key]) next[key] = [];
      next[key].push(note);
    }
    return next;
  }, [filteredNotes]);

  const pages = useMemo(() => {
    const pageSize = 4;
    return Object.entries(categories).flatMap(([cat, notes]) => {
      const chunked: Array<{ category: string; notes: FarmNotebookEntryRow[] }> = [];
      for (let i = 0; i < notes.length; i += pageSize) {
        chunked.push({ category: cat, notes: notes.slice(i, i + pageSize) });
      }
      return chunked;
    });
  }, [categories]);

  const handleCopyAll = async () => {
    const text = filteredNotes
      .map((n) => `${String(n.title ?? "Untitled")}\n${String(n.content ?? "")}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const text = filteredNotes
      .map((n) => `${String(n.title ?? "Untitled")}\n${String(n.content ?? "")}`)
      .join("\n\n");

    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "FarmVault_Knowledge.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={() => navigate(`/developer/records/${encodeURIComponent(cropSlug)}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h2 className="text-lg sm:text-2xl font-semibold tracking-tight truncate">
            {cropName} — Full Knowledge
          </h2>
        </div>
      </div>

      <div className="knowledge-actions">
        <button type="button" onClick={handleCopyAll}>
          Copy All
        </button>
        <button type="button" onClick={handleDownload}>
          Download Knowledge
        </button>
      </div>

      <div className="knowledge-search">
        <input
          placeholder="Search knowledge..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-background/40 p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading knowledge…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          No knowledge found.
        </div>
      ) : (
        <div className="knowledge-document">
          {pages.map((page, i) => (
            <div key={`${page.category}:${i}`} className="knowledge-page">
              <h3 className="knowledge-page-title">
                Page {i + 1} — {page.category}
              </h3>

              {page.notes.map((note) => (
                <div key={note.id} className="knowledge-section">
                  <div className="knowledge-header">
                    <h4>{note.title?.trim() ? note.title : "Untitled"}</h4>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(String(note.content ?? ""))}
                    >
                      Copy
                    </button>
                  </div>

                  <p>{String(note.content ?? "")}</p>

                  <span className="knowledge-source">
                    {String(note.source ?? "").toLowerCase() === "developer" ? "From FarmVault" : "From Company"}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

