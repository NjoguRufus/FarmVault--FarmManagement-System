import React, { useEffect, useMemo, useState } from 'react';
import { SignUp } from '@clerk/react';
import { PremiumAuthShell } from '@/components/auth/PremiumAuthShell';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  AMBASSADOR_POST_AUTH_PATH,
  getAmbassadorSignInPath,
  isAmbassadorClerkFlow,
} from '@/lib/ambassador/clerkAuth';
import { readAmbassadorAccessIntent, setAmbassadorAccessIntent } from '@/lib/ambassador/accessIntent';
import { setSignupType } from '@/lib/ambassador/signupType';

export default function SignUpPage() {
  const location = useLocation();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const afterAmbassadorAuthUrl = AMBASSADOR_POST_AUTH_PATH;

  // Freeze on first render so Clerk's internal URL navigation (OAuth callbacks,
  // multi-step form pages like /sign-up/verify-email-address) cannot flip
  // ambassadorFlow to false mid-flow and change afterSignUpUrl to /auth/continue.
  // Also accept a pre-set localStorage intent from AmbassadorSignupPage.
  const [ambassadorFlow] = useState(
    () => isAmbassadorClerkFlow(location.search) || readAmbassadorAccessIntent()
  );

  useEffect(() => {
    if (ambassadorFlow) {
      setAmbassadorAccessIntent(true);
      setSignupType('ambassador');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showAccessRevoked = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const byQuery = params.get('reason') === 'access-revoked';
    let byStorage = false;
    try {
      byStorage = window.sessionStorage.getItem('farmvault:access-revoked:v1') === '1';
    } catch {
      byStorage = false;
    }
    return byQuery || byStorage;
  }, [location.search]);

  useEffect(() => {
    if (!showAccessRevoked) return;
    try {
      window.sessionStorage.removeItem('farmvault:access-revoked:v1');
    } catch {
      // ignore
    }
  }, [showAccessRevoked]);

  return (
    <PremiumAuthShell
      title="Create your FarmVault account"
      subtitle="Start your journey toward organized, modern farm management."
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
            <p className="mt-1 text-sm text-white/80">Create your FarmVault account to get started</p>
          </div>
        </div>

        {showAccessRevoked && (
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/90 backdrop-blur">
            <p className="font-medium">Your previous access is no longer available.</p>
            <p className="mt-1 text-white/75">
              Please sign up again to create a fresh FarmVault account.
            </p>
          </div>
        )}

        {/* Terms acceptance */}
        <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur flex items-start gap-3">
          <input
            type="checkbox"
            id="signup-terms"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
          />
          <label htmlFor="signup-terms" className="text-sm text-white/85 cursor-pointer leading-relaxed">
            I agree to FarmVault's{" "}
            <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-white underline-offset-2 hover:underline font-medium">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-white underline-offset-2 hover:underline font-medium">
              Privacy Policy
            </Link>
          </label>
        </div>

        {!agreedToTerms && (
          <p className="text-center text-xs text-white/50">
            Please accept the Terms &amp; Conditions to create your account.
          </p>
        )}

        {agreedToTerms && (
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl={ambassadorFlow ? getAmbassadorSignInPath() : '/sign-in'}
          afterSignUpUrl={ambassadorFlow ? afterAmbassadorAuthUrl : '/auth/continue'}
          afterSignInUrl={ambassadorFlow ? afterAmbassadorAuthUrl : '/auth/continue'}
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
        )}
      </div>
    </PremiumAuthShell>
  );
}
