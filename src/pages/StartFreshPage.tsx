import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Legacy route after developer-side deletes used to require an extra click here.
 * Auth now auto-clears reset tombstones on sign-in; this page immediately consumes any
 * remaining row and sends the user to onboarding (or shows an error if re-signup is blocked).
 */
export default function StartFreshPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('consume_reset_user_for_signup');
        if (cancelled) return;
        if (rpcError) {
          throw new Error(rpcError.message ?? 'Failed to continue');
        }
        const payload = (data ?? {}) as { found?: boolean; consumed?: boolean; allowed?: boolean };
        if (payload.found && payload.allowed === false) {
          setError('Your account is currently blocked from re-signup. Please contact support.');
          return;
        }
        navigate('/onboarding/company', { replace: true, state: { fromStartFresh: true } });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Something went wrong');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
        <Card className="w-full max-w-lg rounded-2xl shadow-xl border-primary/10 overflow-hidden">
          <CardContent className="p-8 sm:p-10 space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                logout();
                navigate('/sign-in', { replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Preparing your workspace…</p>
    </div>
  );
}
