import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, ShieldCheck, CheckCircle2, ChevronRight } from 'lucide-react';
import { registerCompanyAdmin } from '@/services/authService';
import { createCompany, createCompanyUserProfile } from '@/services/companyService';
import { SUBSCRIPTION_PLANS } from '@/config/plans';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { OnboardingNavButtons } from '@/components/onboarding/OnboardingNavButtons';
import { Card, CardContent } from '@/components/ui/card';

const STEPS = 3;

export default function SetupCompany() {
  const navigate = useNavigate();
  const location = useLocation();
  const statePlan = (location.state as { plan?: string })?.plan;
  const selectedPlan =
    statePlan && ['starter', 'professional', 'enterprise'].includes(statePlan)
      ? statePlan
      : null;

  useEffect(() => {
    if (!selectedPlan) {
      navigate('/choose-plan', { replace: true });
    }
  }, [selectedPlan, navigate]);

  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const planLabel =
    SUBSCRIPTION_PLANS.find((p) => p.value === selectedPlan)?.name ?? selectedPlan;

  // Step 1 validation
  const step1Valid =
    companyName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail.trim());

  // Step 2 validation
  const passwordsMatch = password === confirmPassword;
  const passwordValid = password.length >= 6;
  const step2Valid =
    adminName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()) &&
    passwordValid &&
    passwordsMatch;

  const handleContinue = async () => {
    setError(null);

    if (step === 1 && step1Valid) {
      setStep(2);
      return;
    }
    if (step === 2 && step2Valid) {
      setStep(3);
      return;
    }
    if (step === 3) {
      await handleCreateAccount();
    }
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = await registerCompanyAdmin(adminEmail, password);
      const companyId = await createCompany(
        companyName.trim(),
        companyEmail.trim(),
        selectedPlan!
      );
      await createCompanyUserProfile({
        uid: user.uid,
        companyId,
        name: adminName.trim(),
        email: adminEmail.trim(),
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create company account';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard', { replace: true });
  };

  if (!selectedPlan) return null;

  // Success state screen
  if (success) {
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
            <p className="text-muted-foreground text-sm mb-8">
              Your company account is ready. Start managing your farm operations today.
            </p>
            <button
              type="button"
              onClick={handleGoToDashboard}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_4px_24px_-4px_rgba(45,74,62,0.25)] hover:bg-primary/90 transition-all"
            >
              Go to Dashboard
              <ChevronRight className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canContinue =
    (step === 1 && step1Valid) ||
    (step === 2 && step2Valid) ||
    (step === 3 && !loading);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-8 sm:py-12">
      <div className="w-full max-w-lg">
        <Card className="rounded-2xl shadow-xl border-primary/10 overflow-hidden bg-card/95 backdrop-blur-sm">
          <CardContent className="p-6 sm:p-8">
            {/* Logo row */}
            <div className="flex items-center gap-3 mb-8">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault"
                className="h-10 w-auto rounded-lg object-contain bg-sidebar-primary/10 p-1"
              />
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Plan: {planLabel}
              </span>
            </div>

            {/* Step Header */}
            <OnboardingHeader
              title={
                step === 1
                  ? 'Company Details'
                  : step === 2
                    ? 'Admin Account'
                    : 'Review & Create'
              }
              subtitle={
                step === 1
                  ? 'Tell us about your farm business'
                  : step === 2
                    ? 'Create your admin login credentials'
                    : 'Review your details before creating your account'
              }
              step={step}
              totalSteps={STEPS}
            />

            {/* Step Content */}
            <div className="mt-8 space-y-6">
              {step === 1 && (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <Building2 className="h-4 w-4" />
                      Company details
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Company Name
                        </label>
                        <input
                          type="text"
                          className="fv-input rounded-xl"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="GreenField Farms Ltd"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Company Email
                        </label>
                        <input
                          type="email"
                          className="fv-input rounded-xl"
                          value={companyEmail}
                          onChange={(e) => setCompanyEmail(e.target.value)}
                          placeholder="info@greenfieldfarms.com"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <ShieldCheck className="h-4 w-4" />
                      Admin account
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Admin Full Name
                        </label>
                        <input
                          type="text"
                          className="fv-input rounded-xl"
                          value={adminName}
                          onChange={(e) => setAdminName(e.target.value)}
                          placeholder="James Mwangi"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Admin Email
                        </label>
                        <input
                          type="email"
                          className="fv-input rounded-xl"
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          placeholder="admin@greenfieldfarms.com"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">
                            Password
                          </label>
                          <input
                            type="password"
                            className="fv-input rounded-xl"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 6 characters"
                            minLength={6}
                            required
                          />
                          {password.length > 0 && password.length < 6 && (
                            <p className="text-xs text-destructive">
                              At least 6 characters
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">
                            Confirm Password
                          </label>
                          <input
                            type="password"
                            className="fv-input rounded-xl"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat password"
                            required
                          />
                          {confirmPassword.length > 0 && !passwordsMatch && (
                            <p className="text-xs text-destructive">
                              Passwords do not match
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/30 p-6">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
                    Summary
                  </p>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Company</span>
                      <span className="font-medium">{companyName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Company Email</span>
                      <span className="font-medium">{companyEmail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Admin Name</span>
                      <span className="font-medium">{adminName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Admin Email</span>
                      <span className="font-medium">{adminEmail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-medium">{planLabel}</span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <OnboardingNavButtons
                onBack={step > 1 ? handleBack : undefined}
                onContinue={handleContinue}
                continueLabel={step === 3 ? 'Create Company Account' : 'Continue'}
                canContinue={canContinue}
                isLoading={loading}
                showBack={step > 1}
              />
            </div>

            <p className="text-[11px] text-muted-foreground text-center mt-6">
              By continuing you create a new FarmVault tenant. You can invite
              additional users later from the admin settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
