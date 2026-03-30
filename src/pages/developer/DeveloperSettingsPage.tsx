import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DeveloperPageShell } from '@/components/developer/DeveloperPageShell';
import {
  getDeveloperSettings,
  listCompaniesForDeveloperSettings,
  linkDeveloperToCompany,
  removeDeveloperCompanyLink,
  setDeveloperRole,
  renameCompany,
  type DeveloperSettings,
} from '@/services/developerAdminService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Copy, AlertTriangle, Link2, Unlink, Shield, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type CompanyOption = {
  company_id?: string;
  id?: string;
  company_name?: string | null;
  name?: string | null;
  created_at?: string | null;
};

function getStatus(settings: DeveloperSettings | null): {
  label: string;
  variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive';
  description: string;
} {
  if (!settings || !settings.developer_clerk_user_id) {
    return {
      label: 'No developer record',
      variant: 'destructive',
      description: 'This account is not registered in admin.developers.',
    };
  }

  const hasCompany = !!settings.active_company_id || !!settings.member_company_id;
  const hasRole = !!settings.member_role && settings.member_role.trim().length > 0;

  if (!hasCompany && !hasRole) {
    return {
      label: 'No company linked',
      variant: 'warning',
      description: 'This developer is not currently linked to any company.',
    };
  }

  if (hasCompany && !hasRole) {
    return {
      label: 'Role missing',
      variant: 'warning',
      description: 'Company link exists but the membership role is blank or missing.',
    };
  }

  if (
    settings.active_company_id &&
    settings.member_company_id &&
    settings.active_company_id !== settings.member_company_id
  ) {
    return {
      label: 'Orphaned membership',
      variant: 'warning',
      description:
        'There is a membership for a different company than the active company. Review carefully before changing links.',
    };
  }

  return {
    label: 'Linked correctly',
    variant: 'success',
    description: 'Developer, company link, and role are aligned.',
  };
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr ?? '—';
  }
}

