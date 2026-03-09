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
import { useToast } from '@/hooks/use-toast';
import { listEmployees } from '@/services/employeesSupabaseService';
import {
  getEffectivePermissionKeys,
  getEmployeeProjectAccess,
  setEmployeePermissions,
  setEmployeeProjectAccess,
  listActivityLogs,
  logActivity,
} from '@/services/employeeAccessService';
import { AccessControlPermissionEditor } from '@/components/permissions/AccessControlPermissionEditor';
import { EMPLOYEE_ROLE_LABELS, type EmployeeRoleKey } from '@/config/accessControl';
import { db } from '@/lib/db';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types';

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
    queryFn: () => (companyId ? listEmployees(companyId) : Promise.resolve([])),
    enabled: Boolean(companyId),
  });

  const employee = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? null,
    [employees, employeeId]
  );

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
        console.log('[Employee Access] post-save refetch result', {
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
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/employees')}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
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
              <p className="text-sm text-muted-foreground">Grouped by module. Only admins can change these.</p>
            </CardHeader>
            <CardContent>
              <AccessControlPermissionEditor
                allowedKeys={allowedKeys}
                onChange={setAllowedKeys}
                disabled={!canManagePermissions}
              />
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
