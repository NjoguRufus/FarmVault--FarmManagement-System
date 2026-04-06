import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock3, Ban, AlertTriangle, LogOut, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionGateState } from '@/services/subscriptionService';
import { Button } from '@/components/ui/button';
import { clearPendingApprovalSession } from '@/lib/pendingApprovalSession';

export function SubscriptionAccessGate({ children }: { children: React.ReactElement }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDeveloper = user?.role === 'developer';

  const { data, isLoading } = useQuery({
    queryKey: ['subscription-gate', user?.companyId],
    queryFn: () => getSubscriptionGateState(),
    enabled: !!user?.companyId && !isDeveloper,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  if (isDeveloper || !user?.companyId) return children;
  if (isLoading || !data) return children;

  if (data.developer_override_active === true) return children;

  const status = (data.status || 'pending_approval').toLowerCase();
  // Include `trial`: approved Pro trial (running or ended — post-trial plan modal handles expiry).
  // Hybrid approval: pending_approval still enters the app (banner + limited UX); no redirect to holding page.
  const fullAccess =
    status === 'trialing' ||
    status === 'trial' ||
    status === 'active' ||
    status === 'pending_payment' ||
    status === 'pending_approval';
  if (fullAccess) {
    clearPendingApprovalSession();
    return children;
  }

  const titleByStatus: Record<string, string> = {
    rejected: 'Subscription request rejected',
    suspended: 'Access suspended',
    expired: 'Subscription expired',
  };
  const descriptionByStatus: Record<string, string> = {
    rejected: data.rejection_reason || 'Your request was rejected. Contact support for details.',
    suspended: 'Your company access is temporarily suspended. Contact FarmVault support.',
    expired: 'Your company access has expired. Contact support to renew or extend access.',
  };
  const Icon =
    status === 'rejected' ? Ban : status === 'suspended' ? AlertTriangle : status === 'expired' ? AlertTriangle : Clock3;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-6">
      <div className="w-full max-w-2xl rounded-2xl border bg-card shadow-xl p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <Icon className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{titleByStatus[status] ?? 'Access restricted'}</h1>
            <p className="text-muted-foreground">{descriptionByStatus[status] ?? 'Your subscription is not active yet.'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Selected plan</p>
            <p className="font-medium uppercase">{data.selected_plan}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Billing mode</p>
            <p className="font-medium uppercase">{data.billing_mode}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">Current status</p>
            <p className="font-medium uppercase">{status}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate('/features')}>
            Preview FarmVault
          </Button>
          <Button variant="outline" onClick={() => navigate('/about')}>
            Take a Quick Tour
          </Button>
          <Button variant="outline" onClick={() => window.location.assign('mailto:support@farmvault.co.ke')}>
            <Mail className="h-4 w-4 mr-2" />
            Contact Support
          </Button>
          <Button variant="destructive" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
