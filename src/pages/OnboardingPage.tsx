/**
 * Onboarding: create company + membership + profile, start trial, then optional project (same NewProjectForm as Projects).
 */
import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useUser, useAuth as useClerkAuth } from '@clerk/react';
import { supabase, getSupabaseAccessToken } from '@/lib/supabase';
import { invokeNotifyCompanySubmissionReceived } from '@/lib/email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  clearOnboardingSessionProgress,
  readOnboardingSessionProgress,
  saveOnboardingSessionProgress,
} from '@/lib/onboardingSessionProgress';
import { writePendingApprovalSession, type PendingApprovalSessionPayload } from '@/lib/pendingApprovalSession';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { setPostOnboardingFirstProjectWelcomeFlag } from '@/lib/postOnboardingProjectWelcome';
import { PremiumOnboardingShell } from '@/components/onboarding/PremiumOnboardingShell';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type EmailValidationResult = { ok: boolean; message?: string | null };

export default function OnboardingPage() {
  const { resetRequired, refreshAuthState, syncTenantCompanyFromServer, authReady, user: fvUser } = useAuth();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const startedTracked = useRef(false);
  const onboardingRestoredRef = useRef(false);
  const exitingOnboardingRef = useRef(false);

  const clerkId = clerkUser?.id ?? null;
  const accountEmail = clerkUser?.primaryEmailAddress?.emailAddress?.trim() ?? '';
  const companyEmailTrim = companyEmail.trim();
  const companyEmailFormatOk =
    companyEmailTrim === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmailTrim);
  const step1Valid = companyName.trim().length >= 2 && companyEmailFormatOk;

  useEffect(() => {
    if (!clerkUser) return;
    setCompanyEmail((prev) => (prev.trim() !== '' ? prev : accountEmail));
  }, [clerkUser, accountEmail]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      navigate('/sign-in', { replace: true });
      return;
    }
  }, [isLoaded, isSignedIn, navigate]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || startedTracked.current) return;
    startedTracked.current = true;
    captureEvent(AnalyticsEvents.ONBOARDING_STARTED, {
      user_id: clerkId ?? undefined,
      module_name: 'onboarding',
      route_path: '/onboarding',
    });
  }, [isLoaded, isSignedIn, clerkId]);

  useEffect(() => {
    if (!authReady || !isLoaded || !isSignedIn || !clerkId || onboardingRestoredRef.current) return;

    const saved = readOnboardingSessionProgress(clerkId);
    if (!saved) {
      onboardingRestoredRef.current = true;
      return;
    }

    if (saved.step === 1) {
      onboardingRestoredRef.current = true;
      setStep(1);
      if (saved.companyName) setCompanyName(saved.companyName);
      if (saved.companyEmail) setCompanyEmail(saved.companyEmail);
      return;
    }

    if (!saved.companyId) {
      clearOnboardingSessionProgress();
      onboardingRestoredRef.current = true;
      return;
    }

    const activeCo = fvUser?.companyId ?? null;
    if (!activeCo) return;

    if (activeCo !== saved.companyId) {
      clearOnboardingSessionProgress();
      onboardingRestoredRef.current = true;
      return;
    }

    onboardingRestoredRef.current = true;
    setCompanyId(saved.companyId);
    setCompanyName(saved.companyName);
    setCompanyEmail(saved.companyEmail);
    setStep(saved.step);
  }, [authReady, isLoaded, isSignedIn, clerkId, fvUser?.companyId]);

  useEffect(() => {
    if (exitingOnboardingRef.current || !clerkId || !isSignedIn) return;
    saveOnboardingSessionProgress({
      clerkUserId: clerkId,
      step: step as 1 | 2 | 3,
      companyId,
      companyName: companyName.trim(),
      companyEmail: companyEmail.trim(),
    });
  }, [clerkId, isSignedIn, step, companyId, companyName, companyEmail]);

  const fillCompanyEmailFromAccount = () => {
    if (!accountEmail) {
      toast({
        title: 'No account email',
        description: 'Add an email to your FarmVault sign-in account, then try again.',
        variant: 'destructive',
      });
      return;
    }
    setCompanyEmail(accountEmail);
  };

  const handleStep1CreateCompany = async () => {
    if (!step1Valid || !clerkId) return;
    const trimmedFarm = companyName.trim();
    if (trimmedFarm.length < 2) {
      setError(
        'Please enter your farm or company name (at least 2 characters). This is your workspace name — not your personal name.',
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const normalizedCompanyEmail = companyEmail.trim().toLowerCase();
      if (normalizedCompanyEmail) {
        const { data: companyCheck } = await supabase.rpc('validate_email_uniqueness', {
          _email: normalizedCompanyEmail,
          _company_id: null,
          _exclude_clerk_user_id: clerkId,
        });
        const companyValidation = companyCheck as EmailValidationResult | null;
        if (companyValidation && companyValidation.ok === false) {
          setError(companyValidation.message ?? 'Company email already exists.');
          setLoading(false);
          return;
        }
      }

      const token = await getSupabaseAccessToken();
      if (!token) {
        const message =
          'Session token not available. Sign out and sign in again. If it persists, ensure Clerk is added as a third-party auth provider in Supabase (Authentication → Third-Party).';
        setError(message);
        toast({
          title: 'Session problem',
          description: message,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const { data: cid, error: rpcErr } = await supabase.rpc('create_company_with_admin', {
        _name: trimmedFarm,
      });

      if (rpcErr || !cid) {
        const message = rpcErr?.message ?? 'Failed to create company';
        setError(message);
        toast({
          title: 'Company error',
          description: message,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const newId = cid as string;
      setCompanyId(newId);
      captureEvent(AnalyticsEvents.COMPANY_CREATED, {
        company_id: newId,
        company_name: trimmedFarm,
        user_id: clerkId ?? undefined,
        module_name: 'onboarding',
      });
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[Onboarding] company_created', {
          companyId: newId,
          companyName: companyName.trim(),
          companyEmail: normalizedCompanyEmail || null,
        });
      }
      if (normalizedCompanyEmail) {
        const { error: emailUpErr } = await supabase
          .schema('core')
          .from('companies')
          .update({ email: normalizedCompanyEmail, updated_at: new Date().toISOString() })
          .eq('id', newId);
        if (emailUpErr && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[Onboarding] optional company email not saved on core.companies', emailUpErr);
        }
      }
      await syncTenantCompanyFromServer();
      setStep(2);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      setError(message);
      toast({
        title: 'Onboarding failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const sendSubmissionEmailsAndSession = async () => {
    if (!companyId) return;

    const recipient =
      accountEmail.trim().toLowerCase() ||
      companyEmail.trim().toLowerCase() ||
      '';
    const base =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'https://app.farmvault.africa'
        : typeof window !== 'undefined'
          ? window.location.origin
          : 'https://app.farmvault.africa';
    const dashboardUrl = `${base}/dashboard`;
    const approvalDashboardUrl = `${base}/developer/companies`;
    const submitterEmail = accountEmail.trim().toLowerCase() || recipient;

    void (async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return;
      const result = await invokeNotifyCompanySubmissionReceived({
        to: recipient,
        companyName: companyName.trim(),
        dashboardUrl,
        userEmail: submitterEmail,
        approvalDashboardUrl,
      });
      if (!result.ok) {
        const msg = [result.detail, result.error].filter(Boolean).join(' — ') || 'Unknown error';
        toast({
          title: 'Confirmation email not sent',
          description: msg,
        });
      }
    })();

    const payloadEmail =
      companyEmail.trim().toLowerCase() || accountEmail.toLowerCase() || '';
    const payload: PendingApprovalSessionPayload = {
      companyName: companyName.trim(),
      companyEmail: payloadEmail,
      companyId,
      startingPlanLabel: 'Pro Trial',
    };
    writePendingApprovalSession(payload);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Onboarding] handoff_to_dashboard', payload);
    }
    try {
      await syncTenantCompanyFromServer();
      await refreshAuthState();
    } catch {
      /* non-fatal */
    }
  };

  const handleStep2Continue = async () => {
    if (!companyId || !clerkId) {
      setError('Missing company or session. Try creating your company again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: subErr } = await supabase.rpc('initialize_company_subscription', {
        _company_id: companyId,
        _plan_code: 'pro',
      });

      if (subErr && /Could not find the function public\.initialize_company_subscription/i.test(subErr.message)) {
        const { error: fallbackErr } = await supabase.rpc('start_trial', {
          p_company_id: companyId,
          p_plan_id: 'pro',
          p_trial_ends_at: null,
        });
        if (fallbackErr) {
          setError(fallbackErr.message);
          return;
        }
      } else if (subErr) {
        setError(subErr.message);
        return;
      }

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[Onboarding] subscription_initialized', { companyId });
      }

      captureEvent(AnalyticsEvents.TRIAL_STARTED, {
        company_id: companyId,
        subscription_plan: 'pro',
        module_name: 'onboarding',
      });
      captureEvent(AnalyticsEvents.ONBOARDING_COMPLETED, {
        company_id: companyId,
        module_name: 'onboarding',
      });

      await sendSubmissionEmailsAndSession();
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to continue');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (resetRequired) {
    return <Navigate to="/start-fresh" replace />;
  }

  const goDashboard = () => {
    exitingOnboardingRef.current = true;
    clearOnboardingSessionProgress();
    navigate('/dashboard', { replace: true });
  };

  const handleOnboardingProjectSuccess = () => {
    setPostOnboardingFirstProjectWelcomeFlag();
    goDashboard();
  };

  return (
    <PremiumOnboardingShell
      step={step}
      rightTitle={step === 1 ? 'Create your farm workspace' : step === 2 ? 'Confirm your trial' : 'Finish setup'}
      rightSubtitle={
        step === 1
          ? "Let’s name your workspace — this is how your farm appears across FarmVault."
          : step === 2
            ? 'Your workspace is created. Continue to activate your Pro trial and unlock full tracking.'
            : "Your farm is ready. Create your first project now, or jump straight into the dashboard."
      }
      logo={
        <div className="flex items-center gap-3">
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault"
            className="h-10 w-auto rounded-lg object-contain bg-white/85 p-1 shadow-sm"
          />
        </div>
      }
      belowPanel={
        step === 3 ? (
          <div className="rounded-[18px] border border-white/22 bg-white/90 p-4 sm:p-6 shadow-[0_22px_60px_rgba(0,0,0,0.26)]">
            <NewProjectForm onCancel={goDashboard} onSuccess={handleOnboardingProjectSuccess} />
          </div>
        ) : null
      }
    >
      {error && (
        <div className="mb-5 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white/90">
          {error}
        </div>
      )}

      <AlertDialog open={skipConfirmOpen} onOpenChange={setSkipConfirmOpen}>
        <AlertDialogContent className="max-w-md rounded-2xl border border-white/10 bg-black/70 text-white shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Skip project creation?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/75">
              Are you sure? It&apos;s recommended that you create your first project so you can start tracking immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/15">
              Continue setup
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#1F3D2B] text-white hover:bg-[#1B3526]"
              onClick={goDashboard}
            >
              Yes, skip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {step === 1 && (
        <div className="animate-in fade-in-0 duration-300">
          {orgLogoUrl && (
            <div className="flex justify-center mb-5">
              <img
                src={orgLogoUrl}
                alt="Organization logo"
                className="h-16 w-16 rounded-2xl object-cover border border-white/20 shadow-sm"
              />
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-sm font-medium text-white/90">
                What should we call your farm?
              </Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Green Valley Farm Ltd"
                autoComplete="organization"
                required
                minLength={2}
                className="h-12 rounded-xl border border-white/18 bg-white/85 px-4 text-[#111111] shadow-sm transition-all duration-200 placeholder:text-[#6B7280]/80 focus-visible:ring-2 focus-visible:ring-[#1F3D2B]/25 focus-visible:ring-offset-0"
              />
              <p className="text-xs leading-relaxed text-white/65">
                This becomes your workspace name. You can change it later in settings.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label htmlFor="companyEmail" className="text-sm font-medium text-white/90">
                  Where should we send workspace updates? <span className="text-white/60 font-normal">(optional)</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-full border border-white/18 bg-white/20 text-xs text-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-white/25"
                  onClick={fillCompanyEmailFromAccount}
                  disabled={!accountEmail}
                >
                  Use my account email
                </Button>
              </div>

              <Input
                id="companyEmail"
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder={accountEmail || 'you@example.com'}
                autoComplete="email"
                className="h-12 rounded-xl border border-white/18 bg-white/85 px-4 text-[#111111] shadow-sm transition-all duration-200 placeholder:text-[#6B7280]/80 focus-visible:ring-2 focus-visible:ring-[#1F3D2B]/25 focus-visible:ring-offset-0"
              />
              <p className="text-xs leading-relaxed text-white/65">
                Optional. If your farm doesn’t have a separate email, your personal email works fine.
              </p>
            </div>
          </div>

          <Button
            className="mt-7 h-12 w-full rounded-full bg-[#1F3D2B] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#1B3526] active:translate-y-0"
            onClick={handleStep1CreateCompany}
            disabled={!step1Valid || loading}
          >
            {loading ? 'Creating…' : 'Continue'}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in-0 duration-300">
          <div className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/10 px-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white shadow-sm">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/95">Workspace created</p>
              <p className="text-xs leading-relaxed text-white/70">
                <strong className="font-semibold text-white/95">{companyName}</strong> will start on{' '}
                <strong className="font-semibold text-white/95">Pro</strong> with a{' '}
                <strong className="font-semibold text-white/95">7-day trial</strong> after approval.
              </p>
            </div>
          </div>

          <Button
            className="mt-6 h-12 w-full rounded-full bg-[#1F3D2B] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#1B3526] active:translate-y-0"
            onClick={() => void handleStep2Continue()}
            disabled={loading}
          >
            {loading ? 'Preparing…' : 'Activate trial'}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-white/65">
            You can create your first project next, or skip and do it later from the dashboard.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="animate-in fade-in-0 duration-300">
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white/95">Create your first project</h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/55 shadow-none transition-all hover:bg-white/12 sm:border-white/14 sm:bg-white/16 sm:px-3 sm:py-1.5 sm:text-[11px] sm:text-white/75 sm:shadow-none sm:hover:bg-white/20"
                onClick={() => setSkipConfirmOpen(true)}
              >
                Skip for now
              </Button>
            </div>
          </div>
        </div>
      )}
    </PremiumOnboardingShell>
  );
}
