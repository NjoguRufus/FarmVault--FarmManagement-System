import React from 'react';
import { ChevronRight, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export interface PendingCompanyApprovalScreenProps {
  companyName: string;
  companyEmail: string;
  planLabel: string;
  onContinueToAccessGate: () => void;
}

const bullets = [
  "We've received your farm details",
  "We're preparing your FarmVault workspace",
  "You'll receive an email once your farm is ready",
] as const;

export function PendingCompanyApprovalScreen({
  companyName,
  companyEmail,
  planLabel,
  onContinueToAccessGate,
}: PendingCompanyApprovalScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <Card className="w-full max-w-md rounded-2xl shadow-xl border-primary/10 overflow-hidden">
        <CardContent className="p-8 sm:p-10 text-center">
          <div className="relative mx-auto mb-6 flex h-[5.5rem] w-[5.5rem] items-center justify-center">
            <div
              className="absolute inset-0 rounded-2xl bg-primary/10 blur-xl"
              aria-hidden
            />
            <div className="relative flex h-full w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/15 shadow-inner">
              <Mail className="h-9 w-9 text-primary" strokeWidth={1.75} aria-hidden />
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5"
              aria-hidden
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/50" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">
            You&apos;re Almost There 🌱
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium mb-6">
            {companyName}
          </p>

          <ul className="text-left space-y-3 mb-8 px-1">
            {bullets.map((line) => (
              <li key={line} className="flex gap-3 text-sm text-muted-foreground leading-snug">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
                  aria-hidden
                />
                <span className="text-foreground/90">{line}</span>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-border/80 bg-muted/25 px-4 py-3 text-left text-xs text-muted-foreground mb-6 space-y-1.5">
            <div className="flex justify-between gap-3">
              <span>Email</span>
              <span className="font-medium text-foreground text-right break-all">{companyEmail}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Plan</span>
              <span className="font-medium text-foreground text-right">
                {planLabel.trim() || '—'}
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-8 border-t border-border/60 pt-6">
            No action needed — we&apos;ll notify you shortly.
          </p>

          <button
            type="button"
            onClick={onContinueToAccessGate}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_4px_24px_-4px_rgba(45,74,62,0.25)] hover:bg-primary/90 transition-all"
          >
            Continue to Access Gate
            <ChevronRight className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
