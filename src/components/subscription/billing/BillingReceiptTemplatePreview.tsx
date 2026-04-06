import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReceiptTemplatePreviewModel } from '@/features/billing/receipt/receiptTemplatePreviewModel';
import { FARMVAULT_LOGO_URL } from '@/config/brandAssets';

/** DOM id used for print + PNG capture (excludes UI-only sample notice). */
export const FV_RECEIPT_TEMPLATE_PREVIEW_ELEMENT_ID = 'fv-receipt-template-preview';

function money(currency: string, n: number): string {
  return `${currency} ${n.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

type BillingReceiptTemplatePreviewProps = {
  model: ReceiptTemplatePreviewModel;
  className?: string;
};

const printColorExact: React.CSSProperties = {
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

/**
 * Fixed receipt layout: customer details left, payment details right (same on mobile).
 * Sample notice sits outside the printable/capture root. Horizontal scroll on narrow viewports.
 */
export function BillingReceiptTemplatePreview({ model, className }: BillingReceiptTemplatePreviewProps) {
  const [logoOk, setLogoOk] = useState(true);

  return (
    <div className={cn('w-full', className)}>
      {model.isSample ? (
        <p
          className="mb-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-center text-[11px] leading-snug text-muted-foreground print:hidden"
          role="status"
        >
          Preview layout — values in the receipt below may be sample or from a confirmed payment until a PDF is
          issued. This notice is not part of the receipt.
        </p>
      ) : null}

      <div className="-mx-1 overflow-x-auto px-1 print:mx-0 print:overflow-visible print:px-0">
        <div
          id={FV_RECEIPT_TEMPLATE_PREVIEW_ELEMENT_ID}
          className={cn(
            'fv-receipt-print-target relative mx-auto min-w-[540px] max-w-[640px] overflow-hidden rounded-xl border border-border/60 bg-white text-[13px] text-foreground shadow-sm',
            'print:mx-0 print:max-w-none print:min-w-0 print:w-full print:rounded-none print:border print:border-neutral-300 print:shadow-none',
            'print:break-inside-avoid print:text-[11px] print:leading-snug',
          )}
          style={printColorExact}
        >
          {/* Watermark */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <span
              className={cn(
                'select-none text-[4.5rem] font-black uppercase leading-none tracking-tighter print:text-[2.65rem]',
                model.isSample ? 'text-[#0b3d2e]/[0.06]' : 'text-[#0b3d2e]/[0.08]',
              )}
              style={{ transform: 'rotate(-28deg)' }}
            >
              {model.statusLabel === 'PAID' || model.statusLabel === 'paid' ? 'PAID' : 'FARMVAULT'}
            </span>
          </div>

          {/* Header — no wrap: brand left, meta right */}
          <div
            className="relative px-5 pb-4 pt-5 text-white print:px-4 print:pb-2.5 print:pt-3"
            style={{
              ...printColorExact,
              background: 'linear-gradient(135deg, #0b3d2e 0%, #0f5b3f 55%, #0b3d2e 100%)',
            }}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 print:gap-2">
              <div className="flex min-w-0 items-start gap-3 print:gap-2">
                {logoOk ? (
                  <img
                    src={FARMVAULT_LOGO_URL}
                    alt="FarmVault"
                    width={56}
                    height={56}
                    crossOrigin="anonymous"
                    className="h-12 w-auto shrink-0 object-contain object-left print:h-9"
                    onError={() => setLogoOk(false)}
                  />
                ) : null}
                <div className="min-w-0">
                  <div
                    className="text-lg font-bold tracking-tight print:text-base"
                    style={{ color: '#D8B980' }}
                  >
                    FarmVault
                  </div>
                  <div className="mt-1 text-xl font-bold tracking-tight print:mt-0.5 print:text-lg">
                    PAYMENT RECEIPT
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right text-sm print:text-xs">
                <div className="font-mono font-semibold" style={{ color: '#D8B980' }}>
                  {model.receiptNumber}
                </div>
                <div className="mt-0.5 text-xs text-white/85 print:text-[10px]">
                  Issued {model.issuedAtLabel}
                </div>
                <div className="mt-2 inline-flex rounded-md bg-[#16a34a] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white print:mt-1 print:px-2 print:py-0.5 print:text-[10px]">
                  {model.statusLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Success strip */}
          <div
            className="relative border-b border-[#16a34a]/30 bg-[#ecfdf3] px-5 py-3 print:px-4 print:py-2"
            style={printColorExact}
          >
            <div className="flex flex-nowrap items-center gap-2 text-sm font-semibold text-[#14532d] print:text-xs">
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-[#16a34a] print:h-4 print:w-4"
                aria-hidden
                strokeWidth={2.25}
              />
              <span className="min-w-0 truncate print:whitespace-normal print:break-words">
                Payment Successfully Confirmed
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-nowrap gap-x-6 gap-y-1 overflow-x-auto text-xs text-muted-foreground print:mt-0.5 print:gap-x-4 print:text-[10px] print:overflow-visible">
              <span className="shrink-0">Transaction date: {model.transactionDateLabel}</span>
              <span className="shrink-0 font-mono">Reference: {model.transactionReference}</span>
            </div>
          </div>

          {/* Two columns always: customer left, payment right */}
          <div
            className="relative grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 print:gap-x-4 print:gap-y-2 print:px-4 print:py-3"
            style={printColorExact}
          >
            <div className="min-w-0 print:break-inside-avoid">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#0b3d2e] print:text-[10px]">
                Customer details
              </div>
              <ul className="mt-2 space-y-1 break-words text-sm text-foreground/90 print:mt-1 print:space-y-0.5 print:text-xs">
                <li>
                  <span className="text-muted-foreground">Company:</span> {model.companyName}
                </li>
                <li>
                  <span className="text-muted-foreground">Admin:</span> {model.adminName}
                </li>
                <li>
                  <span className="text-muted-foreground">Email:</span> {model.email}
                </li>
                <li>
                  <span className="text-muted-foreground">Phone:</span> {model.phone}
                </li>
                <li>
                  <span className="text-muted-foreground">Workspace:</span> {model.workspaceName}
                </li>
              </ul>
            </div>
            <div className="min-w-0 print:break-inside-avoid">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#0b3d2e] print:text-[10px]">
                Payment details
              </div>
              <ul className="mt-2 space-y-1 break-words text-sm text-foreground/90 print:mt-1 print:space-y-0.5 print:text-xs">
                <li>
                  <span className="text-muted-foreground">Mode:</span> {model.paymentMode}
                </li>
                <li>
                  <span className="text-muted-foreground">Receipt:</span>{' '}
                  <span className="font-mono text-xs">{model.receiptNumber}</span>
                </li>
                <li>
                  <span className="text-muted-foreground">Currency:</span> {model.currency}
                </li>
                <li>
                  <span className="text-muted-foreground">Plan:</span> {model.planLabel}
                </li>
                <li>
                  <span className="text-muted-foreground">Billing period:</span> {model.billingPeriod}
                </li>
                <li>
                  <span className="text-muted-foreground">Transaction ref:</span>{' '}
                  <span className="font-mono text-xs">{model.transactionReference}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Items */}
          <div className="relative px-5 pb-2 print:px-4 print:pb-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#0b3d2e] print:text-[10px]">
              Items
            </div>
            <div className="mt-2 overflow-hidden rounded-lg border border-border/60 print:mt-1">
              <table className="w-full table-fixed border-collapse text-left text-sm print:text-[10px]">
                <colgroup>
                  <col className="w-[46%]" />
                  <col className="w-[10%]" />
                  <col className="w-[22%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead className="bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground print:text-[9px]">
                  <tr>
                    <th className="px-3 py-2 print:px-2 print:py-1">Description</th>
                    <th className="px-3 py-2 text-right print:px-2 print:py-1">Qty</th>
                    <th className="px-3 py-2 text-right print:px-2 print:py-1">Unit</th>
                    <th className="px-3 py-2 text-right print:px-2 print:py-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/50">
                    <td className="break-words px-3 py-2.5 print:px-2 print:py-1">{model.lineDescription}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums print:px-2 print:py-1">
                      {model.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums print:px-2 print:py-1">
                      {money(model.currency, model.unitPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums print:px-2 print:py-1">
                      {money(model.currency, model.lineTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="relative flex justify-end px-5 pb-5 pt-2 print:px-4 print:pb-3 print:pt-1">
            <div className="w-full max-w-[220px] space-y-1.5 rounded-lg border border-border/60 p-3 text-sm print:max-w-[200px] print:space-y-1 print:p-2 print:text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums text-foreground">{money(model.currency, model.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>VAT</span>
                <span className="tabular-nums text-foreground">{money(model.currency, model.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="tabular-nums text-foreground">
                  {model.discountAmount > 0
                    ? `-${money(model.currency, model.discountAmount)}`
                    : money(model.currency, 0)}
                </span>
              </div>
              <div
                className="flex justify-between border-t border-[#16a34a]/25 pt-2 text-base font-bold print:pt-1.5 print:text-sm"
                style={{ color: '#0b3d2e' }}
              >
                <span>TOTAL PAID</span>
                <span className="tabular-nums">{money(model.currency, model.totalPaid)}</span>
              </div>
            </div>
          </div>

          <div
            className="relative border-t border-border/50 bg-muted/20 px-5 py-3 text-center text-[11px] text-muted-foreground print:px-4 print:py-2 print:text-[10px]"
            style={printColorExact}
          >
            Payment Confirmed · M-Pesa Verified · Authorized by FarmVault
            <div className="mt-0.5 font-mono text-[10px] opacity-80 print:mt-0 print:text-[9px]">
              {model.footerTs}
            </div>
          </div>

          <div
            className="relative border-t border-border/40 bg-[#f8faf9] px-5 py-2.5 text-[10px] text-muted-foreground print:px-4 print:py-1.5 print:text-[9px]"
            style={printColorExact}
          >
            <div className="min-w-0 overflow-x-auto whitespace-nowrap print:overflow-visible print:whitespace-normal">
              <span className="font-medium text-foreground/80">Customer since</span> {model.customerSinceLabel}
              <span className="mx-2 text-border">·</span>
              <span className="font-medium text-foreground/80">Plan</span> {model.planTier}
              <span className="mx-2 text-border">·</span>
              <span className="font-medium text-foreground/80">Workspace</span> {model.workspaceName}
              <span className="mx-2 text-border">·</span>
              <span className="font-medium text-foreground/80">Cycle</span> {model.paymentCycleLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
