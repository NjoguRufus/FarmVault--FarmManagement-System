import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Chips } from './Chips';
import type { RecordCategory } from '@/types';
import { cn } from '@/lib/utils';

export interface RecordCardProps {
  title: string;
  category: RecordCategory;
  highlights: string[];
  tags: string[];
  content?: string;
  companyName?: string;
  cropId?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
  readOnly?: boolean;
  className?: string;
}

function getCropEmojiFromId(cropId?: string): string | null {
  if (!cropId) return null;
  const emojis: Record<string, string> = {
    tomatoes: '🍅',
    'french-beans': '🫛',
    capsicum: '🌶️',
    maize: '🌽',
    watermelons: '🍉',
    rice: '🌾',
  };
  return emojis[cropId] || '🌱';
}

export function RecordCard({
  title,
  category,
  highlights,
  tags,
  content,
  companyName,
  cropId,
  onEdit,
  onDelete,
  onOpen,
  readOnly,
  className,
}: RecordCardProps) {
  const cropEmoji = getCropEmojiFromId(cropId);

  return (
    <div
      className={cn(
        'fv-card p-4 space-y-3 hover:border-border/80 transition-colors',
        'cursor-pointer',
        className
      )}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            {cropEmoji && (
              <span className="text-base" aria-hidden>
                {cropEmoji}
              </span>
            )}
            <span className="truncate">{title}</span>
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="fv-badge text-xs capitalize">{category}</span>
            {companyName && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                Company: {companyName}
              </span>
            )}
          </div>
        </div>
        {!readOnly && (onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {highlights?.length > 0 && (
        <Chips items={highlights} variant="highlight" />
      )}
      {tags?.length > 0 && (
        <Chips items={tags} />
      )}
    </div>
  );
}
