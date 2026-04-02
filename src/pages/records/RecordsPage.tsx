import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, NotebookPen, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CropDef = {
  slug: string;
  title: string;
};

const DEFAULT_CROPS: CropDef[] = [
  { slug: "tomatoes", title: "Tomatoes" },
  { slug: "french-beans", title: "French Beans" },
  { slug: "capsicum", title: "Capsicum" },
  { slug: "maize", title: "Maize" },
  { slug: "rice", title: "Rice" },
];

export default function RecordsPage() {
  const navigate = useNavigate();

  const crops = useMemo(() => DEFAULT_CROPS, []);

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/15 bg-emerald-500/10">
            <NotebookPen className="h-5 w-5 text-emerald-600" />
          </span>
          <div className="space-y-0.5">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Records</h1>
            <p className="text-sm text-muted-foreground">
              Pick a crop to open its notebook.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {crops.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => navigate(`/records/${encodeURIComponent(c.slug)}`)}
            className={cn(
              "group text-left rounded-2xl border border-border/60 bg-background/50 backdrop-blur",
              "p-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-500/25",
              "focus:outline-none focus:ring-2 focus:ring-emerald-500/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2">
                  <Sprout className="h-4 w-4 text-emerald-600/80" />
                  <span className="text-sm font-semibold text-foreground">
                    {c.title}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Tap to view notes
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Notebook-based records</div>
            <div className="text-xs text-muted-foreground">
              Notes auto-save while you type. Each crop is its own notebook.
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/records/tomatoes")} className="rounded-xl">
            Open tomatoes notebook
          </Button>
        </div>
      </div>
    </div>
  );
}

