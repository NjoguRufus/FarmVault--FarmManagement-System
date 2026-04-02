import React from 'react';
import { Link } from 'react-router-dom';
import type { RecordCropCard as RecordCropData } from '@/services/recordsService';
import { Leaf, Trash2 } from 'lucide-react';
import { cropTypeKeyEmoji } from '@/lib/cropEmoji';
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

export type RecordCropCardAccent = 'default' | 'farmvault';

export interface RecordCropCardProps {
  crop: RecordCropData;
  to: string;
  allowDelete?: boolean;
  onDelete?: () => void;
  accent?: RecordCropCardAccent;
}

function formatDate(value: string | null): string {
  if (!value) return 'No activity yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No activity yet';
  return d.toLocaleDateString();
}

export function RecordCropCard({ crop, to, allowDelete, onDelete, accent = 'default' }: RecordCropCardProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (allowDelete && onDelete) {
      setConfirmOpen(true);
    }
  };

  const accentHover =
    accent === 'farmvault'
      ? 'hover:border-[#1F7A63]/35 hover:shadow-[0_16px_36px_rgba(31,122,99,0.12)] focus-visible:ring-[#1F7A63]/25'
      : 'hover:shadow-[0_16px_36px_rgba(17,24,39,0.10)] hover:border-foreground/15 focus-visible:ring-foreground/15';

  const emojiKey = crop.slug ?? crop.crop_id ?? crop.crop_name;

  return (
    <>
      <Link
        to={to}
        className={cn(
          'group relative overflow-hidden rounded-2xl border border-black/5 bg-background/60 p-5 backdrop-blur',
          'shadow-[0_10px_24px_rgba(17,24,39,0.06)]',
          'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out',
          'hover:-translate-y-0.5 hover:bg-background/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
          accentHover,
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
            <span
              className={cn(
                'mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-black/5 shadow-[0_8px_18px_rgba(17,24,39,0.06)] text-[28px] leading-none',
                accent === 'farmvault' ? 'bg-[#1F7A63]/12' : 'bg-primary/10',
              )}
            >
              <span aria-hidden className="select-none">
                {cropTypeKeyEmoji(emojiKey)}
              </span>
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                {crop.crop_name?.trim() ? crop.crop_name : crop.crop_id}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-black/10 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                  {Number.isFinite(crop.records_count) ? crop.records_count : 0}{' '}
                  {(Number.isFinite(crop.records_count) ? crop.records_count : 0) === 1 ? 'note' : 'notes'}
                </span>
                {(Number.isFinite(crop.records_count) ? crop.records_count : 0) === 0 && (
                  <span className="text-[11px] font-medium text-muted-foreground/75">No notes yet</span>
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
          <span className="text-xs text-muted-foreground/80">Updated {formatDate(crop.last_updated_at)}</span>
        </div>
      </Link>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide crop card?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the crop card from the developer records view. Existing notes for this crop are not
              deleted.
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
