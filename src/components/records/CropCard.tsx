import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cropTypeKeyEmoji } from '@/lib/cropEmoji';
import { cn } from '@/lib/utils';

export interface CropCardProps {
  cropId: string;
  name: string;
  libraryCount: number;
  companyCount: number;
  to: string;
  className?: string;
}

export function CropCard({ cropId, name, libraryCount, companyCount, to, className }: CropCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        'fv-card p-4 flex items-center justify-between gap-4 hover:border-primary/40 transition-colors',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xl">
          <span aria-hidden>{cropTypeKeyEmoji(cropId)}</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{name}</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>Library: {libraryCount}</span>
            <span>Company: {companyCount}</span>
          </div>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </Link>
  );
}

export interface CropCardAdminProps {
  cropId: string;
  name: string;
  sharedCount: number;
  myCount: number;
  to: string;
  className?: string;
}

export function CropCardAdmin({ cropId, name, sharedCount, myCount, to, className }: CropCardAdminProps) {
  return (
    <Link
      to={to}
      className={cn(
        'fv-card p-4 flex items-center justify-between gap-4 hover:border-primary/40 transition-colors',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xl">
          <span aria-hidden>{cropTypeKeyEmoji(cropId)}</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{name}</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>Shared: {sharedCount}</span>
            <span>My records: {myCount}</span>
          </div>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </Link>
  );
}
