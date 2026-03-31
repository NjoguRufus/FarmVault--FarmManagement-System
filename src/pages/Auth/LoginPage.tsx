/**
 * Clerk-based sign-in. Renders form immediately; uses useAuth (Clerk) to redirect when already signed in.
 */
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth as useClerkAuth } from '@clerk/react';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { PremiumAuthShell } from '@/components/auth/PremiumAuthShell';

export default function LoginPage() {
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useClerkAuth();
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    setLoading(false);
    navigate('/auth/continue', { replace: true, state: location.state });
  }, [isAuthenticated, user, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Navigation will happen via useEffect when isAuthenticated becomes true
    } catch (err: unknown) {
      const e = err as { code?: string; errors?: Array<{ message?: string; code?: string }> };
      const clerkMsg = e?.errors?.[0]?.message;
      const code = e?.code ?? e?.errors?.[0]?.code;
      if (clerkMsg) {
        setError(clerkMsg);
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'form_identifier_exists' || code === 'form_password_pwned') {
        setError('Incorrect email or password. Try again.');
      } else if (code === 'auth/user-not-found' || code === 'form_identifier_not_found') {
        setError('No account found with this email. Create an account or try again.');
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email address. Please check and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
      }
      setLoading(false);
    }
  };


  if (clerkLoaded && clerkSignedIn) {
    return <Navigate to="/auth/continue" replace state={location.state} />;
  }

  return (
    <PremiumAuthShell
      title="Welcome back"
      subtitle="Sign in to continue managing your farm with clarity."
      footer={<p className="text-xs text-white/60">Track crops, workers, harvest and profit in one place.</p>}
    >
      <div className="w-full min-w-0 max-w-full box-border flex flex-col gap-4">
        {/* Brand block inside the panel */}
        <div className="w-full min-w-0 max-w-full box-border flex items-center gap-4">
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault logo"
            className="h-12 w-auto object-contain drop-shadow-[0_14px_40px_rgba(0,0,0,0.35)]"
          />
          <div className="w-full min-w-0 max-w-full break-words">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/65">FARMVAULT</p>
            <p className="mt-1 text-sm text-white/80">Welcome back to FarmVault</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full min-w-0 max-w-full box-border flex flex-col gap-4">
          {/* Email Field */}
          <div className="w-full min-w-0 max-w-full box-border flex flex-col gap-2">
            <div className="w-full min-w-0 max-w-full flex items-center gap-2">
              <Mail className="h-4 w-4 text-white/80" />
              <label className="text-sm font-medium text-white/90">Email</label>
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full max-w-full min-w-0 box-border rounded-xl border border-white/20 bg-white/90 px-4 py-3.5 text-sm text-[#0B0F0D] placeholder:text-black/45 shadow-[0_10px_30px_rgba(0,0,0,0.18)] focus:outline-none focus:ring-2 focus:ring-[#1F3B2E]/35 focus:border-[#1F3B2E]/40"
              placeholder="Email"
              autoComplete="email"
            />
          </div>

          {/* Password Field */}
          <div className="w-full min-w-0 max-w-full box-border flex flex-col gap-2">
            <div className="w-full min-w-0 max-w-full flex items-center gap-2">
              <Lock className="h-4 w-4 text-white/80" />
              <label className="text-sm font-medium text-white/90">Password</label>
            </div>
            <div className="relative w-full max-w-full min-w-0 box-border">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full max-w-full min-w-0 box-border rounded-xl border border-white/20 bg-white/90 px-4 py-3.5 pr-10 text-sm text-[#0B0F0D] placeholder:text-black/45 shadow-[0_10px_30px_rgba(0,0,0,0.18)] focus:outline-none focus:ring-2 focus:ring-[#1F3B2E]/35 focus:border-[#1F3B2E]/40"
                placeholder="Password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-black/55 hover:text-black/75 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="w-full max-w-full min-w-0 box-border rounded-xl border border-red-200/70 bg-white/85 px-4 py-3 text-sm text-red-700 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
              {error}
            </div>
          )}

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full max-w-full min-w-0 box-border rounded-xl bg-[#1F3B2E] px-4 py-3.5 text-base font-medium text-white shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-all hover:-translate-y-[1px] hover:bg-[#193226] hover:shadow-[0_24px_60px_rgba(0,0,0,0.32)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="w-full min-w-0 max-w-full box-border pt-1 text-center text-sm text-white/80 break-words">
          <span>Don&apos;t have an account? </span>
          <Link to="/sign-up" className="font-semibold text-white/90 underline underline-offset-4 hover:text-white">
            Create account
          </Link>
        </div>
      </div>
    </PremiumAuthShell>
  );
}

