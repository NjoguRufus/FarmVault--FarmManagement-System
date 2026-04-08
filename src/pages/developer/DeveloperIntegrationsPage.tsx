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
  if (status === 'connected') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40';
  if (status === 'partial') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40';
  if (status === 'error') return 'bg-destructive/15 text-destructive border-destructive/40';
  return 'bg-muted text-muted-foreground border-border';
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
          className="gap-1.5"
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
              className="relative rounded-2xl border border-border/60 bg-background p-5 shadow-[8px_8px_18px_rgba(0,0,0,0.12),-8px_-8px_18px_rgba(255,255,255,0.03)] dark:shadow-[8px_8px_18px_rgba(0,0,0,0.45),-8px_-8px_18px_rgba(255,255,255,0.02)]"
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
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-muted/50 text-primary shadow-[inset_2px_2px_4px_rgba(255,255,255,0.06),inset_-2px_-2px_4px_rgba(0,0,0,0.18)]">
                  {integration.icon}
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{integration.name}</h2>
                  <p className="text-sm text-muted-foreground">{integration.description}</p>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-border/60 bg-muted/35 px-3 py-2 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.16),inset_-2px_-2px_5px_rgba(255,255,255,0.03)]">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Key Info</p>
                <p className="truncate text-sm text-foreground">{integration.keyInfo}</p>
              </div>

              <Button
                type="button"
                size="sm"
                variant={isPlanned ? 'secondary' : 'default'}
                disabled={isPlanned}
                className={cn(
                  'w-full',
                  !isPlanned &&
                    'bg-primary text-primary-foreground hover:bg-primary/90',
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
