import React from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type MarketNotebookBuyerRowProps = {
  entryNumber: number;
  buyerLabel: string | null;
  quantity: number;
  pricePerUnit: number;
  lineTotal: number;
  /** Shown after quantity, e.g. "crates", "units", "bags". */
  unitLabel: string;
  formatKes: (n: number) => string;
  buyerPhone?: string | null;
  brokerPaymentKind?: 'collected' | 'debt' | null;
  brokerCollectedAmount?: number | null;
  /** Opens broker payment / debt modal; keep pencil separate for line edits. */
  onCardClick?: () => void;
  onEdit?: () => void;
  className?: string;
};

function formatQty(q: number): string {
  if (!Number.isFinite(q)) return '0';
  const r = Math.round(q * 100) / 100;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(2);
}

/**
 * Picker-style card: green index badge, name, qty × bold price each, line total on the right (replaces +Bucket).
 */
function paymentRibbon(
  kind: 'collected' | 'debt' | null | undefined,
  collected: number | null | undefined,
  line: number,
): { label: string; className: string } | null {
  const lt = Number.isFinite(line) ? Math.max(0, line) : 0;
  const c = collected != null && Number.isFinite(collected) ? Math.max(0, Number(collected)) : 0;

  // Only show ribbon when the broker has explicitly recorded a status.
  if (kind == null) return null;

  // Pending: debt OR collected but not yet cleared.
  if (kind === 'debt') {
    return { label: 'PENDING', className: 'bg-amber-500/90 text-white dark:bg-amber-600/95' };
  }

  const isCleared = lt > 0 ? c + 0.01 >= lt : c > 0;
  if (isCleared) {
    return { label: 'CLEARED', className: 'bg-emerald-600/90 text-white dark:bg-emerald-600/95' };
  }

  return { label: 'PENDING', className: 'bg-amber-500/90 text-white dark:bg-amber-600/95' };
}

export function MarketNotebookBuyerRow({
  entryNumber,
  buyerLabel,
  quantity,
  pricePerUnit,
  lineTotal,
  unitLabel,
  formatKes,
  buyerPhone,
  brokerPaymentKind,
  brokerCollectedAmount,
  onCardClick,
  onEdit,
  className,
}: MarketNotebookBuyerRowProps) {
  const name = buyerLabel?.trim() || `Buyer ${entryNumber}`;
  const phone = buyerPhone?.trim();
  const ribbon = paymentRibbon(brokerPaymentKind, brokerCollectedAmount, lineTotal);
  const interactive = Boolean(onCardClick);

  const main = (
    <>
      <div className="relative shrink-0">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full bg-fv-success text-base font-bold tabular-nums text-white shadow-md ring-2 ring-background"
          aria-hidden
        >
          {entryNumber}
        </div>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        </div>
        {phone ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">{phone}</p>
        ) : null}
        <p className={cn('text-xs text-muted-foreground tabular-nums', phone ? 'mt-0.5' : 'mt-1')}>
          {formatQty(quantity)} {unitLabel} ×{' '}
          <span className="font-bold text-foreground">{formatKes(pricePerUnit)}</span>
          <span className="font-medium text-muted-foreground"> each</span>
        </p>
      </div>
    </>
  );

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-xl border-border/60 transition-all',
        interactive && 'cursor-pointer hover:border-border',
        className,
      )}
    >
      {ribbon ? (
        <span
          className={cn(
            'pointer-events-none absolute right-0 top-0 z-10 rounded-bl-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider shadow-sm',
            ribbon.className,
          )}
        >
          {ribbon.label}
        </span>
      ) : null}
      <CardContent className="flex items-stretch gap-2 p-2 sm:gap-3 sm:p-3">
        {interactive ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onCardClick}
          >
            {main}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{main}</div>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-foreground sm:min-w-[5.5rem] sm:text-right">
            {formatKes(lineTotal)}
          </div>
          {onEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Edit buyer line"
              onClick={(ev) => {
                ev.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Title-case label for packaging type (matches harvest session selects). */
export function tomatoPackagingTypeTitle(pt: string | null | undefined): string {
  const s = typeof pt === 'string' ? pt.trim() : '';
  if (!s) return '—';
  if (s === 'wooden_boxes') return 'Wooden boxes';
  if (s === 'crates') return 'Crates';
  return s.replace(/_/g, ' ');
}

/** Lowercase unit phrase after quantity in buyer rows (e.g. "5 boxes × …"). */
export function tomatoNotebookUnitLabelFromPackaging(pt: string | null | undefined): string {
  const s = typeof pt === 'string' ? pt.trim() : '';
  if (s === 'wooden_boxes') return 'boxes';
  if (s === 'crates') return 'crates';
  return 'boxes';
}
