/**
 * Post-Clerk redirect: ensure profile exists and redirect to dashboard or onboarding.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth as useClerkAuth, useUser } from '@clerk/react';
import { supabase } from '@/lib/supabase';
import { isDevEmail } from '@/lib/devAccess';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkUser?.id) return;

    let cancelled = false;

    async function checkProfile() {
      if (cancelled) return;

      // Developers should never go through the normal onboarding wizard.
      const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
      if (isDevEmail(email)) {
        navigate('/dev/dashboard', { replace: true });
        return;
      }

      // For normal users, defer company resolution to AuthContext + RequireOnboarding.
      navigate('/dashboard', { replace: true });
    }

    void checkProfile();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, clerkUser?.id, navigate]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground mb-2">Sign-in issue</h1>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <a href="/login" className="fv-btn fv-btn--primary">Go to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
