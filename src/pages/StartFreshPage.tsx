import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export default function StartFreshPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartFresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('consume_reset_user_for_signup');
      if (rpcError) {
        throw new Error(rpcError.message ?? 'Failed to start fresh');
      }
      const payload = (data ?? {}) as { found?: boolean; consumed?: boolean; allowed?: boolean };
      if (payload.found && payload.allowed === false) {
        setError('Your account is currently blocked from re-signup. Please contact support.');
        setLoading(false);
        return;
      }
      // eslint-disable-next-line no-console
      console.log('[AuthReset] User intentionally started fresh');
      navigate('/onboarding', { replace: true, state: { fromStartFresh: true } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start fresh');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-12">
      <Card className="w-full max-w-lg rounded-2xl shadow-xl border-primary/10 overflow-hidden">
        <CardContent className="p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <img
              src="/Logo/FarmVault_Logo dark mode.png"
              alt="FarmVault"
              className="h-10 w-auto rounded-lg object-contain bg-sidebar-primary/10 p-1"
            />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">Your previous workspace was removed.</h1>
          <p className="text-sm text-muted-foreground mb-8">
            You can start again with a new company setup.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1 gap-2" onClick={handleStartFresh} disabled={loading}>
              <RotateCcw className="h-4 w-4" />
              {loading ? 'Starting…' : 'Start Fresh'}
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                logout();
                navigate('/sign-in', { replace: true });
              }}
              disabled={loading}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

