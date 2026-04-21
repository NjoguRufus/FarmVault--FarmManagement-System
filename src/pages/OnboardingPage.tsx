import { logger } from "@/lib/logger";
/**
 * Onboarding: create company + membership + profile, start trial, then optional project (same NewProjectForm as Projects).
 */
import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useUser, useAuth as useClerkAuth } from '@clerk/react';
import { supabase, getSupabaseAccessToken } from '@/lib/supabase';
import {
  invokeNotifyCompanyProTrialStarted,
  invokeNotifyCompanySubmissionReceived,
  invokeNotifyDeveloperCompanyRegistered,
} from '@/lib/email';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { APP_ENTRY_PATH } from '@/lib/routing/appEntryPaths';
import {
  clearOnboardingSessionProgress,
  readOnboardingSessionProgress,
  saveOnboardingSessionProgress,
} from '@/lib/onboardingSessionProgress';
import { useQueryClient } from '@tanstack/react-query';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { createFarm } from '@/services/farmsService';
import {
  setPostOnboardingFirstProjectWelcomeFlag,
  setPostOnboardingProTrialWelcome,
} from '@/lib/postOnboardingProjectWelcome';
import { PremiumOnboardingShell } from '@/components/onboarding/PremiumOnboardingShell';
import {
  clearFarmerReferralStorageAfterSuccess,
  getPersistedReferralCode,
  getReferralDeviceId,
} from '@/lib/ambassador/referralPersistence';
import { markMyFarmerReferralOnboardingComplete } from '@/services/ambassadorService';
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

const ONBOARDING_PROGRESS_STEPS = [
  { label: 'Company' },
  { label: 'Pro trial' },
  { label: 'First farm' },
  { label: 'Project' },
  { label: 'Finish' },
] as const;

