/**
 * Emergency Access: local session when Clerk is unavailable.
 * Only works when VITE_EMERGENCY_ACCESS=true and email matches VITE_EMERGENCY_EMAIL.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEmergencySession } from '@/contexts/AuthContext';
import { isEmergencyAccessEnabled } from '@/config/emergencyAccess';

export default function EmergencyAccessPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isEmergencyAccessEnabled()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground mb-2">Emergency access is disabled</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This feature is not enabled. Use the normal sign-in page.
          </p>
          <a href="/sign-in" className="fv-btn fv-btn--primary">Go to sign-in</a>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter your email address.');
      setLoading(false);
      return;
    }
    const ok = createEmergencySession(trimmed);
    setLoading(false);
    if (ok) {
      navigate('/auth/callback', { replace: true });
    } else {
      setError('Access not allowed for this email. Use the approved emergency account.');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0">
        <div
          className="md:hidden absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-backgroundmobile.jpg')",
          }}
        />
        <div
          className="hidden md:block absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.25)), url('/farm-background-desktop.jpg')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10" />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="text-center space-y-3 mb-8">
            <div className="flex justify-center">
              <img
                src="/Logo/FarmVault_Logo dark mode.png"
                alt="FarmVault logo"
                className="h-32 w-auto md:h-40 object-contain drop-shadow-lg"
              />
            </div>
            <p className="text-sm md:text-base text-white/90 mt-1 drop-shadow-md">
              Emergency access — continue to your farm workspace
            </p>
          </div>

          <div className="bg-[#F5F1EB] rounded-3xl shadow-2xl p-4 md:p-6 border border-white/20">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="emergency-email" className="block text-sm font-medium text-foreground mb-1">
                  Email
                </label>
                <input
                  id="emergency-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="emergency-secret" className="block text-sm font-medium text-foreground mb-1">
                  Secret code <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  id="emergency-secret"
                  type="password"
                  autoComplete="off"
                  value={secretCode}
                  onChange={(e) => setSecretCode(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={loading}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full fv-btn fv-btn--primary py-2"
              >
                {loading ? 'Continuing…' : 'Continue'}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Only the approved emergency email can use this. Normal sign-in uses the main page.
            </p>
          </div>

          <p className="mt-4 text-center">
            <a href="/sign-in" className="text-sm text-white/80 hover:text-white underline">
              Back to sign-in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
