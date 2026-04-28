import { Link } from 'react-router-dom';
import { PenLine, StickyNote } from 'lucide-react';
import { cropTypeKeyEmoji } from '@/lib/cropEmoji';
import { cn } from '@/lib/utils';

function formatCardDate(value: string | null): string {
  if (!value) return 'No activity yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No activity yet';
  return d.toLocaleDateString();
}

function cropContextLabel(slug: string | null | undefined): string {
  const s = String(slug ?? '').trim();
  if (!s) return 'Farm notebook';
  return s.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function plainExcerpt(htmlOrText: string | null | undefined, maxLen: number): string {
  const raw = String(htmlOrText ?? '').trim();
  if (!raw) return '';
  const stripped = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&amp;nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen)}…` : stripped;
}

export interface RecordNotebookEntryCardProps {
  to: string;
  title: string;
  content: string | null;
  cropSlug: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  isFromDeveloper?: boolean;
  /** Optional pill above the title (e.g. staff notebook badge). */
  topBadge?: string | null;
}

/**
 * Notebook entry tile — matches {@link RecordCropCard} shell (border, blur, hover lift, orbs).
 */
export function RecordNotebookEntryCard({
  to,
  title,
  content,
  cropSlug,
  updatedAt,
  createdAt,
  isFromDeveloper,
  topBadge,
}: RecordNotebookEntryCardProps) {
  const updated = updatedAt ?? createdAt;
  const displayTitle = title.trim() || 'Untitled';
  const slug = cropSlug?.trim() ?? '';
  const excerpt = plainExcerpt(content, 200);

  const accentHover =
    'hover:shadow-[0_16px_36px_rgba(17,24,39,0.10)] hover:border-foreground/15 focus-visible:ring-foreground/15';

  return (
    <Link
      to={to}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-black/5 bg-background/60 p-5 backdrop-blur',
        'shadow-[0_10px_24px_rgba(17,24,39,0.06)]',
        'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:bg-background/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
        accentHover,
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-black/5 blur-2xl" />
        <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-black/5 blur-2xl" />
      </div>

      {isFromDeveloper ? (
        <div className="relative mb-2 w-fit rounded-md bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-semibold text-[#166534]">
          From Developer
        </div>
      ) : null}
      {topBadge ? (
        <div className="relative mb-2 w-fit rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {topBadge}
        </div>
      ) : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-black/5 shadow-[0_8px_18px_rgba(17,24,39,0.06)] text-[28px] leading-none',
              'bg-primary/10',
            )}
          >
            {slug ? (
              <span aria-hidden className="select-none">
                {cropTypeKeyEmoji(slug)}
              </span>
            ) : (
              <StickyNote className="h-6 w-6 text-primary" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{displayTitle}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-black/10 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                {cropContextLabel(cropSlug)}
              </span>
            </div>
            {excerpt ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">{excerpt}</p>
            ) : (
              <p className="mt-3 text-sm italic text-muted-foreground/75">No content yet…</p>
            )}
          </div>
        </div>
        <PenLine className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground/90">Notebook entry</span>
        <span className="text-xs text-muted-foreground/80">Updated {formatCardDate(updated)}</span>
      </div>
    </Link>
  );
}
