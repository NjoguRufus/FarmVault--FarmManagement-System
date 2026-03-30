import React from 'react';
import { Copy, Eye, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type DevDetailItem = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
};

export type DevDetailSection = {
  title: string;
  description?: string;
  items: DevDetailItem[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  sections: DevDetailSection[];
  raw?: unknown;
  /** When set, shows a compact ID row with Copy. */
  recordId?: string | null;
};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore (blocked / unsupported)
  }
}

export function DeveloperRecordDetailsSheet({
  open,
  onOpenChange,
  title,
  description,
  badge,
  sections,
  raw,
  recordId,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" draggable className="p-0 sm:max-w-none">
        <div className="border-b border-border/60 px-5 py-4">
          <SheetHeader className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{title}</SheetTitle>
                  {description ? <SheetDescription className="line-clamp-2">{description}</SheetDescription> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {badge}
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  Developer read-only
                </span>
              </div>
            </div>

            {recordId ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Record ID</p>
                  <p className="truncate font-mono text-xs text-foreground">{recordId}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void copyToClipboard(recordId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            ) : null}
          </SheetHeader>
        </div>

        <div className="space-y-5 px-5 py-5">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
                {section.description ? <p className="text-[11px] text-muted-foreground">{section.description}</p> : null}
              </div>
              <div className="grid gap-3 rounded-xl border border-border/60 bg-card/30 p-4 sm:grid-cols-2">
                {section.items.map((it) => (
                  <div key={`${section.title}-${it.label}`} className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{it.label}</p>
                    <div className={cn('mt-1 text-sm text-foreground break-words', it.mono && 'font-mono text-xs')}>
                      {it.value ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {raw !== undefined ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw payload</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void copyToClipboard(safeStringify(raw))}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON
                </Button>
              </div>
              <pre className="max-h-[320px] overflow-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-[11px] leading-relaxed text-foreground">
                {safeStringify(raw)}
              </pre>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

