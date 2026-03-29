/**
 * Onboarding: create company + membership + profile, start trial, then optional project (same NewProjectForm as Projects).
 */
import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useUser, useAuth as useClerkAuth } from '@clerk/react';
import { supabase, getSupabaseAccessToken } from '@/lib/supabase';
import { invokeNotifyCompanySubmissionReceived } from '@/lib/email';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <Card
        className={`w-full rounded-2xl shadow-xl border-primary/10 overflow-hidden ${
          step === 3 ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-8">
            <img src="/Logo/FarmVault_Logo dark mode.png" alt="FarmVault" className="h-10 w-auto rounded-lg object-contain bg-sidebar-primary/10 p-1" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Onboarding</span>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold text-foreground mb-2">Create your company</h2>
              <p className="text-sm text-muted-foreground mb-6">You’ll get a 7-day Pro trial once you continue. You can open your dashboard right away.</p>
              {orgLogoUrl && (
                <div className="flex justify-center mb-4">
                  <img
                    src={orgLogoUrl}
                    alt="Organization logo"
                    className="h-16 w-16 rounded-xl object-cover border border-border"
                  />
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="companyName">Farm / Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Green Valley Farm Ltd"
                    className="mt-1"
                    autoComplete="organization"
                    required
                    minLength={2}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Enter the name of your farm, business, or company as you want it to appear in FarmVault. This is separate
                    from your own name (your profile).
                  </p>
                </div>
                <div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <Label htmlFor="companyEmail" className="mb-0">
                      Company email <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 text-xs w-full sm:w-auto"
                      onClick={fillCompanyEmailFromAccount}
                      disabled={!accountEmail}
                    >
                      Use my account email
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 mb-1.5">
                    Optional. You can use your own email if your farm does not have a separate company email.
                  </p>
                  <Input
                    id="companyEmail"
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder={accountEmail || 'you@example.com'}
                    className="mt-0"
                    autoComplete="email"
                  />
                </div>
              </div>
              <Button className="w-full mt-6" onClick={handleStep1CreateCompany} disabled={!step1Valid || loading}>
                {loading ? 'Creating…' : 'Create company'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex justify-center mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">You’re in</h2>
              <p className="text-sm text-muted-foreground mb-6">
                <strong>{companyName}</strong> is set to <strong>Pro</strong> with a <strong>7-day trial</strong> after our team
                approves your workspace. Next, you can create your first project here, or skip and do it from the dashboard.
              </p>
              <Button className="w-full" onClick={() => void handleStep2Continue()} disabled={loading}>
                {loading ? 'Preparing…' : 'Continue'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Create New or Existing Project</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Same steps you will use from the Projects page — crop, blocks or planting date, then details.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={goDashboard}>
                  Skip for now
                </Button>
              </div>
              <NewProjectForm onCancel={goDashboard} onSuccess={handleOnboardingProjectSuccess} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
