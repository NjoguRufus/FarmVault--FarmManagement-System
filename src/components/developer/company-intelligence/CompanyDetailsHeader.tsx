import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Mail, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDevDateShort } from './utils';

type SubRow = Record<string, unknown>;

type Props = {
  header: Record<string, unknown> | undefined;
  className?: string;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function CompanyDetailsHeader({ header, className }: Props) {
  const name = str(header?.name) ?? 'Company';
  const email = str(header?.email);
  const phone = str(header?.phone);
  const logo = str(header?.logo_url);
  const created = str(header?.created_at as string);
  const ownerName = str(header?.owner_name);
  const ownerEmail = str(header?.owner_email);
  const sub = (header?.subscription as SubRow | undefined) ?? {};

  const plan =
    str(sub.plan_code) ?? str(sub.plan_id) ?? str(sub.plan) ?? '—';
  const status = str(sub.status) ?? '—';
  const isTrial = sub.is_trial === true;
  const trialEnd = str(sub.trial_ends_at as string);
  const activeUntil = str(sub.active_until as string) ?? str(sub.current_period_end as string);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card/95 to-muted/20 shadow-sm',
        className,
      )}
    >
      <div className="border-b border-border/50 bg-muted/10 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" className="w-fit gap-1.5 px-2 -ml-2 text-muted-foreground" asChild>
            <Link to="/developer/companies">
              <ArrowLeft className="h-4 w-4" />
              Companies
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-normal text-xs">
              Plan: {plan}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'font-normal text-xs',
                status.toLowerCase() === 'active' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
                (status.toLowerCase() === 'trialing' || status.toLowerCase() === 'trial') &&
                  'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
              )}
            >
              {status.replace(/_/g, ' ')}
            </Badge>
            {isTrial ? (
              <Badge variant="outline" className="font-normal text-xs border-amber-500/30 bg-amber-500/5">
                Trial
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs font-normal">
                Trial: off
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-4 sm:flex-row sm:items-start sm:gap-8 sm:p-6">
        <div className="flex shrink-0 items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40 sm:h-20 sm:w-20">
            {logo ? (
              <img src={logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 sm:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Farm Intelligence</p>
            <h1 className="text-lg font-bold tracking-tight text-foreground">{name}</h1>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground break-all">{str(header?.company_id)}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="hidden sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Farm Intelligence</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{name}</h1>
            <p className="mt-1 text-xs text-muted-foreground font-mono">{str(header?.company_id)}</p>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Owner / admin</p>
                <p className="truncate font-medium text-foreground">{ownerName ?? '—'}</p>
                {ownerEmail ? <p className="truncate text-xs text-muted-foreground">{ownerEmail}</p> : null}
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Company email</p>
                <p className="truncate text-foreground">{email ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">Phone</p>
                <p className="text-foreground">{phone ?? '—'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground/80">Created</span> {formatDevDateShort(created ?? undefined)}
            </span>
            <span>
              <span className="font-medium text-foreground/80">Trial ends</span> {formatDevDateShort(trialEnd ?? undefined)}
            </span>
            <span>
              <span className="font-medium text-foreground/80">Active until</span> {formatDevDateShort(activeUntil ?? undefined)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
