import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SignIn } from '@clerk/react';
import { ClerkLoadErrorBoundary } from '@/components/auth/ClerkLoadErrorBoundary';
import { isEmergencyAccessEnabled } from '@/config/emergencyAccess';
import { PremiumAuthShell } from '@/components/auth/PremiumAuthShell';
import { getAmbassadorSignUpPath, isAmbassadorClerkFlow } from '@/lib/ambassador/clerkAuth';

/**
 * Sign-in UI depends only on Clerk. No AuthContext or employee/company lookup runs here;
 * data fetching runs only after a Clerk user exists (in AuthContext).
 */
export default function SignInPage() {
  const location = useLocation();
  const ambassadorFlow = isAmbassadorClerkFlow(location.search);
  const afterAmbassadorAuthUrl = '/ambassador/onboarding';

  return (
    <PremiumAuthShell
      title="Welcome back"
      subtitle="Sign in to continue managing your farm with clarity."
      footer={<p className="text-xs text-white/60">Track crops, workers, harvest and profit in one place.</p>}
    >
      <div className="w-full min-w-0 max-w-full box-border flex flex-col gap-4">
        <div className="w-full min-w-0 max-w-full box-border flex items-center gap-4">
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault logo"
            className="h-12 w-auto object-contain drop-shadow-[0_14px_40px_rgba(0,0,0,0.35)]"
          />
          <div className="w-full min-w-0 max-w-full break-words">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/65">FARMVAULT</p>
            <p className="mt-1 text-sm text-white/80">Sign in to continue to your farm workspace</p>
          </div>
        </div>

        <ClerkLoadErrorBoundary>
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl={ambassadorFlow ? getAmbassadorSignUpPath() : '/sign-up'}
            afterSignInUrl={ambassadorFlow ? afterAmbassadorAuthUrl : '/auth/continue'}
            afterSignUpUrl={ambassadorFlow ? afterAmbassadorAuthUrl : '/auth/continue'}
            appearance={{
              variables: {
                colorPrimary: '#1F3B2E',
                colorText: '#0B0F0D',
                colorBackground: 'transparent',
                borderRadius: '12px',
              },
              elements: {
                card: 'bg-transparent shadow-none border-0 p-0',
                rootBox: 'w-full min-w-0',
                main: 'w-full min-w-0',
                form: 'w-full min-w-0',
                formField: 'w-full min-w-0',
                header: 'hidden',
                footer: 'hidden',
                socialButtons: 'w-full max-w-full min-w-0',
                socialButtonsBlock: 'w-full max-w-full min-w-0',
                socialButtonsBlockButton:
                  'w-full max-w-full min-w-0 box-border bg-white/90 border border-white/20 justify-center shadow-[0_12px_34px_rgba(0,0,0,0.16)] hover:shadow-[0_18px_48px_rgba(0,0,0,0.20)] transition-all hover:-translate-y-[1px] rounded-lg',
                socialButtonsBlockButtonText: 'text-[#0B0F0D] font-medium',
                dividerRow: 'w-full max-w-full min-w-0 box-border flex items-center gap-3',
                dividerLine: 'flex-1 min-w-0 bg-white/25',
                dividerText: 'text-white/65',
                formFieldLabel: 'text-white/90',
                formFieldInput:
                  'w-full max-w-full min-w-0 box-border bg-white/90 border border-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.18)] focus:ring-2 focus:ring-[#1F3B2E]/35 focus:border-[#1F3B2E]/40 rounded-lg text-[#0B0F0D] placeholder:text-black/45',
                formButtonPrimary:
                  'w-full max-w-full min-w-0 box-border bg-[#1F3B2E] hover:bg-[#193226] shadow-[0_18px_40px_rgba(0,0,0,0.28)] hover:shadow-[0_24px_60px_rgba(0,0,0,0.32)] transition-all hover:-translate-y-[1px] rounded-lg',
                formButtonPrimaryText: 'font-medium',
                formFieldAction: 'text-white/80 hover:text-white',
                identityPreviewText: 'text-white/80',
                identityPreviewEditButton: 'text-white/80 hover:text-white',
                alertText: 'text-red-700',
                alert: 'bg-white/85 border border-red-200/70 rounded-lg',
              },
            }}
          />
        </ClerkLoadErrorBoundary>

        {isEmergencyAccessEnabled() && (
          <p className="text-center">
            <Link to="/emergency-access" className="text-sm text-white/75 hover:text-white underline underline-offset-4">
              Sign-in not loading? Use emergency access
            </Link>
          </p>
        )}
      </div>
    </PremiumAuthShell>
  );
}

