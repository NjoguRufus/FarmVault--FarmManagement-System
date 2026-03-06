import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Legacy developer bootstrap page.
 * 
 * Clerk Organizations are disabled; developers are routed directly via AuthContext +
 * RequireDeveloper. This page now simply confirms developer setup and redirects to
 * the main developer dashboard.
 */
export default function DevBootstrapPage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate('/dev/sign-in', { replace: true });
      return;
    }
    navigate('/dev/dashboard', { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-xl border-primary/10 overflow-hidden">
        <CardContent className="p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-3">
            <img
              src="/Logo/FarmVault_Logo dark mode.png"
              alt="FarmVault"
              className="h-10 w-auto rounded-lg object-contain bg-sidebar-primary/10 p-1"
            />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Developer setup
              </p>
              <h1 className="text-xl font-semibold text-foreground">Redirecting to Dev Dashboard…</h1>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Your developer access is managed entirely via Clerk + Supabase now. You will be redirected to the
            FarmVault developer dashboard automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

