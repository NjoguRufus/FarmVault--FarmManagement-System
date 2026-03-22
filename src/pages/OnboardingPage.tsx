/**
 * Onboarding wizard: Step 1 create company + membership + profile, Step 2 trial, Step 3 optional project.
 * Guard: redirect to /dashboard if user has active_company_id and membership; else show onboarding.
 */
import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, FolderPlus } from 'lucide-react';
import { useUser, useAuth as useClerkAuth } from '@clerk/react';
import { supabase, getSupabaseAccessToken } from '@/lib/supabase';
import { invokeNotifyCompanySubmissionReceived } from '@/lib/email';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { writePendingApprovalSession, type PendingApprovalSessionPayload } from '@/lib/pendingApprovalSession';

type EmailValidationResult = { ok: boolean; message?: string | null };

export default function OnboardingPage() {
  const { resetRequired, refreshAuthState, syncTenantCompanyFromServer } = useAuth();
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

  const [projectName, setProjectName] = useState('');
  const [createProject, setCreateProject] = useState(false);
  const [projectCreated, setProjectCreated] = useState(false);

  const clerkId = clerkUser?.id ?? null;
  const accountEmail = clerkUser?.primaryEmailAddress?.emailAddress?.trim() ?? '';
  const companyEmailTrim = companyEmail.trim();
  const companyEmailFormatOk =
    companyEmailTrim === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmailTrim);
  const step1Valid = companyName.trim().length >= 2 && companyEmailFormatOk;

  // Pre-fill from Clerk once; do not overwrite if the user cleared optional fields in-session.
  useEffect(() => {
    if (!clerkUser) return;
    setCompanyEmail((prev) => (prev.trim() !== '' ? prev : accountEmail));
    setCompanyName((prev) => (prev.trim() !== '' ? prev : clerkUser.fullName ?? ''));
  }, [clerkUser, accountEmail]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      navigate('/sign-in', { replace: true });
      return;
    }
  }, [isLoaded, isSignedIn, navigate]);

  // AuthContext/RequireOnboarding already guard access; we don't need an extra membership check here.

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
    setLoading(true);
    setError(null);
    try {
      const normalizedCompanyEmail = companyEmail.trim().toLowerCase();
      if (normalizedCompanyEmail) {
        const { data: companyCheck } = await supabase.rpc('validate_email_uniqueness', {
          _email: normalizedCompanyEmail,
          _company_id: null,
          // Reusing your sign-in email for "company email" must not count as "another user".
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

      // Single RPC: creates core.companies, core.company_members (role=company_admin), core.profiles with active_company_id
      const { data: cid, error: rpcErr } = await supabase.rpc('create_company_with_admin', {
        _name: companyName.trim(),
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

  const navigateToPendingApproval = async () => {
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
    const dashboardUrl = `${base}/pending-approval`;

    void (async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return;
      const token = await getSupabaseAccessToken();
      if (!token) return;
      const result = await invokeNotifyCompanySubmissionReceived({
        to: recipient,
        companyName: companyName.trim(),
        dashboardUrl,
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
      console.log('[Onboarding] pending_approval_navigation', payload);
    }
    try {
      await syncTenantCompanyFromServer();
      await refreshAuthState();
    } catch {
      /* non-fatal: session will catch up on next load */
    }
    navigate('/pending-approval', { state: payload, replace: true });
  };

  const handleStep2SubmitForApproval = async () => {
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
        console.log('[Onboarding] subscription_saved_pending_approval', { companyId });
      }

      if (createProject && projectName.trim()) {
        setStep(3);
      } else {
        await navigateToPendingApproval();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit for approval');
    } finally {
      setLoading(false);
    }
  };

  const handleStep3CreateProject = async () => {
    if (!companyId || !projectName.trim()) {
      await navigateToPendingApproval();
      return;
    }
    if (!clerkUser?.id) {
      setError('User not loaded');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: insertError } = await db
        .projects()
        .from('projects')
        .insert({
          company_id: companyId,
          created_by: clerkUser.id,
          name: projectName.trim(),
          crop_type: 'Other',
          environment: 'open_field',
          status: 'active',
          planting_date: new Date().toISOString().slice(0, 10),
        });
      if (insertError) throw insertError;
      setProjectCreated(true);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[Onboarding] first_project_created', { companyId, projectName: projectName.trim() });
      }
      setTimeout(() => {
        void navigateToPendingApproval();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <Card className="w-full max-w-lg rounded-2xl shadow-xl border-primary/10 overflow-hidden">
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
              <p className="text-sm text-muted-foreground mb-6">You’ll get a 7-day Pro trial in the next step.</p>
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
                  <Label htmlFor="companyName">Company name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Green Valley Farm"
                    className="mt-1"
                  />
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
              <h2 className="text-xl font-semibold text-foreground mb-2">Almost there</h2>
              <p className="text-sm text-muted-foreground mb-6">
                <strong>{companyName}</strong> is set to <strong>Pro</strong> with a <strong>7-day trial</strong> after our team
                approves your workspace. No plan pick is needed here.
              </p>
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="createProject"
                  checked={createProject}
                  onChange={(e) => setCreateProject(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="createProject">Create first project</Label>
              </div>
              {createProject && (
                <div className="mb-6">
                  <Label htmlFor="projectName">Project name</Label>
                  <Input
                    id="projectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Tomato Season 2025"
                    className="mt-1"
                  />
                </div>
              )}
              <Button className="w-full" onClick={() => void handleStep2SubmitForApproval()} disabled={loading}>
                {loading ? 'Submitting…' : 'Submit for Approval'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
                <FolderPlus className="h-5 w-5" />
                First project
              </h2>
              <p className="text-sm text-muted-foreground mb-6">Create a project to start tracking stages and expenses.</p>
              <div className="mb-6">
                <Label htmlFor="projectName2">Project name</Label>
                <Input
                  id="projectName2"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Tomato Season 2025"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => void navigateToPendingApproval()} disabled={loading}>
                  Skip
                </Button>
                <Button className="flex-1" onClick={handleStep3CreateProject} disabled={!projectName.trim() || loading}>
                  {loading ? 'Creating…' : 'Create project'}
                </Button>
              </div>
              {projectCreated && (
                <p className="mt-4 text-sm text-green-600 text-center">Project created. Continuing to approval…</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
