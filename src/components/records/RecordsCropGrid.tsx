import React from 'react';
import { Link } from 'react-router-dom';
import type { RecordCropCard } from '@/services/recordsService';
import { Leaf, Sprout, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface RecordsCropGridProps {
  crops: RecordCropCard[];
  basePath: string;
  allowDelete?: boolean;
  onDeleteCrop?: (crop: RecordCropCard) => void;
  className?: string;
}

interface CropNotebookCardProps {
  crop: RecordCropCard;
  to: string;
  allowDelete?: boolean;
  onDelete?: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return 'No activity yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No activity yet';
  return d.toLocaleDateString();
}

function CropGlyph({ slug, className }: { slug?: string | null; className?: string }) {
  const s = (slug ?? '').toLowerCase();

  // Monochrome, subtle glyphs (avoid colorful icons).
  // Use minimal geometry and keep consistent visual weight.
  if (s.includes('tomat')) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('h-5 w-5 text-foreground/70', className)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 6c-4.2 0-7 2.7-7 7s2.8 8 7 8 7-3 7-8-2.8-7-7-7Z" />
        <path d="M9 6.5c.8-1.5 2-2.3 3-2.3s2.2.8 3 2.3" />
        <path d="M12 4.2v2" />
        <path d="M12 4.2c-1.2 0-2.3-.6-3-1.6" />
        <path d="M12 4.2c1.2 0 2.3-.6 3-1.6" />
      </svg>
    );
  }

  if (s.includes('french') || s.includes('bean')) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('h-5 w-5 text-foreground/70', className)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 16c3.2 1.6 6.2.8 8-1.8 1.8-2.6.7-5.4-2.6-6.9-2.3-1.1-4.6-1-6.4.2" />
        <path d="M9 18.2c3.1 1.1 6.3-.2 8.2-3 1.7-2.5 1-5.1-1.5-6.8" />
      </svg>
    );
  }

  if (s.includes('capsic') || s.includes('pepper')) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('h-5 w-5 text-foreground/70', className)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 6c-3 0-5 2.2-5 5.2V13c0 4.5 2.2 8 5 8s5-3.5 5-8v-1.8C17 8.2 15 6 12 6Z" />
        <path d="M12 6c.2-1.6.9-2.6 2.2-3.1" />
        <path d="M12 6c-.2-1.4-.8-2.4-2-3" />
      </svg>
    );
  }

  if (s.includes('water') || s.includes('melon')) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('h-5 w-5 text-foreground/70', className)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.5 12.5c3.3 5.7 9.7 7.6 13 4.5 2.6-2.4 2.2-7.3-1.7-10.6-3.9-3.3-9.2-3.2-11.3.1" />
        <path d="M7 12.8c2.6 3.8 7.4 5.1 10 3.1" />
        <path d="M10.2 12.2h0" />
        <path d="M12.6 13.4h0" />
        <path d="M14.2 11.5h0" />
      </svg>
    );
  }

  if (s.includes('maize') || s.includes('corn')) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn('h-5 w-5 text-foreground/70', className)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 4c3.1 1.4 5 4.2 5 7.3V13c0 4.8-2.2 8-5 8s-5-3.2-5-8v-1.7C7 8.2 8.9 5.4 12 4Z" />
        <path d="M10 7.8c1.2.2 2.6.2 4 0" />
        <path d="M10 10.6c1.2.2 2.6.2 4 0" />
        <path d="M10 13.4c1.2.2 2.6.2 4 0" />
        <path d="M8 9c-1.2.8-2 1.8-2.5 3" />
        <path d="M16 9c1.2.8 2 1.8 2.5 3" />
      </svg>
    );
  }

  return <Sprout className={cn('h-5 w-5 text-foreground/65', className)} aria-hidden="true" />;
}

function CropNotebookCard({ crop, to, allowDelete, onDelete }: CropNotebookCardProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (allowDelete && onDelete) {
      setConfirmOpen(true);
    }
  };

  return (
    <>
      <Link
        to={to}
        className={cn(
          'group relative overflow-hidden rounded-2xl border border-black/5 bg-background/60 p-5 backdrop-blur',
          'shadow-[0_10px_24px_rgba(17,24,39,0.06)]',
          'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out',
          'hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(17,24,39,0.10)] hover:border-foreground/15 hover:bg-background/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 focus-visible:ring-offset-0',
          allowDelete && 'pr-10',
        )}
      >
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-black/5 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-black/5 blur-2xl" />
        </div>
        {allowDelete && onDelete && (
          <button
            type="button"
            onClick={handleDeleteClick}
            className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-red-200/70 bg-red-50/70 text-red-700 shadow-sm backdrop-blur transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-black/5 bg-background/70 shadow-[0_8px_18px_rgba(17,24,39,0.06)]">
              <CropGlyph slug={crop.slug ?? crop.crop_name} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                {crop.crop_name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-black/10 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                  {crop.records_count} {crop.records_count === 1 ? 'note' : 'notes'}
                </span>
                {crop.records_count === 0 && (
                  <span className="text-[11px] font-medium text-muted-foreground/75">
                    No notes yet
                  </span>
                )}
              </div>
            </div>
          </div>
          <Leaf className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
        </div>

        <div className="relative mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground/90">
            {crop.is_global ? 'Global crop' : 'Custom crop'}
          </span>
          <span className="text-xs text-muted-foreground/80">
            Updated {formatDate(crop.last_updated_at)}
          </span>
        </div>
      </Link>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide crop card?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the crop card from the developer records view. Existing notes for this crop
              are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmOpen(false);
                onDelete?.();
              }}
            >
              Hide crop card
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function RecordsCropGrid({
  crops,
  basePath,
  allowDelete,
  onDeleteCrop,
  className,
}: RecordsCropGridProps) {
  if (crops.length === 0) {
    return null;
  }

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {crops.map((crop) => (
        <CropNotebookCard
          key={crop.crop_id}
          crop={crop}
          to={`${basePath}/${crop.crop_id}`}
          allowDelete={allowDelete}
          onDelete={onDeleteCrop ? () => onDeleteCrop(crop) : undefined}
        />
      ))}
    </div>
  );
}

