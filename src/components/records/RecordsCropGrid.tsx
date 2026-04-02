import React from 'react';
import type { RecordCropCard as RecordCropData } from '@/services/recordsService';
import { cn } from '@/lib/utils';
import { RecordCropCard, type RecordCropCardAccent } from '@/components/records/RecordCropCard';

export interface RecordsCropGridProps {
  crops: RecordCropData[];
  basePath: string;
  allowDelete?: boolean;
  onDeleteCrop?: (crop: RecordCropData) => void;
  className?: string;
  accent?: RecordCropCardAccent;
}

export function RecordsCropGrid({
  crops,
  basePath,
  allowDelete,
  onDeleteCrop,
  className,
  accent = 'default',
}: RecordsCropGridProps) {
  if (crops.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
        className,
      )}
    >
      {crops.map((crop) => (
        <RecordCropCard
          key={crop.crop_id}
          crop={crop}
          to={`${basePath}/${crop.crop_id}`}
          allowDelete={allowDelete}
          onDelete={onDeleteCrop ? () => onDeleteCrop(crop) : undefined}
          accent={accent}
        />
      ))}
    </div>
  );
}
