import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ComplianceDocumentCatalogRow } from '@/services/complianceDocumentsService';

function formatDocDate(isoDate: string): string {
  if (!isoDate) return '—';
  try {
    const d = parseISO(isoDate.length <= 10 ? `${isoDate}T00:00:00` : isoDate);
    return isValid(d) ? format(d, 'd MMM yyyy') : isoDate;
  } catch {
    return isoDate;
  }
}

interface ComplianceDocumentCardProps {
  doc: ComplianceDocumentCatalogRow;
  icon?: LucideIcon;
  className?: string;
}

export function ComplianceDocumentCard({ doc, icon: Icon, className }: ComplianceDocumentCardProps) {
  const viewUrl = doc.href_view?.trim() || null;
  const downloadUrl = doc.href_download?.trim() || viewUrl;
  const hasAsset = Boolean(viewUrl);

  const openDoc = () => {
    if (viewUrl) window.open(viewUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm transition-colors',
        hasAsset && 'cursor-pointer hover:border-primary/45 hover:bg-muted/20',
        className,
      )}
      onClick={() => openDoc()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {Icon ? <Icon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug text-foreground">{doc.title}</h3>
            {doc.description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{doc.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Badge variant="secondary" className="text-[11px] font-medium">
          {doc.category_badge}
        </Badge>
        {doc.is_verified ? (
          <Badge variant="success" className="text-[11px] font-medium">
            Verified
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground">
            Unverified
          </Badge>
        )}
      </div>

      <div
        className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/50 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={!hasAsset}
          onClick={() => openDoc()}
        >
          View
        </Button>
        {downloadUrl && hasAsset ? (
          <Button type="button" variant="default" size="sm" className="h-8 text-xs" asChild>
            <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </Button>
        ) : (
          <Button type="button" variant="default" size="sm" className="h-8 text-xs" disabled>
            Download
          </Button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">Updated {formatDocDate(doc.last_updated)}</span>
      </div>
    </div>
  );
}
