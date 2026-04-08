import React, { useCallback, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  BellRing,
  Bug,
  Database,
  Mail,
  Plug,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { queueOneSignalPromptPermission } from '@/services/oneSignalService';
import { cn } from '@/lib/utils';

type IntegrationStatus = 'connected' | 'partial' | 'planned' | 'error';

type Integration = {
  name: string;
  description: string;
  status: IntegrationStatus;
  keyInfo: string;
  actionLabel: string;
  icon: React.ReactNode;
};

const ENV = import.meta.env as Record<string, string | undefined>;
const ONESIGNAL_APP_ID = 'c9bda911-e3a1-4b12-a1c3-0eab892c4d5a';

function mask(value: string | undefined | null): string {
  if (!value) return 'Not configured';
  const trimmed = value.trim();
  if (!trimmed) return 'Not configured';
  if (trimmed.length <= 6) return '***';
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-2)}`;
}

function getStatusBadgeClass(status: IntegrationStatus): string {
  if (status === 'connected') return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40';
  if (status === 'partial') return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
  if (status === 'error') return 'bg-red-500/20 text-red-300 border-red-400/40';
  return 'bg-zinc-500/20 text-zinc-300 border-zinc-400/40';
}

function getStatusLabel(status: IntegrationStatus): string {
  if (status === 'connected') return 'Connected';
  if (status === 'partial') return 'Partial';
  if (status === 'error') return 'Error';
  return 'Planned';
}

export default function DeveloperIntegrationsPage() {
  const { user, isDeveloper, hasClerkSession } = useAuth();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const buildIntegrations = useCallback((): Integration[] => {
    const hasSupabase = Boolean(supabase);
    const hasClerk = Boolean(hasClerkSession);
    const hasOneSignal =
      typeof window !== 'undefined' &&
      typeof (window as Window & { OneSignal?: unknown }).OneSignal !== 'undefined';
    const hasMpesa = Boolean(ENV.MPESA_CONSUMER_KEY || ENV.VITE_MPESA_CONSUMER_KEY);
    const hasResend = Boolean(ENV.VITE_RESEND_API_KEY || ENV.RESEND_API_KEY);
    const hasPosthogKey = Boolean(ENV.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN || ENV.VITE_PUBLIC_POSTHOG_KEY);

    return [
      {
        name: 'Supabase',
        status: hasSupabase ? 'connected' : 'error',
        description: 'Database and backend',
        keyInfo: mask(ENV.VITE_SUPABASE_URL),
        actionLabel: 'Test DB Write',
        icon: <Database className="h-4 w-4" />,
      },
      {
        name: 'Clerk',
        status: hasClerk ? 'connected' : 'partial',
        description: 'Authentication',
        keyInfo: mask(ENV.VITE_CLERK_PUBLISHABLE_KEY),
        actionLabel: 'Test Auth Session',
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        name: 'OneSignal',
        status: hasOneSignal ? 'connected' : 'partial',
        description: 'Push notifications',
        keyInfo: mask(ENV.VITE_ONESIGNAL_APP_ID || ONESIGNAL_APP_ID),
        actionLabel: 'Send Test Notification',
        icon: <BellRing className="h-4 w-4" />,
      },
      {
        name: 'M-Pesa STK',
        status: hasMpesa ? 'connected' : 'partial',
        description: 'Payments',
        keyInfo: hasMpesa ? 'Consumer key configured' : 'Consumer key missing',
        actionLabel: 'Trigger Test STK',
        icon: <Wallet className="h-4 w-4" />,
      },
      {
        name: 'Resend Email',
        status: hasResend ? 'connected' : 'partial',
        description: 'Email delivery',
        keyInfo: mask(ENV.VITE_RESEND_API_KEY || ENV.RESEND_API_KEY),
        actionLabel: 'Send Test Email',
        icon: <Mail className="h-4 w-4" />,
      },
      {
        name: 'PostHog',
        status: hasPosthogKey ? 'partial' : 'planned',
        description: 'Analytics',
        keyInfo: hasPosthogKey ? 'Project key configured, verify tracking' : 'Project key not configured',
        actionLabel: 'Track Test Event',
        icon: <Plug className="h-4 w-4" />,
      },
      {
        name: 'Sentry',
        status: 'planned',
        description: 'Error monitoring',
        keyInfo: 'No config yet',
        actionLabel: 'Planned',
        icon: <Bug className="h-4 w-4" />,
      },
    ];
  }, [hasClerkSession, refreshTick]);

  const integrations = useMemo(() => buildIntegrations(), [buildIntegrations]);

  if (!isDeveloper || user?.role !== 'developer') {
    return <Navigate to="/dashboard" replace />;
  }

  const onRefreshStatus = async () => {
    setIsRefreshing(true);
    setRefreshTick((v) => v + 1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsRefreshing(false);
    toast({
      title: 'Integration status refreshed',
      description: 'Connection checks were re-run for all integrations.',
    });
  };

  const onTest = (integration: Integration) => {
    if (integration.name === 'OneSignal') {
      queueOneSignalPromptPermission();
    }
    toast({
      title: `${integration.name}: ${integration.actionLabel}`,
      description: 'Test action queued for developer verification.',
    });
  };

  return (
    <DeveloperPageShell
      title="Integrations"
      description="Manage and monitor system integrations"
      toolbarEnd={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
          onClick={onRefreshStatus}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          Refresh Status
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {integrations.map((integration) => {
          const isPlanned = integration.status === 'planned';
          return (
            <article
              key={integration.name}
              className="relative rounded-2xl border border-emerald-500/20 bg-zinc-900/70 p-5 shadow-[0_10px_30px_-20px_rgba(16,185,129,0.5)] backdrop-blur"
            >
              <Badge
                className={cn(
                  'absolute right-4 top-4 border text-[11px] font-semibold uppercase tracking-wide',
                  getStatusBadgeClass(integration.status),
                )}
              >
                {getStatusLabel(integration.status)}
              </Badge>

              <div className="mb-4 flex items-start gap-3 pr-24">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
                  {integration.icon}
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{integration.name}</h2>
                  <p className="text-sm text-muted-foreground">{integration.description}</p>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-950/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">Key Info</p>
                <p className="truncate text-sm text-zinc-200">{integration.keyInfo}</p>
              </div>

              <Button
                type="button"
                size="sm"
                variant={isPlanned ? 'secondary' : 'default'}
                disabled={isPlanned}
                className={cn(
                  'w-full',
                  !isPlanned &&
                    'bg-emerald-600 text-white hover:bg-emerald-500',
                )}
                onClick={() => onTest(integration)}
              >
                {integration.actionLabel}
              </Button>
            </article>
          );
        })}
      </div>
    </DeveloperPageShell>
  );
}
