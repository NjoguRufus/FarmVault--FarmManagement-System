import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  buildFarmVaultActivationRequestMessage,
  buildFarmVaultActivationWhatsAppUrl,
} from '@/lib/whatsappClickToChat';

const REDIRECT_COUNTDOWN_SECONDS = 2;

export interface PendingCompanyApprovalScreenProps {
  companyName: string;
  companyEmail: string;
  planLabel: string;
  onContinueToAccessGate: () => void;
}

export function PendingCompanyApprovalScreen({
  companyName,
  companyEmail,
  planLabel,
  onContinueToAccessGate,
}: PendingCompanyApprovalScreenProps) {
  const [cancelAutoRedirect, setCancelAutoRedirect] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_COUNTDOWN_SECONDS);

  const message = buildFarmVaultActivationRequestMessage({
    companyName: companyName.trim(),
    planLabel: planLabel.trim() || '—',
    companyEmail: companyEmail.trim(),
  });
  const waUrl = buildFarmVaultActivationWhatsAppUrl(message) ?? '';

  useEffect(() => {
    if (cancelAutoRedirect || !waUrl) return;

    let remaining = REDIRECT_COUNTDOWN_SECONDS;
    setSecondsLeft(remaining);

    const id = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(id);
        setSecondsLeft(0);
        window.open(waUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      setSecondsLeft(remaining);
    }, 1000);

    return () => window.clearInterval(id);
  }, [cancelAutoRedirect, waUrl]);

  const openWhatsAppNow = () => {
    if (!waUrl) return;
    setCancelAutoRedirect(true);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const stayOnThisPage = () => {
    setCancelAutoRedirect(true);
  };

  const showAutoRedirect = Boolean(waUrl) && !cancelAutoRedirect;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <Card className="w-full max-w-md rounded-2xl shadow-xl border-primary/10 overflow-hidden">
        <CardContent className="p-8 sm:p-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CheckCircle2 className="h-10 w-10" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Welcome to FarmVault, {companyName}
          </h1>
          <p className="text-muted-foreground text-sm mb-4">
            Your company has been submitted for manual approval. We will activate your workspace after
            review.
          </p>

          {showAutoRedirect && (
            <p className="text-sm text-foreground font-medium mb-6" aria-live="polite">
              Redirecting to WhatsApp in {secondsLeft} second{secondsLeft === 1 ? '' : 's'}...
            </p>
          )}

          {!waUrl && (
            <p className="text-xs text-muted-foreground mb-6">
              WhatsApp quick-open is not available yet. Use Continue below to proceed.
              {import.meta.env.DEV && (
                <>
                  {' '}
                  Set <span className="font-mono">VITE_FARMVAULT_ACTIVATION_WHATSAPP</span> to enable the countdown
                  and WhatsApp button.
                </>
              )}
            </p>
          )}

          {waUrl && cancelAutoRedirect && (
            <p className="text-xs text-muted-foreground mb-6">
              Automatic redirect cancelled. You can open WhatsApp when you are ready.
            </p>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={openWhatsAppNow}
              disabled={!waUrl}
              title={!waUrl ? 'WhatsApp number not configured' : undefined}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-sm font-medium text-white shadow-[0_4px_24px_-4px_rgba(37,211,102,0.35)] hover:bg-[#20BD5A] transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              Open WhatsApp now
            </button>

            {!cancelAutoRedirect && (
              <button
                type="button"
                onClick={stayOnThisPage}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-all"
              >
                Stay on this page
              </button>
            )}

            <button
              type="button"
              onClick={onContinueToAccessGate}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_4px_24px_-4px_rgba(45,74,62,0.25)] hover:bg-primary/90 transition-all"
            >
              Continue to Access Gate
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
