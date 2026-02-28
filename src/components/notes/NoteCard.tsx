import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HighlightsChips } from './HighlightsChips';
import { TagsChips } from './TagsChips';
import { getCategoryLabel } from '@/constants/notes';
import type { NoteCategory } from '@/types';
import { cn } from '@/lib/utils';

export interface NoteCardData {
  id: string;
  title: string;
  category: NoteCategory;
  highlights: string[];
  tags: string[];
  badge: 'global' | { companyName: string };
}

export function NoteCard({
  note,
  onClick,
  className,
}: {
  note: NoteCardData;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/50 hover:border-primary/30',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-base leading-tight">{note.title}</h3>
          {note.badge === 'global' ? (
            <Badge variant="secondary" className="shrink-0">Global</Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">
              Company: {note.badge.companyName}
            </Badge>
          )}
        </div>
        <Badge variant="outline" className="w-fit mt-1 text-xs">
          {getCategoryLabel(note.category)}
        </Badge>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <HighlightsChips highlights={note.highlights} max={3} />
        <TagsChips tags={note.tags} />
      </CardContent>
    </Card>
  );
}
