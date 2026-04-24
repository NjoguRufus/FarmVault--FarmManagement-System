import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Search, StickyNote } from "lucide-react";
import { db, requireCompanyId } from "@/lib/db";
import { useCompanyScope } from "@/hooks/useCompanyScope";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fetchDeveloperCompanies } from "@/services/developerService";
import { NotesCard } from "@/components/records/NotesCard";
import { isStaffPersonalNotebookPath, resolveNotesBasePath } from "@/lib/routing/farmerAppPaths";
import { htmlToPlainText } from "@/lib/notebook/htmlToPlainText";
import "./cropDetailsNotes.css";

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
  is_admin_note?: boolean | null;
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

export default function CropDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cropSlug: rawCropSlug } = useParams();
  const cropSlug = decodeURIComponent(String(rawCropSlug ?? "")).trim();

  const { user } = useAuth();
  const scope = useCompanyScope();
  const isDeveloperRoute = location.pathname.startsWith("/developer/records");
  const notesBase = resolveNotesBasePath(location.pathname);
  const staffPersonalNotebook = isStaffPersonalNotebookPath(location.pathname);

  const [rows, setRows] = useState<FarmNotebookEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [companyNameById, setCompanyNameById] = useState<Record<string, string>>({});
  const [developerCompanies, setDeveloperCompanies] = useState<Array<{ id: string; name: string }>>([]);

  const cropTitle = useMemo(() => labelForCrop(cropSlug), [cropSlug]);
  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredByCompany =
      isDeveloperRoute && companyFilter !== "all"
        ? rows.filter((note) => String(note.company_id ?? "") === companyFilter)
        : rows;

    if (!q) return filteredByCompany;

    return filteredByCompany.filter((note) => {
      const t = String(note.title ?? "").toLowerCase();
      const c = htmlToPlainText(String(note.content ?? "")).toLowerCase();
      const companyId = String(note.company_id ?? "");
      const companyName = (companyNameById[companyId] ?? companyId).toLowerCase();
      return t.includes(q) || c.includes(q) || (isDeveloperRoute && companyName.includes(q));
    });
  }, [rows, search, isDeveloperRoute, companyFilter, companyNameById]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const companyId = isDeveloperRoute ? null : scope.error ? null : requireCompanyId(scope.companyId);
        if (!cropSlug) {
          setRows([]);
          setError("Missing crop.");
          return;
        }

        let q = db
          .public()
          .from("farm_notebook_entries")
          .select("*")
          .eq("crop_slug", cropSlug)
          .order("updated_at", { ascending: false });

        if (!isDeveloperRoute) {
          if (!companyId) {
            setRows([]);
            setError("Company workspace required.");
            return;
          }
          q = q.eq("company_id", companyId);
          if (staffPersonalNotebook) {
            q = q.eq("visibility_scope", "staff_personal");
          } else {
            q = q.neq("visibility_scope", "staff_personal");
          }
        }

        const { data, error: qErr } = await q;
        if (qErr) throw qErr;
        if (!cancelled) setRows((data as FarmNotebookEntryRow[]) ?? []);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load notes.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope.companyId, scope.error, cropSlug, user?.id, isDeveloperRoute, staffPersonalNotebook]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isDeveloperRoute) return;
      try {
        const res = await fetchDeveloperCompanies({ limit: 1000, offset: 0 });
        const items = res.items ?? [];
        const next: Record<string, string> = {};
        const list: Array<{ id: string; name: string }> = [];
        for (const c of items as any[]) {
          const id = String((c as any)?.company_id ?? (c as any)?.id ?? "").trim();
          if (!id) continue;
          const name = String((c as any)?.company_name ?? (c as any)?.name ?? id).trim();
          next[id] = name || id;
          list.push({ id, name: name || id });
        }
        if (!cancelled) setCompanyNameById(next);
        if (!cancelled) setDeveloperCompanies(list.sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        if (!cancelled) setCompanyNameById({});
        if (!cancelled) setDeveloperCompanies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDeveloperRoute]);

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(notesBase);
              }
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="hidden sm:block">
            <div className="text-xs text-muted-foreground">Crop notebook</div>
            <div className="text-lg font-semibold leading-tight">{cropTitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDeveloperRoute ? (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() =>
                navigate(`${notesBase}/${encodeURIComponent(cropSlug)}/full-knowledge`)
              }
            >
              Full Knowledge
            </Button>
          ) : null}
          <Button
            className="rounded-xl"
            onClick={() =>
              navigate(`${notesBase}/${encodeURIComponent(cropSlug)}/new`)
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        </div>
      </div>

      <div className="sm:hidden">
        <div className="text-xs text-muted-foreground">Crop notebook</div>
        <div className="text-2xl font-semibold tracking-tight">{cropTitle}</div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-background/40 p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading notes…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 text-center">
          <StickyNote className="mx-auto h-9 w-9 text-muted-foreground mb-3" />
          <div className="text-sm font-semibold">No notes yet</div>
          <div className="text-sm text-muted-foreground mt-1">
            Create the first note for <span className="font-medium text-foreground">{cropTitle}</span>.
          </div>
          <Button
            className="rounded-xl mt-5"
            onClick={() =>
              navigate(`${notesBase}/${encodeURIComponent(cropSlug)}/new`)
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        </div>
      ) : (
        <div>
          {isDeveloperRoute ? (
            <div className="notes-filters">
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="notes-company-filter">
                  <SelectValue placeholder="Filter by company" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All companies</SelectItem>
                  {developerCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="notes-search">
            <Search className="h-4 w-4" />
            <input
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="notes-grid">
            {filteredNotes.map((n) => (
              <div
                key={n.id}
                className={cn("text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/30 rounded-[18px]")}
              >
                <NotesCard
                  note={n}
                  onClick={() =>
                    navigate(`${notesBase}/${encodeURIComponent(cropSlug)}/${encodeURIComponent(n.id)}`)
                  }
                />
                {isDeveloperRoute ? (
                  <div className="notes-company-under">
                    {n.company_id
                      ? companyNameById[String(n.company_id)] ?? String(n.company_id)
                      : "Unknown Company"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

