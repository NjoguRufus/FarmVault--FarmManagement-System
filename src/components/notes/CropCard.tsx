import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCropDisplayName } from '@/constants/notes';

export function CropCard({
  cropId,
  basePath,
  globalCount,
  companyCount,
  sharedCount,
  className,
}: {
  cropId: string;
  basePath: string;
  globalCount: number;
  companyCount: number;
  sharedCount: number;
  className?: string;
}) {
  const name = getCropDisplayName(cropId);
  return (
    <Link to={`${basePath}/${cropId}`}>
      <Card
        className={cn(
          'transition-colors hover:bg-muted/50 hover:border-primary/30 cursor-pointer',
          className
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-lg">{name}</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {globalCount > 0 && (
              <span>Global: {globalCount}</span>
            )}
            {companyCount > 0 && (
              <span>Company: {companyCount}</span>
            )}
            {sharedCount > 0 && (
              <span>Shared: {sharedCount}</span>
            )}
            {globalCount === 0 && companyCount === 0 && sharedCount === 0 && (
              <span>No notes</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