export default function OnboardingPage() {
  const {
    resetRequired,
    refreshAuthState,
    syncTenantCompanyFromServer,
    authReady,
    user: fvUser,
    setupIncomplete,
  } = useAuth();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [firstFarmId, setFirstFarmId] = useState<string | null>(null);
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [ownershipType, setOwnershipType] = useState<'owned' | 'leased'>('owned');
  const [leaseCost, setLeaseCost] = useState('');
  const [leaseDuration, setLeaseDuration] = useState('');
  const [leaseDurationType, setLeaseDurationType] = useState<'months' | 'years'>('months');
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
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate('/sign-in', { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || startedTracked.current) return;
    startedTracked.current = true;
    captureEvent(AnalyticsEvents.ONBOARDING_STARTED, {
      user_id: clerkId ?? undefined,
      module_name: 'onboarding',
      route_path: '/onboarding/company',
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
      step: step as 1 | 2 | 3 | 4 | 5,
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
        _referral_code: getPersistedReferralCode(),
        _referral_device_id: getReferralDeviceId(),
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
        logger.log('[Onboarding] company_created', {
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
      try {
        clearFarmerReferralStorageAfterSuccess();
      } catch {
        /* ignore */
      }
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
    const dashboardUrl = `${base}${APP_ENTRY_PATH}`;
    const submitterEmail = accountEmail.trim().toLowerCase() || recipient;

    setPostOnboardingProTrialWelcome(companyName.trim());

    void (async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return;
      const approvalDashboardUrl = `${base}/developer/companies`;
      const result = await invokeNotifyCompanySubmissionReceived({
        to: recipient,
        companyName: companyName.trim(),
        dashboardUrl,
        userEmail: submitterEmail,
        approvalDashboardUrl,
        onboardingCompleteDeveloperNotify: true,
      });
      if (!result.ok) {
        const msg = [result.detail, result.error].filter(Boolean).join(' — ') || 'Unknown error';
        toast({
          title: 'Confirmation email not sent',
          description: msg,
        });
      }
    })();

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.log('[Onboarding] handoff_to_dashboard', { companyId, companyName: companyName.trim() });
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
        logger.log('[Onboarding] subscription_initialized', { companyId });
      }

      captureEvent(AnalyticsEvents.TRIAL_STARTED, {
        company_id: companyId,
        subscription_plan: 'pro',
        module_name: 'onboarding',
      });

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

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const isCompanyAdmin = fvUser?.role === 'company-admin';
  if (fvUser?.companyId && !isCompanyAdmin && setupIncomplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-lg font-semibold text-foreground">Workspace setup in progress</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Your company admin is finishing FarmVault onboarding (trial activation and first steps). You&apos;ll get full
          access once they complete setup.
        </p>
      </div>
    );
  }

  // Fully onboarded tenant — leave this flow.
  if (fvUser?.companyId && !setupIncomplete) {
    return <Navigate to={APP_ENTRY_PATH} replace />;
  }

  // Ambassador-only users must not reach company onboarding (no capabilities RPC wait).
  const pt = fvUser?.profileUserType;
  if (pt === 'ambassador' || (pt === 'both' && !fvUser?.companyId)) {
    return <Navigate to="/ambassador/console/dashboard" replace />;
  }

  const goToFinishStep = () => {
    setStep(5);
  };

  const handleOnboardingProjectSuccess = () => {
    setPostOnboardingFirstProjectWelcomeFlag();
    goToFinishStep();
  };

  const handleStep3CreateFarm = async () => {
    if (!companyId || !fvUser?.id) {
      setError('Missing company or user session.');
      return;
    }
    if (!farmName.trim() || !farmLocation.trim()) {
      setError('Farm name and location are required.');
      return;
    }
    if (
      ownershipType === 'leased' &&
      (!(Number(leaseCost) > 0) || !(Number(leaseDuration) > 0))
    ) {
      setError('Lease cost and duration are required for leased farms.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const farm = await createFarm({
        companyId,
        name: farmName.trim(),
        location: farmLocation.trim(),
        ownershipType,
        leaseCost: ownershipType === 'leased' ? Number(leaseCost) : null,
        leaseDuration: ownershipType === 'leased' ? Number(leaseDuration) : null,
        leaseDurationType: ownershipType === 'leased' ? leaseDurationType : null,
      });

      // Avoid the "farm dropdown delay" in the next step by seeding the farms cache immediately.
      // NewProjectForm reads farms from React Query: ['farms', companyId].
      queryClient.setQueryData(['farms', companyId], (prev: unknown) => {
        const arr = Array.isArray(prev) ? (prev as any[]) : [];
        // Deduplicate by id.
        const without = arr.filter((x) => (x as any)?.id !== farm.id);
        return [farm, ...without];
      });
      // Background refetch to ensure server is source of truth.
      void queryClient.invalidateQueries({ queryKey: ['farms', companyId] });

      setFirstFarmId(farm.id);
      setStep(4);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
            ? ((e as { message?: string }).message ?? 'Failed to create farm')
            : 'Failed to create farm';
      setError(message);
      toast({ title: 'Farm creation failed', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleStep4Finish = async () => {
    if (!companyId) {
      setError('Missing company. Try creating your company again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: finErr } = await supabase.rpc('complete_company_onboarding', {
        _company_id: companyId,
      });
      if (finErr) {
        setError(finErr.message);
        toast({
          title: 'Could not finish setup',
          description: finErr.message,
          variant: 'destructive',
        });
        return;
      }

      captureEvent(AnalyticsEvents.ONBOARDING_COMPLETED, {
        company_id: companyId,
        module_name: 'onboarding',
      });

      void invokeNotifyDeveloperCompanyRegistered(companyId).then((r) => {
        if (import.meta.env.DEV && !r.ok && !r.skipped) {
          // eslint-disable-next-line no-console
          console.warn('[Onboarding] notify-developer-company-registered', r.error, r.detail);
        }
      });

      void invokeNotifyCompanyProTrialStarted(companyId, getSupabaseAccessToken).catch(() => {
        /* non-fatal: owner pro-trial email */
      });

      try {
        await markMyFarmerReferralOnboardingComplete();
      } catch {
        /* non-fatal */
      }

      await sendSubmissionEmailsAndSession();
      exitingOnboardingRef.current = true;
      clearOnboardingSessionProgress();
      clearFarmerReferralStorageAfterSuccess();
      await syncTenantCompanyFromServer();
      await refreshAuthState();
      navigate(APP_ENTRY_PATH, { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to finish setup';
      setError(message);
      toast({
        title: 'Finish setup failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const shellTitle =
    step === 1
      ? 'Create your farm workspace'
      : step === 2
        ? 'Activate Pro trial'
        : step === 3
          ? 'Create your first farm'
          : step === 4
            ? 'Create your first project'
          : "You're ready";

  const shellSubtitle =
    step === 1
      ? "Let’s name your workspace — this is how your farm appears across FarmVault."
      : step === 2
        ? 'Your workspace starts on Basic until you activate your 7-day Pro trial — unlock full tracking next.'
        : step === 3
          ? 'Set up your first farm so project creation can use structured farm selection.'
          : step === 4
            ? 'Add one project now so you can start tracking this season, or continue to the final step.'
          : 'Confirm to open your dashboard. You can change plans anytime in billing.';

  return (
    <PremiumOnboardingShell
      step={step}
      progressSteps={[...ONBOARDING_PROGRESS_STEPS]}
      rightTitle={shellTitle}
      rightSubtitle={shellSubtitle}
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
        step === 4 ? (
          <div className="rounded-[18px] border border-white/22 bg-white/90 p-4 sm:p-6 shadow-[0_22px_60px_rgba(0,0,0,0.26)]">
            <NewProjectForm
              onCancel={goToFinishStep}
              onSuccess={handleOnboardingProjectSuccess}
              initialFarmId={firstFarmId}
            />
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
              You can add a project anytime from the dashboard. Continue to the final step to finish workspace setup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-full border-white/15 bg-white/10 text-white hover:bg-white/15">
              Continue setup
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#1F3D2B] text-white hover:bg-[#1B3526]"
              onClick={() => {
                setSkipConfirmOpen(false);
                goToFinishStep();
              }}
            >
              Continue without project
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
                <strong className="font-semibold text-white/95">{companyName}</strong> is on{' '}
                <strong className="font-semibold text-white/95">Basic</strong> until you activate your{' '}
                <strong className="font-semibold text-white/95">7-day Pro trial</strong> below.
              </p>
            </div>
          </div>

          <Button
            className="mt-6 h-12 w-full rounded-full bg-[#1F3D2B] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#1B3526] active:translate-y-0"
            onClick={() => void handleStep2Continue()}
            disabled={loading}
          >
            {loading ? 'Activating…' : 'Activate Pro trial'}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-white/65">
            Next you&apos;ll create your first farm, then your first project.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="animate-in fade-in-0 duration-300">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-white/90">Farm name</Label>
              <Input
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g. North Block Farm"
                className="h-12 rounded-xl border border-white/18 bg-white/85 px-4 text-[#111111]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-white/90">Location</Label>
              <Input
                value={farmLocation}
                onChange={(e) => setFarmLocation(e.target.value)}
                placeholder="e.g. Limuru, Kiambu"
                className="h-12 rounded-xl border border-white/18 bg-white/85 px-4 text-[#111111]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-white/90">Ownership type</Label>
              <div className="flex items-center gap-4 text-sm text-white">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={ownershipType === 'owned'}
                    onChange={() => setOwnershipType('owned')}
                  />
                  Owned
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={ownershipType === 'leased'}
                    onChange={() => setOwnershipType('leased')}
                  />
                  Leased
                </label>
              </div>
            </div>
            {ownershipType === 'leased' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  type="number"
                  min={0}
                  value={leaseCost}
                  onChange={(e) => setLeaseCost(e.target.value)}
                  placeholder="Lease cost"
                  className="h-12 rounded-xl border border-white/18 bg-white/85 px-4 text-[#111111]"
                />
                <Input
                  type="number"
                  min={1}
                  value={leaseDuration}
                  onChange={(e) => setLeaseDuration(e.target.value)}
                  placeholder="Duration"
                  className="h-12 rounded-xl border border-white/18 bg-white/85 px-4 text-[#111111]"
                />
                <select
                  className="h-12 rounded-xl border border-white/18 bg-white/85 px-4 text-[#111111]"
                  value={leaseDurationType}
                  onChange={(e) => setLeaseDurationType(e.target.value as 'months' | 'years')}
                >
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            )}
          </div>
          <Button
            className="mt-6 h-12 w-full rounded-full bg-[#1F3D2B] text-white"
            onClick={() => void handleStep3CreateFarm()}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Save & Continue'}
          </Button>
        </div>
      )}

      {step === 4 && (
        <div className="animate-in fade-in-0 duration-300">
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white/95">Create your first project</h3>
                <p className="mt-1 text-xs text-white/65">Use the form below, or skip to the final step.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/55 shadow-none transition-all hover:bg-white/12 sm:border-white/14 sm:bg-white/16 sm:px-3 sm:py-1.5 sm:text-[11px] sm:text-white/75 sm:shadow-none sm:hover:bg-white/20"
                onClick={() => setSkipConfirmOpen(true)}
              >
                Skip to finish
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="animate-in fade-in-0 duration-300">
          <div className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/10 px-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white shadow-sm">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/95">Setup complete</p>
              <p className="text-xs leading-relaxed text-white/70">
                <strong className="font-semibold text-white/95">{companyName}</strong> is on Pro trial. Open your
                dashboard to start managing your farm.
              </p>
            </div>
          </div>

          <Button
            className="mt-6 h-12 w-full rounded-full bg-[#1F3D2B] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#1B3526] active:translate-y-0"
            onClick={() => void handleStep4Finish()}
            disabled={loading}
          >
            {loading ? 'Finishing…' : 'Go to dashboard'}
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </PremiumOnboardingShell>
  );
}
