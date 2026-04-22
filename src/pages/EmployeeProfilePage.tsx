import { logger } from "@/lib/logger";
/**
 * Employee profile page: Profile, Access & Permissions, Project Access, Activity, Security.
 * Admin-only; company-scoped.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Shield, FolderKanban, History, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { EmployeeService } from '@/services/localData/EmployeeService';
import {
  getEffectivePermissionKeys,
  getEmployeeProjectAccess,
  setEmployeePermissions,
  setEmployeeProjectAccess,
  listActivityLogs,
  logActivity,
} from '@/services/employeeAccessService';
import { AccessControlPermissionEditor } from '@/components/permissions/AccessControlPermissionEditor';
import { PERMISSION_KEYS, type PermissionKey } from '@/config/accessControl';
import { EMPLOYEE_ROLE_LABELS, type EmployeeRoleKey } from '@/config/accessControl';
import { db } from '@/lib/db';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types';
import { UserAvatar } from '@/components/UserAvatar';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';

type TabId = 'profile' | 'access' | 'projects' | 'activity' | 'security';

export default function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = user?.companyId ?? null;

  const canEdit = can('employees', 'edit');
  const canManagePermissions = can('employees', 'edit'); // or employees.permissions.manage when using key-based

  const { data: employees = [], isLoading: loadingList } = useQuery({
    queryKey: ['employees', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await EmployeeService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return EmployeeService.listEmployees(companyId);
    },
    enabled: Boolean(companyId),
  });

  const employee = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? null,
    [employees, employeeId]
  );

  useEffect(() => {
    if (!companyId || !employeeId) return;
    captureEvent(AnalyticsEvents.EMPLOYEE_VIEWED, {
      company_id: companyId,
      employee_id: employeeId,
      module_name: 'employees',
      route_path: `/employees/${employeeId}`,
    });
  }, [companyId, employeeId]);

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [allowedKeys, setAllowedKeys] = useState<Set<string>>(new Set());
  const [projectAccessIds, setProjectAccessIds] = useState<string[]>([]);
  const [activityLogs, setActivityLogs] = useState<{ action: string; module: string | null; created_at: string }[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [savingProjects, setSavingProjects] = useState(false);

  useEffect(() => {
    if (!employeeId || !companyId || !employee) return;
    (async () => {
      const [keys, projects] = await Promise.all([
        getEffectivePermissionKeys(companyId, employeeId, employee.employeeRole ?? employee.role ?? null),
        getEmployeeProjectAccess(companyId, employeeId),
      ]);
      setAllowedKeys(keys);
      setProjectAccessIds(projects);
    })();
  }, [companyId, employeeId, employee]);

  useEffect(() => {
    if (!companyId || !employeeId) return;
    listActivityLogs({ companyId, employeeId, limit: 30 }).then((logs) =>
      setActivityLogs(logs.map((l) => ({ action: l.action, module: l.module, created_at: l.created_at })))
    );
  }, [companyId, employeeId]);

  const handleSavePermissions = useCallback(async () => {
    if (!companyId || !employeeId) return;
    setSavingPermissions(true);
    try {
      await setEmployeePermissions(companyId, employeeId, allowedKeys);
      await logActivity({
        companyId,
        employeeId,
        action: 'Updated permissions',
        module: 'employees',
        metadata: { updated_by: user?.id },
      });
      toast({ title: 'Saved', description: 'Permissions updated.' });

      // Refetch employees so Access tab reloads from saved employees.permissions JSON
      await queryClient.refetchQueries({ queryKey: ['employees', companyId] });
      const fresh = (queryClient.getQueryData(['employees', companyId]) as Employee[] | undefined) ?? [];
      const updated = fresh.find((e) => e.id === employeeId) ?? null;
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Employee Access] post-save refetch result', {
          employeeId,
          permissions: updated?.permissions ?? null,
        });
      }
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingPermissions(false);
    }
  }, [companyId, employeeId, allowedKeys, user?.id, toast]);

  const handleSaveProjectAccess = useCallback(async () => {
    if (!companyId || !employeeId) return;
    setSavingProjects(true);
    try {
      await setEmployeeProjectAccess(companyId, employeeId, projectAccessIds);
      await logActivity({
        companyId,
        employeeId,
        action: 'Updated project access',
        module: 'employees',
        metadata: { updated_by: user?.id, project_count: projectAccessIds.length },
      });
      toast({ title: 'Saved', description: 'Project access updated.' });
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingProjects(false);
    }
  }, [companyId, employeeId, projectAccessIds, user?.id, toast]);

  if (!companyId) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">No company selected.</p>
      </div>
    );
  }

  if (loadingList || (!employee && employeeId)) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-muted-foreground">Employee not found.</p>
        <Button variant="outline" onClick={() => navigate('/employees')}>
          Back to Employees
        </Button>
      </div>
    );
  }

  const roleKey = (employee.employeeRole ?? employee.role ?? 'custom') as EmployeeRoleKey;
  const roleLabel = EMPLOYEE_ROLE_LABELS[roleKey] ?? roleKey;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/employees')}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <UserAvatar
          avatarUrl={employee.avatarUrl}
          name={employee.fullName || employee.name}
          size="md"
          className="h-10 w-10 bg-primary/10 text-primary"
        />
        <h1 className="text-xl font-bold truncate">{employee.fullName || employee.name}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="profile" className="gap-1">
            <User className="h-3.5 w-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-1">
            <Shield className="h-3.5 w-3.5" />
            Access
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1">
            <FolderKanban className="h-3.5 w-3.5" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1">
            <History className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1">
            <Lock className="h-3.5 w-3.5" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Name:</span> {employee.fullName || employee.name}</p>
              {employee.email && <p><span className="text-muted-foreground">Email:</span> {employee.email}</p>}
              {employee.phone && <p><span className="text-muted-foreground">Phone:</span> {employee.phone}</p>}
              <p><span className="text-muted-foreground">Role:</span> {roleLabel}</p>
              <p><span className="text-muted-foreground">Status:</span> {employee.status}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Access & Permissions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Grouped by category. Choose what this employee can view or edit.
              </p>
            </CardHeader>
            <CardContent>
              {/* Keep the legacy editor available for now, but render a clearer grouped UI first. */}
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3">
                <Accordion type="multiple" className="w-full">
                  {[
                    { id: 'dashboard', label: '📊 Dashboard', keys: PERMISSION_KEYS.filter((k) => k.startsWith('dashboard.')) },
                    {
                      id: 'projects_ops',
                      label: '🌱 Projects & Operations',
                      keys: PERMISSION_KEYS.filter(
                        (k) =>
                          k.startsWith('projects.') ||
                          k.startsWith('operations.') ||
                          k.startsWith('crop_monitoring.') ||
                          k.startsWith('suppliers.')
                      ),
                    },
                    { id: 'inventory', label: '📦 Inventory', keys: PERMISSION_KEYS.filter((k) => k.startsWith('inventory.')) },
                    {
                      id: 'harvest',
                      label: '🚜 Harvest',
                      keys: PERMISSION_KEYS.filter((k) => k.startsWith('harvest.') || k.startsWith('harvest_collections.')),
                    },
                    { id: 'records', label: '📁 Records', keys: PERMISSION_KEYS.filter((k) => k.startsWith('records.')) },
                    {
                      id: 'finance',
                      label: '💰 Finance',
                      keys: PERMISSION_KEYS.filter(
                        (k) => k.startsWith('expenses.') || k.startsWith('financials.') || k.startsWith('reports.')
                      ),
                    },
                    { id: 'logistics', label: '🚚 Logistics', keys: PERMISSION_KEYS.filter((k) => k.startsWith('logistics.')) },
                    { id: 'employees', label: '👥 Employees', keys: PERMISSION_KEYS.filter((k) => k.startsWith('employees.')) },
                    { id: 'settings', label: '⚙️ Settings', keys: PERMISSION_KEYS.filter((k) => k.startsWith('settings.')) },
                  ]
                    .filter((g) => g.keys.length > 0)
                    .map((group) => {
                      const viewKeys = group.keys.filter((k) => k.endsWith('.view'));
                      const editKeys = group.keys.filter((k) => !k.endsWith('.view'));
                      const canViewAll = viewKeys.length ? viewKeys.every((k) => allowedKeys.has(k)) : false;
                      const canEditAll = editKeys.length ? editKeys.every((k) => allowedKeys.has(k)) : false;
                      const disabled = !canManagePermissions;

                      const setMany = (keys: readonly PermissionKey[], checked: boolean) => {
                        const next = new Set(allowedKeys);
                        keys.forEach((k) => {
                          if (checked) next.add(k);
                          else next.delete(k);
                        });
                        setAllowedKeys(next);
                      };

                      return (
                        <AccordionItem key={group.id} value={group.id} className="border-border/50">
                          <div className="flex items-center gap-3">
                            <AccordionTrigger className="py-3 hover:no-underline">
                              <span className="text-sm font-medium text-foreground">{group.label}</span>
                            </AccordionTrigger>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="text-xs text-muted-foreground">View</span>
                              <Switch
                                checked={canViewAll}
                                disabled={disabled || viewKeys.length === 0}
                                onCheckedChange={(checked) => setMany(viewKeys as PermissionKey[], Boolean(checked))}
                                aria-label={`${group.label} view permission`}
                              />
                              <span className="text-xs text-muted-foreground">Edit</span>
                              <Switch
                                checked={canEditAll}
                                disabled={disabled || editKeys.length === 0}
                                onCheckedChange={(checked) => setMany(editKeys as PermissionKey[], Boolean(checked))}
                                aria-label={`${group.label} edit permissions`}
                              />
                            </div>
                          </div>
                          <AccordionContent className="pt-1 pb-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {group.keys
                                .filter((k) => !k.endsWith('.view'))
                                .map((key) => {
                                  const checked = allowedKeys.has(key);
                                  return (
                                    <label
                                      key={key}
                                      className="flex items-center gap-2 rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-xs sm:text-sm"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        disabled={disabled}
                                        onCheckedChange={(next) => {
                                          const n = new Set(allowedKeys);
                                          if (next === true) n.add(key);
                                          else n.delete(key);
                                          setAllowedKeys(n);
                                        }}
                                      />
                                      <span className="text-foreground">{key.split('.').slice(1).join('.') || 'view'}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                </Accordion>
              </div>

              {canManagePermissions && (
                <Button className="mt-4" onClick={handleSavePermissions} disabled={savingPermissions}>
                  {savingPermissions ? 'Saving…' : 'Save permissions'}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Access</CardTitle>
              <p className="text-sm text-muted-foreground">Leave empty to allow access to all projects in the company.</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {projectAccessIds.length === 0
                  ? 'This employee has access to all projects.'
                  : `${projectAccessIds.length} project(s) assigned.`}
              </p>
              {canEdit && (
                <Button className="mt-2" variant="outline" size="sm" onClick={() => navigate(`/employees?edit=${employeeId}&tab=projects`)}>
                  Edit project access (in Employees list)
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <p className="text-sm text-muted-foreground">Recent actions by this employee.</p>
            </CardHeader>
            <CardContent>
              {activityLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {activityLogs.map((log, i) => (
                    <li key={i} className="flex justify-between gap-2 border-b border-border pb-2">
                      <span>{log.action}</span>
                      <span className="text-muted-foreground shrink-0">
                        {log.created_at ? format(new Date(log.created_at), 'PPp') : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <p className="text-sm text-muted-foreground">Suspend or reactivate this employee.</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Status: <strong>{employee.status}</strong></p>
              {canEdit && (
                <Button
                  className="mt-2"
                  variant={employee.status === 'suspended' ? 'default' : 'destructive'}
                  size="sm"
                  onClick={async () => {
                    const nextStatus = employee.status === 'suspended' ? 'active' : 'suspended';
                    try {
                      await db.public().from('employees').update({ status: nextStatus }).eq('id', employee.id);
                      await logActivity({
                        companyId: companyId!,
                        employeeId: employee.id,
                        action: nextStatus === 'suspended' ? 'Employee suspended' : 'Employee reactivated',
                        module: 'employees',
                        metadata: { updated_by: user?.id },
                      });
                      queryClient.invalidateQueries({ queryKey: ['employees', companyId] });
                      toast({ title: nextStatus === 'suspended' ? 'Suspended' : 'Reactivated' });
                    } catch (e) {
                      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
                    }
                  }}
                >
                  {employee.status === 'suspended' ? 'Reactivate employee' : 'Suspend employee'}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
