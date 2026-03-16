import React from 'react';
import { Link } from 'react-router-dom';
import type { RecordCropCard } from '@/services/recordsService';
import { Trash2 } from 'lucide-react';
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
          'fv-card p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors relative',
          allowDelete && 'pr-10',
        )}
      >
        {allowDelete && onDelete && (
          <button
            type="button"
            onClick={handleDeleteClick}
            className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground truncate">{crop.crop_name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {crop.is_global ? 'Global crop' : 'Custom crop'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {crop.records_count} {crop.records_count === 1 ? 'note' : 'notes'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Updated {formatDate(crop.last_updated_at)}
            </span>
          </div>
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
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
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