export default function DeveloperSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isDeveloper, effectiveAccess, forceDeveloperMode } = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState<string>('');
  const [roleDraft, setRoleDraft] = useState<string>('');
  const [companyNameDraft, setCompanyNameDraft] = useState<string>('');
  const [confirmRenameOpen, setConfirmRenameOpen] = useState(false);

  const {
    data: settings,
    isLoading: isSettingsLoading,
    isFetching: isSettingsRefetching,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ['developer', 'settings'],
    queryFn: () => getDeveloperSettings(),
  });

  const {
    data: companiesData,
    isLoading: isCompaniesLoading,
    isFetching: isCompaniesRefetching,
    refetch: refetchCompanies,
  } = useQuery({
    queryKey: ['developer', 'companies', companySearch || ''],
    queryFn: () =>
      listCompaniesForDeveloperSettings({
        search: companySearch ? companySearch.trim() : null,
        limit: 200,
        offset: 0,
      }),
  });

  const companies = useMemo<CompanyOption[]>(() => {
    return (companiesData?.items ?? []) as CompanyOption[];
  }, [companiesData]);

  const duplicatesByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of companies) {
      const name = (c.company_name ?? c.name ?? '').trim().toLowerCase();
      if (!name) continue;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return map;
  }, [companies]);

  const selectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;
    return (
      companies.find(
        (c) => c.company_id === selectedCompanyId || c.id === selectedCompanyId,
      ) ?? null
    );
  }, [companies, selectedCompanyId]);

  const activeCompanyId = settings?.active_company_id ?? settings?.member_company_id ?? null;

  const companyForIdentity = useMemo(() => {
    if (!activeCompanyId) return null;
    return (
      companies.find(
        (c) => c.company_id === activeCompanyId || c.id === activeCompanyId,
      ) ?? null
    );
  }, [companies, activeCompanyId]);

  const status = getStatus(settings ?? null);

  const platformRole = (user?.role ?? 'unknown').toString();
  const tenantRole = settings?.member_role ?? null;
  const developerOverrideActive = platformRole === 'developer';

  const showDeveloperSwitch =
    !!settings?.developer_clerk_user_id && (developerOverrideActive === false || !isDeveloper);

  const linkMutation = useMutation({
    mutationFn: async (companyId: string) => {
      await linkDeveloperToCompany(companyId);
    },
    onSuccess: () => {
      toast({
        title: 'Company linked',
        description: 'Your developer account is now linked to the selected company.',
      });
      queryClient.invalidateQueries({ queryKey: ['developer', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Link failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      await removeDeveloperCompanyLink();
    },
    onSuccess: () => {
      toast({
        title: 'Link removed',
        description: 'Your active company link has been cleared.',
      });
      queryClient.invalidateQueries({ queryKey: ['developer', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Remove link failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (role: string) => {
      await setDeveloperRole(role);
    },
    onSuccess: () => {
      toast({
        title: 'Role updated',
        description: 'Your membership role has been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['developer', 'settings'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Role update failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (payload: { companyId: string; name: string }) => {
      await renameCompany(payload.companyId, payload.name);
    },
    onSuccess: () => {
      toast({
        title: 'Company renamed',
        description: 'Company name has been updated safely.',
      });
      setConfirmRenameOpen(false);
      queryClient.invalidateQueries({ queryKey: ['developer', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['developer', 'companies'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Rename failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleCopy = (value: string | null | undefined) => {
    if (!value) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        toast({ title: 'Copied', description: 'ID copied to clipboard.' });
      })
      .catch(() => {
        toast({
          title: 'Copy failed',
          description: 'Unable to copy to clipboard.',
          variant: 'destructive',
        });
      });
  };

  const isLoadingAny =
    isSettingsLoading || isCompaniesLoading || linkMutation.isPending || unlinkMutation.isPending;

  const handlePrepareRename = () => {
    if (!companyForIdentity) return;
    const currentName = companyForIdentity.company_name ?? companyForIdentity.name ?? '';
    setCompanyNameDraft(currentName);
    setConfirmRenameOpen(true);
  };

  const handleConfirmRename = () => {
    if (!activeCompanyId || !companyNameDraft.trim()) return;
    renameMutation.mutate({ companyId: activeCompanyId, name: companyNameDraft.trim() });
  };

  const switchBackMutation = useMutation({
    mutationFn: async () => {
      const result = await forceDeveloperMode();
      return result;
    },
    onSuccess: (result) => {
      toast({
        title: 'Developer mode restored',
        description:
          'Your session has been refreshed as a platform developer. You will now see admin routes again.',
      });
      const target = result?.landingPage || '/developer';
      navigate(target);
    },
    onError: (err: Error) => {
      toast({
        title: 'Unable to restore developer mode',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <DeveloperPageShell
      title="Developer Settings"
      description="Safely manage your developer identity, company link, and role without deleting data."
      isLoading={isSettingsLoading || isCompaniesLoading}
      isRefetching={isSettingsRefetching || isCompaniesRefetching}
      onRefresh={() => {
        refetchSettings();
        refetchCompanies();
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Developer Identity Card */}
        <Card className="border-border/60 bg-gradient-to-b from-background to-background/60 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">
                  Developer Identity
                </CardTitle>
                <CardDescription className="text-xs">
                  Single source of truth for your developer account and linked company.
                </CardDescription>
              </div>
              <Badge
                variant={status.variant}
                className="flex items-center gap-1.5 border border-border/60 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em]"
              >
                <Shield className="h-3 w-3" />
                {status.label}
              </Badge>
              {showDeveloperSwitch && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={switchBackMutation.isPending}
                  onClick={() => {
                    switchBackMutation.mutate();
                  }}
                >
                  {switchBackMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span className="text-xs">Switch back to developer</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.18em]">
                  Developer
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Created {formatDate(settings?.developer_created_at)}
                </span>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1.5">
                <div className="font-medium">
                  {settings?.developer_full_name || '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {settings?.developer_email || '—'}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Clerk User ID
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground/90 truncate max-w-[220px]">
                      {settings?.developer_clerk_user_id || '—'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!settings?.developer_clerk_user_id}
                    onClick={() => handleCopy(settings?.developer_clerk_user_id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-[11px] md:grid-cols-4">
              <div className="space-y-0.5">
                <div className="font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Platform role
                </div>
                <div className="font-mono text-[11px]">
                  {platformRole || 'unknown'}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Tenant role
                </div>
                <div className="font-mono text-[11px]">
                  {tenantRole || '—'}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Active company
                </div>
                <div className="font-mono text-[11px]">
                  {activeCompanyId || '—'}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Developer override
                </div>
                <div className="font-mono text-[11px]">
                  {developerOverrideActive ? 'active' : 'inactive'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.18em]">
                  Active Company
                </span>
                <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate">
                      {settings?.active_company_name ||
                        settings?.member_company_name ||
                        'No active company'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Company ID
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground/90 truncate max-w-[180px]">
                        {activeCompanyId || '—'}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!activeCompanyId}
                      onClick={() => handleCopy(activeCompanyId)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      Created {formatDate(companyForIdentity?.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.18em]">
                  Role & Membership
                </span>
                <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">Current role</span>
                      <span className="text-sm font-medium">
                        {settings?.member_role || '—'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <Label htmlFor="roleDraft" className="text-[11px] text-muted-foreground">
                      Update role
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="roleDraft"
                        value={roleDraft}
                        onChange={(e) => setRoleDraft(e.target.value)}
                        placeholder={settings?.member_role || 'e.g. company-admin'}
                        className="h-8 text-xs"
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!roleDraft.trim() || roleMutation.isPending || !activeCompanyId}
                            className="gap-1.5"
                          >
                            {roleMutation.isPending && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            <span className="text-xs">Save role</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Change your company role?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will update your role for the currently active company to
                              &ldquo;{roleDraft.trim() || 'company-admin'}&rdquo;. No companies or
                              other users will be deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                if (!roleDraft.trim()) return;
                                roleMutation.mutate(roleDraft.trim());
                              }}
                            >
                              Confirm role
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      Joined {formatDate(settings?.member_created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-[1px]" />
              <span>{status.description}</span>
            </p>
          </CardContent>
        </Card>

        {/* Company Link Management */}
        <Card className="border-border/60 bg-background/60 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">
                  Company Link Management
                </CardTitle>
                <CardDescription className="text-xs">
                  Safely attach or detach your developer account from a company without deleting it.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Search / select company
              </Label>
              <Input
                placeholder="Search companies by name, plan, or ID…"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="h-8 text-xs mb-2"
              />
              <Select
                value={selectedCompanyId ?? ''}
                onValueChange={(val) => setSelectedCompanyId(val)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose company to link…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {companies.map((c) => {
                    const id = c.company_id ?? c.id ?? '';
                    const name = c.company_name ?? c.name ?? id;
                    const norm = name.trim().toLowerCase();
                    const isDuplicate = norm && (duplicatesByName.get(norm) ?? 0) > 1;
                    return (
                      <SelectItem key={id} value={id} className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium flex items-center gap-1">
                            {name}
                            {isDuplicate && (
                              <Badge
                                variant="outline"
                                className="h-4 px-1 text-[10px] uppercase tracking-[0.16em] text-amber-600 border-amber-500/60"
                              >
                                Similar name
                              </Badge>
                            )}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {id} · Created {formatDate(c.created_at)}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={!selectedCompanyId || linkMutation.isPending || isLoadingAny}
                  >
                    {linkMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="text-xs">Link me to this company</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm company link</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will set the selected company as your active company and create or update
                      your membership. No companies will be deleted. Are you sure you want to
                      continue?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (!selectedCompanyId) return;
                        linkMutation.mutate(selectedCompanyId);
                      }}
                    >
                      Confirm link
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!activeCompanyId || unlinkMutation.isPending || isLoadingAny}
                  >
                    {unlinkMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <Unlink className="h-3.5 w-3.5" />
                    <span className="text-xs">Remove incorrect link</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove current company link?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will clear your active company and remove your membership for that
                      company, but it will not delete the company. You can always re-link later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        unlinkMutation.mutate();
                      }}
                    >
                      Confirm remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={!activeCompanyId}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="text-xs">Set as company admin</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Set role to company-admin?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will update your role for the currently active company to
                      &ldquo;company-admin&rdquo;. No other memberships or companies will be
                      changed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        roleMutation.mutate('company_admin');
                      }}
                    >
                      Confirm role
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {selectedCompany && (() => {
              const id = selectedCompany.company_id ?? selectedCompany.id ?? '';
              const name = selectedCompany.company_name ?? selectedCompany.name ?? id;
              const norm = name.trim().toLowerCase();
              const isDuplicate = norm && (duplicatesByName.get(norm) ?? 0) > 1;
              if (!isDuplicate) return null;
              return (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-medium text-amber-900 dark:text-amber-100">
                      Multiple companies share a similar name.
                    </div>
                    <p className="text-amber-900/80 dark:text-amber-100/80">
                      Double-check the company ID and created date before linking. This page will
                      never delete companies; it only adjusts your membership.
                    </p>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Company Identity Editor */}
      <Card className="mt-6 border-border/60 bg-background/60 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">
                Company Identity Editor
              </CardTitle>
              <CardDescription className="text-xs">
                Rename the currently linked company safely. No records or other companies are deleted from here.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="companyName" className="text-xs text-muted-foreground">
                Company name
              </Label>
              <Input
                id="companyName"
                value={companyNameDraft}
                onChange={(e) => setCompanyNameDraft(e.target.value)}
                placeholder={
                  companyForIdentity?.company_name ??
                  companyForIdentity?.name ??
                  'Select a company above to edit'
                }
                disabled={!activeCompanyId || renameMutation.isPending}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Company ID (read-only)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={activeCompanyId ?? ''}
                  readOnly
                  className="h-9 text-xs font-mono"
                  placeholder="No active company selected"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!activeCompanyId}
                  onClick={() => handleCopy(activeCompanyId)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Actions</Label>
              <Button
                type="button"
                size="sm"
                className={cn(
                  'w-full gap-1.5',
                  confirmRenameOpen && 'border-amber-500 bg-amber-500/10',
                )}
                variant="outline"
                disabled={!activeCompanyId || !companyForIdentity}
                onClick={handlePrepareRename}
              >
                {renameMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span className="text-xs">
                  {confirmRenameOpen ? 'Confirm rename below' : 'Prepare safe rename'}
                </span>
              </Button>
            </div>
          </div>

          {confirmRenameOpen && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium text-amber-900 dark:text-amber-100">
                  Confirm company rename
                </div>
                <p className="text-amber-900/80 dark:text-amber-100/80">
                  This will update the name of the currently linked company only. No companies will
                  be deleted from this page. Double-check the company ID and new name before
                  continuing.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={
                      !activeCompanyId || !companyNameDraft.trim() || renameMutation.isPending
                    }
                    onClick={handleConfirmRename}
                  >
                    {renameMutation.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <span className="text-xs">Save company name</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => setConfirmRenameOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </DeveloperPageShell>
  );
}

