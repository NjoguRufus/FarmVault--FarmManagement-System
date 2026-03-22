/**
 * Shown after onboarding submit while subscription status is pending_approval.
 * Countdown → opens WhatsApp with a prefilled activation message (click-to-chat only).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, ExternalLink, LogOut, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionGateState } from '@/services/subscriptionService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  buildFarmVaultActivationRequestMessage,
  buildFarmVaultActivationWhatsAppUrl,
  hasFarmVaultActivationWhatsApp,
} from '@/lib/whatsappClickToChat';
import { readPendingApprovalSession, type PendingApprovalSessionPayload } from '@/lib/pendingApprovalSession';
import { useCompanySubscriptionRealtime } from '@/hooks/useCompanySubscriptionRealtime';

export default function PendingApprovalPage() {
  const { user, logout, authReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as Partial<PendingApprovalSessionPayload> | null;
  const stored = useMemo(() => readPendingApprovalSession(), [location.key]);

  const companyId = user?.companyId ?? navState?.companyId ?? stored?.companyId ?? null;

  /** Instant handoff when developer activates/approves (Realtime + short poll fallback). */
  useCompanySubscriptionRealtime(companyId, Boolean(companyId));

  const { data: gate, isLoading: gateLoading } = useQuery({
    queryKey: ['subscription-gate', companyId],
    queryFn: () => getSubscriptionGateState(),
    enabled: !!companyId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const s = (q.state.data?.status ?? '').toLowerCase();
      return s === 'pending_approval' ? 2_000 : false;
    },
  });

  const companyName =
    navState?.companyName?.trim() ||
    stored?.companyName?.trim() ||
    gate?.company_name?.trim() ||
    'Your company';
  const companyEmail =
    navState?.companyEmail?.trim() ||
    stored?.companyEmail?.trim() ||
    user?.email?.trim() ||
    '—';
  const startingPlanLabel =
    navState?.startingPlanLabel?.trim() ||
    stored?.startingPlanLabel?.trim() ||
    'Pro Trial (7 days after approval)';

  const activationMessage = useMemo(
    () =>
      buildFarmVaultActivationRequestMessage({
        companyName,
        companyEmail,
        planLabel: startingPlanLabel,
      }),
    [companyName, companyEmail, startingPlanLabel],
  );

  const whatsappUrl = useMemo(() => buildFarmVaultActivationWhatsAppUrl(activationMessage), [activationMessage]);

  const gateStatus = useMemo(() => (gate?.status ?? '').toLowerCase(), [gate?.status]);

  const [countdown, setCountdown] = useState(2);
  const [stayOnPage, setStayOnPage] = useState(false);
  const [autoRedirectDone, setAutoRedirectDone] = useState(false);
  const openedRef = useRef(false);

  const openWhatsApp = useCallback(() => {
    if (!whatsappUrl) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          '[PendingApproval] WhatsApp URL missing — set VITE_FARMVAULT_ACTIVATION_WHATSAPP or VITE_WHATSAPP_ACTIVATION_NUMBER',
        );
      }
      return;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[PendingApproval] Opening WhatsApp (click-to-chat)', { urlLength: whatsappUrl.length });
    }
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }, [whatsappUrl]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[PendingApproval] Page mounted', {
        companyId,
        companyName,
        companyEmail,
        hasWhatsApp: hasFarmVaultActivationWhatsApp(),
      });
    }
  }, [companyId, companyName, companyEmail]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[PendingApproval] Generated WhatsApp message', { message: activationMessage });
    }
  }, [activationMessage]);

  useEffect(() => {
    if (!whatsappUrl || stayOnPage || autoRedirectDone || openedRef.current) return;

    if (countdown <= 0) {
      openedRef.current = true;
      setAutoRedirectDone(true);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[PendingApproval] Auto redirect trigger (2s elapsed)');
      }
      openWhatsApp();
      return;
    }

    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, stayOnPage, autoRedirectDone, whatsappUrl, openWhatsApp]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  if (!companyId && !gateLoading) {
    return <Navigate to="/onboarding" replace />;
  }

  if (gateLoading && !gate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading your request…</p>
      </div>
    );
  }

  if (!gateLoading && gate && gateStatus !== 'pending_approval') {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[PendingApproval] Gate status is not pending_approval → dashboard', { gateStatus });
    }
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <Card className="w-full max-w-lg rounded-2xl shadow-xl border-primary/10 overflow-hidden">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <img
              src="/Logo/FarmVault_Logo dark mode.png"
              alt="FarmVault"
              className="h-10 w-auto rounded-lg object-contain bg-sidebar-primary/10 p-1"
            />
            <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Awaiting approval</span>
          </div>

          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700">
              <CheckCircle2 className="h-10 w-10" />
            </div>
          </div>

          <div className="space-y-2 text-center sm:text-left">
            <h1 className="text-xl font-semibold text-foreground">Company created successfully</h1>
            <p className="text-sm text-muted-foreground">
              Your company has been created successfully and is awaiting approval. We are redirecting you to WhatsApp so
              you can request activation.
            </p>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Company</span>
              <span className="font-medium text-right">{companyName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Company email</span>
              <span className="font-medium text-right break-all">{companyEmail}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Starting plan</span>
              <span className="font-medium text-right">{startingPlanLabel}</span>
            </div>
          </div>

          {!hasFarmVaultActivationWhatsApp() && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              WhatsApp number is not configured. Add{' '}
              <code className="font-mono">VITE_FARMVAULT_ACTIVATION_WHATSAPP</code> or{' '}
              <code className="font-mono">VITE_WHATSAPP_ACTIVATION_NUMBER</code> (digits with country code).
            </p>
          )}

          <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 py-3 px-4">
            <Clock3 className="h-5 w-5 text-primary shrink-0" />
            <div className="text-sm text-center sm:text-left">
              {!whatsappUrl ? (
                <span>Add a WhatsApp number in the environment to enable automatic open after 2 seconds.</span>
              ) : stayOnPage ? (
                <span>Auto-open cancelled. Use the button below when you&apos;re ready.</span>
              ) : (
                <span>
                  Opening WhatsApp in <strong>{countdown}</strong> second{countdown === 1 ? '' : 's'}…
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1 gap-2" onClick={openWhatsApp} disabled={!whatsappUrl}>
              <MessageCircle className="h-4 w-4" />
              Open WhatsApp now
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setStayOnPage(true);
                if (import.meta.env.DEV) {
                  // eslint-disable-next-line no-console
                  console.log('[PendingApproval] User chose to stay on this page (cancel auto-open)');
                }
              }}
              disabled={stayOnPage}
            >
              Stay on this page
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => navigate('/features')}>
              Preview FarmVault
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
