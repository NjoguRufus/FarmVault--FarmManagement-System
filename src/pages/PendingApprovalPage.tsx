/**
 * Shown after onboarding submit while subscription status is pending_approval.
 * User is informed by email when the workspace is ready; gate polling + Realtime handle transition to dashboard.
 */
import React, { useEffect, useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionGateState } from '@/services/subscriptionService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { readPendingApprovalSession, type PendingApprovalSessionPayload } from '@/lib/pendingApprovalSession';
import { useCompanySubscriptionRealtime } from '@/hooks/useCompanySubscriptionRealtime';

const bullets = [
  "We've received your farm details",
  "We're preparing your FarmVault workspace",
  "You'll receive an email once your farm is ready",
] as const;

export default function PendingApprovalPage() {
  const { user, logout, authReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as Partial<PendingApprovalSessionPayload> | null;
  const stored = useMemo(() => readPendingApprovalSession(), [location.key]);

  const { data: gate, isLoading: gateLoading, isError: gateError } = useQuery({
    queryKey: ['subscription-gate', 'pending-approval-page'],
    queryFn: () => getSubscriptionGateState(),
    enabled: authReady && !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const s = (q.state.data?.status ?? 'pending_approval').toLowerCase();
      return s === 'pending_approval' ? 2_000 : false;
    },
  });

  const companyId =
    user?.companyId ??
    navState?.companyId ??
    stored?.companyId ??
    gate?.company_id ??
    null;

  useCompanySubscriptionRealtime(companyId, Boolean(companyId));

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

  const gateStatus = useMemo(
    () => (gate?.status ?? 'pending_approval').toLowerCase(),
    [gate?.status],
  );

  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[PendingApproval] Page mounted', { companyId, companyName, companyEmail });
    }
  }, [companyId, companyName, companyEmail]);

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

  if (gateError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-sm text-muted-foreground text-center max-w-md">
          We couldn&apos;t load your approval status. Stay on this page and try again, or refresh.
        </p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>
    );
  }

  if (gateLoading && !gate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading your request…</p>
      </div>
    );
  }

  if (!gateLoading && !gate && !companyId && !stored?.companyId && !navState?.companyId) {
    return <Navigate to="/onboarding" replace />;
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
            <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Awaiting approval
            </span>
          </div>

          <div className="flex justify-center">
            <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center">
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
          </div>

          <div className="space-y-2 text-center sm:text-left">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              You&apos;re Almost There 🌱
            </h1>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">
              {companyName}
            </p>
          </div>

          <ul className="space-y-3 text-sm">
            {bullets.map((line) => (
              <li key={line} className="flex gap-3 text-muted-foreground leading-snug">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
                  aria-hidden
                />
                <span className="text-foreground/90">{line}</span>
              </li>
            ))}
          </ul>

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

          <p className="text-sm text-muted-foreground text-center sm:text-left border-t border-border/60 pt-5">
            No action needed — we&apos;ll notify you shortly.
          </p>

          <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
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
