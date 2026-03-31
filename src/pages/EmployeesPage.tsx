import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MoreHorizontal, Phone, Mail, Eye, EyeOff, User as UserIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db, authEmployeeCreate } from '@/lib/firebase';
import { serverTimestamp, doc, setDoc, updateDoc } from '@/lib/firestore-stub';
import { createUserWithEmailAndPassword } from '@/lib/auth-stub';
import { useCollection } from '@/hooks/useCollection';
import { Employee, PermissionMap, PermissionPresetKey, User } from '@/types';
import { employeesProvider } from '@/lib/provider';
import {
  listEmployees,
  inviteEmployee,
  updateEmployee as updateEmployeeSupabase,
  saveEmployeeDraft,
  setEmployeeStatus,
  deleteEmployee as deleteEmployeeSupabase,
  revokeEmployeeInvite,
  resendEmployeeInvite,
} from '@/services/employeesSupabaseService';
import { resolveUserDisplayName } from '@/lib/userDisplayName';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { PermissionEditor } from '@/components/permissions/PermissionEditor';
import { getDefaultPermissions, resolvePermissions, expandFlatPermissions } from '@/lib/permissions';
import { getPresetPermissions as getEmployeePresetPermissions } from '@/lib/employees/permissionPresets';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { EMPLOYEE_ROLES, PERMISSION_GROUPS, type EmployeeRoleKey, type PermissionKey } from '@/config/accessControl';
import { ROLE_PRESET_LABELS, ROLE_PRESET_KEYS, roleToPreset, presetToLegacyRole } from '@/lib/access';
import { logActivity } from '@/services/employeeAccessService';
import { UserAvatar } from '@/components/UserAvatar';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { BASIC_LIMITS } from '@/config/basicLimits';
import { useEffectivePlanAccess } from '@/hooks/useEffectivePlanAccess';
import { openUpgradeModal } from '@/lib/upgradeModalEvents';

type ManagedEmployeeRole = 'operations-manager' | 'logistics-driver' | 'sales-broker' | EmployeeRoleKey;
type EmployeeRoleSelection = ManagedEmployeeRole | 'none';
type PermissionEditorPreset = PermissionPresetKey | 'custom';

function labelForPermissionKey(key: PermissionKey): string {
  const [, action] = key.split('.');
  // Keep the UI consistent with existing copy in screenshots.
  return (action || 'view').replace(/_/g, ' ');
}

function normalizeFlatPermissions(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (typeof v === 'boolean') out[k] = v;
  });
  return out;
}

// Role options: new preset labels with legacy DB values for backward-safe save.
const ROLE_OPTIONS: Array<{
  value: ManagedEmployeeRole | string;
  label: string;
  department: string;
}> = [
  { value: 'admin', label: ROLE_PRESET_LABELS.administrator, department: 'Admin' },
  { value: 'operations-manager', label: ROLE_PRESET_LABELS.operations_manager, department: 'Operations' },
  { value: 'inventory_officer', label: ROLE_PRESET_LABELS.inventory_staff, department: 'Inventory' },
  { value: 'weighing_clerk', label: ROLE_PRESET_LABELS.harvest_staff, department: 'Harvest' },
  { value: 'finance_officer', label: ROLE_PRESET_LABELS.finance_staff, department: 'Finance' },
  { value: 'custom', label: ROLE_PRESET_LABELS.custom, department: 'General' },
  { value: 'logistics-driver', label: 'Logistics (Driver)', department: 'Logistics' },
  { value: 'sales-broker', label: 'Sales (Broker)', department: 'Sales' },
];

const DEFAULT_PERMISSIONS = resolvePermissions(null, getDefaultPermissions());

const isEmployeesSupabase = employeesProvider === 'supabase';

function mapEmployeeRoleToAppRole(role: ManagedEmployeeRole | null): 'manager' | 'broker' | 'employee' {
  if (role === 'operations-manager') return 'manager';
  if (role === 'sales-broker') return 'broker';
  return 'employee';
}

function normalizeEmployeeRole(role: string | null | undefined): ManagedEmployeeRole | null {
  if (!role) return null;
  if (EMPLOYEE_ROLES.includes(role as EmployeeRoleKey)) return role as ManagedEmployeeRole;
  if (role === 'operations-manager' || role === 'manager') return 'operations-manager';
  if (role === 'logistics-driver' || role === 'driver') return 'logistics-driver';
  if (role === 'sales-broker' || role === 'broker') return 'sales-broker';
  return null;
}

function getEmployeeRole(employee: Employee): ManagedEmployeeRole | null {
  return normalizeEmployeeRole(employee.employeeRole ?? employee.role);
}

function resolveRoleForSave(
  selection: EmployeeRoleSelection,
  employee: Employee | null,
): string | null {
  if (selection !== 'none') return selection;
  const existingRawRole = employee?.employeeRole ?? employee?.role ?? null;
  if (!existingRawRole) return null;
  // Preserve unknown legacy roles unless the admin explicitly maps them first.
  if (!normalizeEmployeeRole(existingRawRole)) return existingRawRole;
  return null;
}

function getEmployeeName(employee: Employee): string {
  return resolveUserDisplayName({
    profileDisplayName: employee.fullName ?? employee.name,
    email: employee.email,
  });
}

function getEmployeePhone(employee: Employee): string {
  return employee.phone || employee.contact || '';
}

function getRoleLabel(role: string | null | undefined): string {
  if (!role) return 'Custom permissions';
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

function getDepartmentFromRole(role: ManagedEmployeeRole | null): string {
  if (!role) return 'General';
  return ROLE_OPTIONS.find((option) => option.value === role)?.department || 'General';
}

export default function EmployeesPage() {
  const { user, employeeProfile, refreshAuthState } = useAuth();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const canCreateEmployees = can('employees', 'create');
  const canEditEmployees = can('employees', 'edit');
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'fv-badge--active',
      'on-leave': 'fv-badge--warning',
      inactive: 'bg-muted text-muted-foreground',
      suspended: 'fv-badge--warning',
      archived: 'bg-muted text-muted-foreground',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<EmployeeRoleSelection>('none');
  const [department, setDepartment] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addPermissions, setAddPermissions] = useState<PermissionMap>(DEFAULT_PERMISSIONS);
  const [addPreset, setAddPreset] = useState<PermissionEditorPreset>('custom');
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [permissionPreset, setPermissionPreset] = useState<EmployeeRoleKey>('custom');
  const [permissionsFlat, setPermissionsFlat] = useState<Record<string, boolean>>({});
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';
  const scope = { companyScoped: true, companyId, isDeveloper };

  useEffect(() => {
    if (!companyId) return;
    captureEvent(AnalyticsEvents.EMPLOYEE_VIEWED, {
      company_id: companyId,
      module_name: 'employees',
      route_path: '/employees',
    });
  }, [companyId]);
  const { data: employees = [], isLoading } = useCollection<Employee>('employees', 'employees', scope);
  const { data: allUsers = [] } = useCollection<User>('employees-page-users', 'users', scope);

  const [employeesSupabase, setEmployeesSupabase] = useState<Employee[]>([]);
  const [loadingSupabase, setLoadingSupabase] = useState(false);
  const refetchSupabaseEmployees = useCallback(async () => {
    if (!companyId || !isEmployeesSupabase) return;
    setLoadingSupabase(true);
    try {
      const list = await listEmployees(companyId);
      setEmployeesSupabase(list);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[EmployeesPage] refetchSupabaseEmployees', {
          table: 'public.employees',
          companyId,
          total: list.length,
          byStatus: list.reduce<Record<string, number>>((acc, e) => {
            acc[e.status] = (acc[e.status] || 0) + 1;
            return acc;
          }, {}),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load employees';
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[EmployeesPage] refetchSupabaseEmployees error', { companyId, error: err });
      }
      setEmployeesSupabase([]);
      toast.error('Could not load employees', { description: message });
    } finally {
      setLoadingSupabase(false);
    }
  }, [companyId]);
  useEffect(() => {
    if (isEmployeesSupabase && companyId) {
      refetchSupabaseEmployees();
    }
  }, [isEmployeesSupabase, companyId, refetchSupabaseEmployees]);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<EmployeeRoleSelection>('none');
  const [editDepartment, setEditDepartment] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'on-leave' | 'inactive' | 'suspended' | 'archived'>('active');
  const [editSaving, setEditSaving] = useState(false);
  const [editPermissions, setEditPermissions] = useState<PermissionMap>(DEFAULT_PERMISSIONS);
  const [editPreset, setEditPreset] = useState<PermissionEditorPreset>('custom');
  // Supabase employees.permissions uses flat permission keys (module.action) from config/accessControl.
  const [editPermissionPreset, setEditPermissionPreset] = useState<EmployeeRoleKey>('custom');
  const [editPermissionsFlat, setEditPermissionsFlat] = useState<Record<string, boolean>>({});
  const { canWrite, isTrial, isExpired, daysRemaining } = useSubscriptionStatus();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const planAccess = useEffectivePlanAccess();
  const isProTier =
    planAccess.isDeveloper || planAccess.plan === 'enterprise' || planAccess.isOverride || planAccess.plan === 'pro';

  const openUpgrade = () => {
    openUpgradeModal({ checkoutPlan: 'pro' });
    setUpgradeOpen(true);
  };

  type EmployeeSection = 'active' | 'invited' | 'draft' | 'archived';
  const [section, setSection] = useState<EmployeeSection>('active');

  const [currentDraftEmployeeId, setCurrentDraftEmployeeId] = useState<string | null>(null);

  // Deactivate/delete confirmation
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [resendingEmployeeId, setResendingEmployeeId] = useState<string | null>(null);
  const handleDeactivateEmployee = async () => {
    if (!deactivateTarget || !companyId || !isEmployeesSupabase) return;
    setDeactivating(true);
    try {
      await setEmployeeStatus(deactivateTarget.id, 'archived');
      await logActivity({
        companyId,
        employeeId: deactivateTarget.id,
        action: 'Employee deactivated',
        module: 'employees',
        metadata: { updated_by: user?.id },
      });
      await refetchSupabaseEmployees();
      toast.success(`${getEmployeeName(deactivateTarget)} has been deactivated`);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Failed to deactivate employee';
      toast.error('Deactivate failed', { description: message });
    } finally {
      setDeactivating(false);
      setDeactivateTarget(null);
    }
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[EmployeesPage] auth', {
      clerkUserId: user?.id,
      activeCompanyId: companyId,
      provider: employeesProvider,
    });
  }

  const openEdit = (employee: Employee) => {
  const rawRole = employee.employeeRole ?? employee.role ?? null;
  const preset = roleToPreset(rawRole);
  const displayRole = presetToLegacyRole(preset);
  const employeeRole = ROLE_OPTIONS.some((o) => o.value === rawRole) ? rawRole : displayRole;
  setEditingEmployee(employee);
  setEditName(getEmployeeName(employee));
  setEditRole((employeeRole as EmployeeRoleSelection) || 'none');
  setEditDepartment(employee.department || getDepartmentFromRole(employeeRole as ManagedEmployeeRole | null));
  setEditContact(getEmployeePhone(employee));
  setEditStatus((employee.status as typeof editStatus) || 'active');
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Employee Edit] loaded employee row', {
      id: employee.id,
      fullName: employee.fullName,
      role: employee.role,
      employeeRole: employee.employeeRole,
      permission_preset: (employee as any).permission_preset ?? null,
      permissions: employee.permissions ?? null,
    });
  }
  if (isEmployeesSupabase) {
    const presetRaw = (employee as any).permission_preset ?? 'custom';
    const presetKey = (EMPLOYEE_ROLES.includes(presetRaw as EmployeeRoleKey) ? presetRaw : 'custom') as EmployeeRoleKey;
    setEditPermissionPreset(presetKey);
    const flat = normalizeFlatPermissions(employee.permissions);
    setEditPermissionsFlat(Object.keys(flat).length > 0 ? flat : getEmployeePresetPermissions(presetKey));
    setEditOpen(true);
    return;
  }

  let overrides = employee.permissions ?? getDefaultPermissions();
  const raw = employee.permissions as any;
  if (raw && typeof raw === 'object' && Object.keys(raw).some((k) => k.includes('.'))) {
    const expanded = expandFlatPermissions(raw as Record<string, boolean>);
    if (expanded) {
      overrides = expanded;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Employee Edit] initialized permissions source = employees.permissions', {
        employeeId: employee.id,
      });
    }
  } else if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Employee Edit] initialized permissions source = preset', {
      employeeId: employee.id,
    });
  }
  setEditPermissions(resolvePermissions(employeeRole as any, overrides));
  setEditPreset('custom');
  setEditOpen(true);
  };

  const resetAddForm = () => {
    setName('');
    setRole('none');
    setDepartment('');
    setContact('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setAddPermissions(DEFAULT_PERMISSIONS);
    setAddPreset('custom');
    setAddStep(1);
    setPermissionPreset('custom');
    setPermissionsFlat({});
  };

  const handleRoleChange = (value: string) => {
    const normalized = value === 'none' ? null : normalizeEmployeeRole(value);
    setRole((normalized ?? 'none') as EmployeeRoleSelection);
    setDepartment(getDepartmentFromRole(normalized));
    if (isEmployeesSupabase) {
      if (!normalized) {
        setPermissionPreset('custom');
        setPermissionsFlat({});
        return;
      }
      const asRoleKey = EMPLOYEE_ROLES.includes(normalized as EmployeeRoleKey)
        ? (normalized as EmployeeRoleKey)
        : 'viewer';
      setPermissionPreset(asRoleKey);
      setPermissionsFlat(getEmployeePresetPermissions(asRoleKey));
    } else {
      setAddPermissions(resolvePermissions(normalized, getDefaultPermissions()));
      setAddPreset('custom');
    }
  };

  const handleEditRoleChange = (value: string) => {
    const normalized = value === 'none' ? null : normalizeEmployeeRole(value);
    setEditRole((normalized ?? 'none') as EmployeeRoleSelection);
    setEditDepartment(getDepartmentFromRole(normalized));
    if (isEmployeesSupabase) {
      if (!normalized) {
        setEditPermissionPreset('custom');
        setEditPermissionsFlat({});
        return;
      }
      const asRoleKey = EMPLOYEE_ROLES.includes(normalized as EmployeeRoleKey)
        ? (normalized as EmployeeRoleKey)
        : 'viewer';
      setEditPermissionPreset(asRoleKey);
      setEditPermissionsFlat(getEmployeePresetPermissions(asRoleKey));
      return;
    }
    setEditPermissions(resolvePermissions(normalized, getDefaultPermissions()));
    setEditPreset('custom');
  };

  const handleAddPresetChange = (next: PermissionEditorPreset) => {
    setAddPreset(next);
    if (next === 'custom') return;
    const selectedRole = role === 'none' ? null : role;
    setAddPermissions(resolvePermissions(selectedRole, getPresetPermissions(next)));
  };

  const handleEditPresetChange = (next: PermissionEditorPreset) => {
    setEditPreset(next);
    if (next === 'custom') return;
    const selectedRole = editRole === 'none' ? null : editRole;
    setEditPermissions(resolvePermissions(selectedRole, getPresetPermissions(next)));
  };

  const handleAddPermissionChange = (next: PermissionMap) => {
    const selectedRole = role === 'none' ? null : role;
    setAddPermissions(resolvePermissions(selectedRole, next));
    if (addPreset !== 'custom') setAddPreset('custom');
  };

  const handleEditPermissionChange = (next: PermissionMap) => {
    const selectedRole = editRole === 'none' ? null : editRole;
    setEditPermissions(resolvePermissions(selectedRole, next));
    if (editPreset !== 'custom') setEditPreset('custom');
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    if (!canEditEmployees) {
      toast.error('Permission denied', { description: 'You cannot edit employee records.' });
      return;
    }
    if (!canWrite) {
      setUpgradeOpen(true);
      return;
    }
    setEditSaving(true);
    try {
      if (isEmployeesSupabase) {
        const selectedRole = resolveRoleForSave(editRole, editingEmployee);
        const resolvedDepartment = editDepartment || getDepartmentFromRole(normalizeEmployeeRole(selectedRole));

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[Employee Edit] save payload', {
            employeeId: editingEmployee.id,
            full_name: editName,
            role: selectedRole,
            department: resolvedDepartment,
            phone: editContact || undefined,
            status: editStatus,
            permission_preset: editPermissionPreset,
            permissions: editPermissionsFlat,
          });
        }

        await updateEmployeeSupabase(editingEmployee.id, {
          full_name: editName,
          role: selectedRole,
          department: resolvedDepartment,
          phone: editContact || undefined,
          status: editStatus,
          permissions: editPermissionsFlat as any,
          permission_preset: editPermissionPreset,
        });
        if (companyId) {
          await logActivity({
            companyId,
            employeeId: editingEmployee.id,
            action: 'Employee updated (role, permissions, or status)',
            module: 'employees',
            metadata: { updated_by: user?.id, role: selectedRole, status: editStatus },
          });
        }
        await refetchSupabaseEmployees();
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[Employee Edit] save response', {
            employeeId: editingEmployee.id,
            ok: true,
          });
        }
        toast.success('Employee updated');
        setEditOpen(false);
        setEditingEmployee(null);
        setEditSaving(false);
        // If the edited employee is the current user, refresh auth so sidebar/perms/landing reflect immediately.
        const editedIsCurrentUser = editingEmployee.authUserId === user?.id || editingEmployee.id === user?.id;
        if (editedIsCurrentUser && refreshAuthState) {
          const result = await refreshAuthState();
          navigate(result?.landingPage ?? '/staff', { replace: true });
        }
        return;
      }

      const selectedRole = resolveRoleForSave(editRole, editingEmployee);
      const normalizedSelectedRole = normalizeEmployeeRole(selectedRole);
      const resolvedPermissions = resolvePermissions(selectedRole, editPermissions);
      const resolvedDepartment = editDepartment || getDepartmentFromRole(normalizedSelectedRole);

      await updateDoc(doc(db, 'employees', editingEmployee.id), {
        fullName: editName,
        name: editName,
        role: selectedRole,
        employeeRole: selectedRole,
        department: resolvedDepartment,
        phone: editContact || null,
        contact: editContact || null,
        status: editStatus,
        permissions: resolvedPermissions,
      });

      const authUserId = editingEmployee.authUserId || editingEmployee.id;
      if (authUserId) {
        await setDoc(doc(db, 'users', authUserId), {
          permissions: resolvedPermissions,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-page-users'] });
      toast.success('Employee updated');
      setEditOpen(false);
      setEditingEmployee(null);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Failed to update employee';
      toast.error('Update failed', { description: message });
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmployeesSupabase && addStep !== 2) {
      return;
    }
    if (!canCreateEmployees) {
      toast.error('Permission denied', { description: 'You cannot create employees.' });
      return;
    }
    if (!canWrite) {
      openUpgrade();
      return;
    }
    setSaving(true);
    try {
      const effectiveCompanyId = user?.companyId ?? null;
      if (!effectiveCompanyId && user?.role !== 'developer') {
        toast.error('Cannot add employee', {
          description: 'Your account is not linked to a company. Please contact support or sign in with a company admin account.',
        });
        return;
      }

      // Basic plan enforcement: cap employees unless Pro.
      const countedEmployees = companyEmployees.filter((emp) => emp.status !== 'archived').length;
      if (!isProTier && countedEmployees >= BASIC_LIMITS.maxEmployees) {
        toast.error('Employee limit reached', {
          description: `Basic allows up to ${BASIC_LIMITS.maxEmployees} employees. Upgrade to Pro for unlimited employees.`,
        });
        openUpgrade();
        return;
      }

      if (isEmployeesSupabase) {
        const selectedRole = role === 'none' ? null : role;
        const effectivePermissionPreset: EmployeeRoleKey =
          permissionPreset !== 'custom'
            ? permissionPreset
            : selectedRole && EMPLOYEE_ROLES.includes(selectedRole as EmployeeRoleKey)
            ? (selectedRole as EmployeeRoleKey)
            : 'viewer';
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[EmployeesPage] inviteEmployee payload', {
            companyId: effectiveCompanyId,
            fullName: name.trim() || email.trim(),
            email: email.trim().toLowerCase(),
            phone: contact.trim() || undefined,
            role: selectedRole ?? undefined,
            department: department.trim() || undefined,
            permissionPreset: effectivePermissionPreset,
            permissionOverrides: permissionsFlat,
            actorEmployeeId: employeeProfile?.id ?? undefined,
          });
        }
        const result = await inviteEmployee({
          companyId: effectiveCompanyId!,
          fullName: name.trim() || email.trim(),
          email: email.trim().toLowerCase(),
          phone: contact.trim() || undefined,
          role: selectedRole ?? undefined,
          department: department.trim() || undefined,
          permissionPreset: effectivePermissionPreset,
          permissionOverrides: permissionsFlat,
          assignedProjectIds: [],
          actorEmployeeId: employeeProfile?.id ?? undefined,
        });
        await refetchSupabaseEmployees();
        toast.success(result?.message ?? 'Employee invited successfully. An invitation email has been sent.');
        setAddOpen(false);
        resetAddForm();
        setSaving(false);
        setSection('invited');
        return;
      }

      const selectedRole = role === 'none' ? null : role;
      const appRole = mapEmployeeRoleToAppRole(selectedRole);
      const resolvedPermissions = resolvePermissions(selectedRole, addPermissions);
      const resolvedDepartment = department || getDepartmentFromRole(selectedRole);

      const credential = await createUserWithEmailAndPassword(authEmployeeCreate, email, password);
      const uid = credential.user.uid;

      await setDoc(doc(db, 'employees', uid), {
        fullName: name,
        name,
        email,
        phone: contact || null,
        contact: contact || null,
        role: selectedRole,
        employeeRole: selectedRole,
        status: 'active',
        department: resolvedDepartment,
        companyId,
        permissions: resolvedPermissions,
        createdBy: user?.id ?? null,
        createdAt: serverTimestamp(),
        joinDate: serverTimestamp(),
        authUserId: uid,
      }, { merge: true });

      await setDoc(doc(db, 'users', uid), {
        email,
        name,
        role: appRole,
        employeeRole: selectedRole,
        permissions: resolvedPermissions,
        companyId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-page-users'] });
      toast.success('Employee added successfully');
      setAddOpen(false);
      resetAddForm();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message ?? '';
      const detail = (err as { detail?: string })?.detail;
      const details = (err as { details?: unknown })?.details;
      const description =
        detail ??
        (typeof details === 'string' ? details : details && typeof details === 'object' && 'message' in details ? String((details as { message: unknown }).message) : null) ??
        message;
      if (isEmployeesSupabase) {
        if (code === 'ALREADY_INVITED') {
          toast.error('Invitation already sent', { description: description || 'An invitation has already been sent to this email.' });
          return;
        }
        if (code === 'EMPLOYEE_ALREADY_ACTIVE') {
          toast.error('Employee already exists', { description: description || 'This email is already an active user. Use a different email or edit the existing employee.' });
          return;
        }
        if (code === 'AUTH_FAILED') {
          // Surface the real auth error for easier debugging
          toast.error('Authentication failed', { 
            description: description || 'Could not verify your session. The invite service may be misconfigured. Check that CLERK_SECRET_KEY matches your Clerk instance.',
            duration: 10000,
          });
          return;
        }
        if (code === 'CLERK_INVITE_FAILED') {
          toast.error('Invitation failed', { description: description || 'Could not send invitation email. Check Clerk configuration.' });
          return;
        }
        toast.error('Invite failed', { description: description || 'Could not invite employee. Please try again.' });
        return;
      }
      if (code === 'auth/email-already-in-use') {
        toast.error('Email already in use', {
          description: 'This email is already registered. Use a different email or invite the existing user.',
        });
        return;
      }
      if (code?.startsWith('auth/')) {
        toast.error('Authentication error', {
          description: message || 'Could not create account. Please try again.',
        });
        return;
      }
      const isPermissionDenied =
        message?.includes('permission') || message?.includes('Permission') || code === 'permission-denied';
      toast.error(isPermissionDenied ? 'Permission denied' : 'Failed to add employee', {
        description: isPermissionDenied
          ? 'Your account cannot add employees for this company. Ensure you are signed in as a company admin with a linked company.'
          : message || 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Show only this company's employees (developers see all)
  const companyEmployees = useMemo(() => {
    if (isEmployeesSupabase) {
      if (!companyId && !isDeveloper) return [];
      return employeesSupabase;
    }
    if (!user?.companyId && user?.role !== 'developer') return [];
    if (user?.role === 'developer') return employees;
    return employees.filter((e) => e.companyId === user?.companyId);
  }, [isEmployeesSupabase, employeesSupabase, employees, user?.companyId, user?.role, companyId, isDeveloper]);

  if (import.meta.env.DEV) {
    const all = isEmployeesSupabase ? employeesSupabase : employees;
    // eslint-disable-next-line no-console
    console.log('[EmployeesPage] companyEmployees snapshot', {
      provider: employeesProvider,
      total: companyEmployees.length,
      rawTotal: all.length,
      byStatus: companyEmployees.reduce<Record<string, number>>((acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1;
        return acc;
      }, {}),
    });
  }

  const activeEmployees = useMemo(
    () => companyEmployees.filter((e) => e.status === 'active'),
    [companyEmployees],
  );

  const invitedEmployees = useMemo(
    () => companyEmployees.filter((e) => e.status === 'invited'),
    [companyEmployees],
  );

  const draftEmployees = useMemo(
    () => companyEmployees.filter((e) => e.status === 'draft'),
    [companyEmployees],
  );

  const archivedEmployees = useMemo(
    () => companyEmployees.filter((e) => e.status === 'archived'),
    [companyEmployees],
  );

  const authUserIdToEmail = useMemo(() => {
    if (isEmployeesSupabase) return new Map<string, string>();
    const map = new Map<string, string>();
    (allUsers as User[]).forEach((u) => {
      if (u.email) map.set(u.id, u.email);
    });
    return map;
  }, [allUsers, isEmployeesSupabase]);

  const getEmployeeEmail = (emp: Employee) => {
    if (emp.email) return emp.email;
    const authId = emp.authUserId || emp.id;
    return authUserIdToEmail.get(authId);
  };

  const filteredEmployees = useMemo(
    () => {
      let sectionEmployees: Employee[];
      switch (section) {
        case 'active':
          sectionEmployees = activeEmployees;
          break;
        case 'invited':
          sectionEmployees = invitedEmployees;
          break;
        case 'draft':
          sectionEmployees = draftEmployees;
          break;
        case 'archived':
          sectionEmployees = archivedEmployees;
          break;
        default:
          sectionEmployees = activeEmployees;
      }

      return sectionEmployees.filter((e) => {
        const employeeName = getEmployeeName(e).toLowerCase();
        const employeePhone = getEmployeePhone(e).toLowerCase();
        const employeeEmail = (getEmployeeEmail(e) || '').toLowerCase();
        const employeeRole = getEmployeeRole(e);
        const matchesSearch =
          !search ||
          employeeName.includes(search.toLowerCase()) ||
          employeePhone.includes(search.toLowerCase()) ||
          employeeEmail.includes(search.toLowerCase());
        const matchesRole =
          roleFilter === 'all'
            ? true
            : roleFilter === 'none'
            ? !employeeRole
            : employeeRole === roleFilter;
        return matchesSearch && matchesRole;
      });
    },
    [section, activeEmployees, invitedEmployees, draftEmployees, archivedEmployees, search, roleFilter, authUserIdToEmail],
  );

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[EmployeesPage] filteredEmployees', {
      section,
      count: filteredEmployees.length,
      byStatus: filteredEmployees.reduce<Record<string, number>>((acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1;
        return acc;
      }, {}),
    });
  }

  const hasMeaningfulAddFormData = () => {
    return (
      name.trim() !== '' ||
      email.trim() !== '' ||
      contact.trim() !== '' ||
      department.trim() !== '' ||
      role !== 'none'
    );
  };

  const handleAddDialogOpenChange = async (open: boolean) => {
    if (open) {
      setCurrentDraftEmployeeId(null);
      setAddOpen(true);
      return;
    }

    setAddOpen(false);

    if (!isEmployeesSupabase || !companyId) {
      resetAddForm();
      return;
    }

    // If there is no meaningful data, do not create a draft.
    if (!hasMeaningfulAddFormData()) {
      resetAddForm();
      setCurrentDraftEmployeeId(null);
      return;
    }

    try {
      await saveEmployeeDraft({
        id: currentDraftEmployeeId || undefined,
        companyId,
        fullName: name.trim() || email.trim(),
        email: email.trim().toLowerCase() || undefined,
        phone: contact.trim() || undefined,
        role: role === 'none' ? null : role,
        department: department.trim() || undefined,
        permissionPreset,
        permissions: (() => {
          const base =
            permissionPreset === 'custom'
              ? {}
              : getEmployeePresetPermissions(permissionPreset);
          return { ...base, ...permissionsFlat };
        })() as unknown as PermissionMap,
      });
      toast.success('Draft saved');
      await refetchSupabaseEmployees();
      setSection('draft');
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Failed to save draft';
      toast.error('Draft not saved', { description: message });
    } finally {
      resetAddForm();
      setCurrentDraftEmployeeId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your team members
          </p>
        </div>
        {canCreateEmployees && (
        <Dialog open={addOpen} onOpenChange={handleAddDialogOpenChange}>
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary">
              <Plus className="h-4 w-4" />
              Add Employee
            </button>
          </DialogTrigger>
          {isEmployeesSupabase ? (
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{addStep === 1 ? 'Add Employee' : 'Access & Permissions'}</DialogTitle>
              </DialogHeader>
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium',
                        addStep === 1 ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border',
                      )}
                    >
                      1
                    </div>
                    <span className={cn('text-xs font-medium', addStep === 1 ? 'text-foreground' : 'text-muted-foreground')}>
                      Employee Info
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium',
                        addStep === 2 ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border',
                      )}
                    >
                      2
                    </div>
                    <span className={cn('text-xs font-medium', addStep === 2 ? 'text-foreground' : 'text-muted-foreground')}>
                      Access & Permissions
                    </span>
                  </div>
                </div>
              </div>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                {addStep === 1 && (
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Full name</label>
                      <input
                        className="fv-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Role (optional)</label>
                        <Select value={role} onValueChange={handleRoleChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No role (custom permissions)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No role (custom permissions)</SelectItem>
                            {ROLE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">Department</label>
                        <input
                          className="fv-input"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          placeholder="General"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Email (for login)</label>
                      <input
                        type="email"
                        className="fv-input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="employee@farmvault.com"
                      />
                      <span className="block text-xs text-muted-foreground">
                        An invite link will be sent to this email. The employee will set their password when they accept.
                      </span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Phone / Contact</label>
                      <input
                        className="fv-input"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder="+254 700 000 000"
                      />
                    </div>
                  </>
                )}
                {addStep === 2 && (
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Permission preset</label>
                      <Select
                        value={permissionPreset}
                        onValueChange={(val) => {
                          const next = val as EmployeeRoleKey;
                          setPermissionPreset(next);
                          if (next === 'custom') return;
                          setPermissionsFlat(getEmployeePresetPermissions(next));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Custom" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom</SelectItem>
                          {EMPLOYEE_ROLES.filter((r) => r !== 'custom').map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_PRESET_LABELS[roleToPreset(r)]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3">
                      <Accordion type="multiple" className="w-full">
                        {PERMISSION_GROUPS.map((group) => {
                          const viewKey = `${group.module}.view`;
                          const canView = Boolean(permissionsFlat[viewKey]);
                          return (
                            <AccordionItem key={group.module} value={group.module} className="border-border/50">
                              <div className="flex items-center gap-3">
                                <AccordionTrigger className="py-3 hover:no-underline">
                                  <span className="text-sm font-medium text-foreground">{group.label}</span>
                                </AccordionTrigger>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="text-xs text-muted-foreground">View</span>
                                  <Switch
                                    checked={canView}
                                    onCheckedChange={(checked) =>
                                      setPermissionsFlat((prev) => ({ ...prev, [viewKey]: Boolean(checked) }))
                                    }
                                    aria-label={`${group.label} view permission`}
                                  />
                                </div>
                              </div>
                              <AccordionContent className="pt-1 pb-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {group.keys
                                    .filter((k) => k !== (viewKey as PermissionKey))
                                    .map((key) => {
                                      const checked = Boolean(permissionsFlat[key]);
                                      return (
                                        <label
                                          key={key}
                                          className="flex items-center gap-2 rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-xs sm:text-sm"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={(next) =>
                                              setPermissionsFlat((prev) => ({ ...prev, [key]: Boolean(next) }))
                                            }
                                          />
                                          <span className="text-foreground">{labelForPermissionKey(key)}</span>
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
                  </>
                )}
                <DialogFooter>
                  {addStep === 2 && (
                    <button
                      type="button"
                      className="fv-btn fv-btn--ghost mr-auto"
                      onClick={() => setAddStep(1)}
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary"
                    onClick={() => {
                      setAddOpen(false);
                      resetAddForm();
                      setCurrentDraftEmployeeId(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="fv-btn fv-btn--ghost"
                    onClick={async () => {
                      if (!companyId) {
                        toast.error('No company selected', {
                          description: 'Cannot save draft without an active company.',
                        });
                        return;
                      }
                      if (!hasMeaningfulAddFormData()) {
                        toast.error('Nothing to save', {
                          description: 'Add some details before saving a draft.',
                        });
                        return;
                      }
                      setSaving(true);
                      try {
                        await saveEmployeeDraft({
                          id: currentDraftEmployeeId || undefined,
                          companyId,
                          fullName: name.trim() || email.trim(),
                          email: email.trim().toLowerCase() || undefined,
                          phone: contact.trim() || undefined,
                          role:
                            role === 'none' || !EMPLOYEE_ROLES.includes(role as EmployeeRoleKey)
                              ? null
                              : (role as EmployeeRoleKey),
                          department: department.trim() || undefined,
                          permissionPreset,
                          permissions: (() => {
                            const base =
                              permissionPreset === 'custom'
                                ? {}
                                : getEmployeePresetPermissions(permissionPreset);
                            return { ...base, ...permissionsFlat };
                          })() as unknown as PermissionMap,
                        });
                        await refetchSupabaseEmployees();
                        toast.success('Draft saved');
                        setAddOpen(false);
                        resetAddForm();
                        setCurrentDraftEmployeeId(null);
                      } catch (err: unknown) {
                        const message = (err as { message?: string })?.message ?? 'Failed to save draft';
                        toast.error('Draft not saved', { description: message });
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Save Draft
                  </button>
                  {addStep === 1 ? (
                    <button
                      type="button"
                      disabled={saving}
                      className="fv-btn fv-btn--primary"
                      onClick={() => {
                        if (!email.trim()) {
                          toast.error('Email required', {
                            description: 'Add an email so we can send the invite.',
                          });
                          return;
                        }
                        setAddStep(2);
                      }}
                    >
                      Continue
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={saving}
                      className="fv-btn fv-btn--primary"
                    >
                      {saving ? 'Sending…' : 'Send Invite'}
                    </button>
                  )}
                </DialogFooter>
              </form>
            </DialogContent>
          ) : (
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Employee</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Full name</label>
                  <input
                    className="fv-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Role (optional)</label>
                    <Select value={role} onValueChange={handleRoleChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="No role (custom permissions)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No role (custom permissions)</SelectItem>
                        {ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Department</label>
                    <input
                      className="fv-input"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="General"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Email (for login)</label>
                  <input
                    type="email"
                    className="fv-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="employee@farmvault.com"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    Initial password
                    <span className="block text-xs text-muted-foreground">
                      Set a password for this employee to use when logging in. It won&apos;t be visible after saving, so share it securely now.
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="fv-input pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Phone / Contact</label>
                  <input
                    className="fv-input"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="+254 700 000 000"
                  />
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <PermissionEditor
                    value={addPermissions}
                    onChange={handleAddPermissionChange}
                    preset={addPreset}
                    onPresetChange={handleAddPresetChange}
                    lockedRole={role === 'none' ? null : role}
                  />
                </div>
                <DialogFooter>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="fv-btn fv-btn--primary"
                  >
                    {saving ? 'Saving…' : 'Save Employee'}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          )}
        </Dialog>
        )}

        {/* View details modal */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Employee details</DialogTitle>
            </DialogHeader>
            {selectedEmployee && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-lg">
                    {getEmployeeName(selectedEmployee).split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{getEmployeeName(selectedEmployee)}</p>
                    <p className="text-sm text-muted-foreground">{getRoleLabel(getEmployeeRole(selectedEmployee))}</p>
                  </div>
                </div>
                <dl className="grid gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Department</dt>
                    <dd className="font-medium">{selectedEmployee.department || 'General'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium">{getEmployeeEmail(selectedEmployee) || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd className="font-medium">{getEmployeePhone(selectedEmployee) || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <span className={cn('fv-badge capitalize', getStatusBadge(selectedEmployee.status))}>
                        {selectedEmployee.status.replace('-', ' ')}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Joined</dt>
                    <dd className="font-medium">{formatDate(selectedEmployee.joinDate, { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
                  </div>
                </dl>
                <DialogFooter>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary"
                    onClick={() => setDetailsOpen(false)}
                  >
                    Close
                  </button>
                  {canEditEmployees && (
                  <button
                    type="button"
                    className="fv-btn fv-btn--primary"
                    onClick={() => {
                      setDetailsOpen(false);
                      openEdit(selectedEmployee);
                    }}
                  >
                    Edit employee
                  </button>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit employee modal */}
        <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingEmployee(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit employee</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Full name</label>
                <input
                  className="fv-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Role (optional)</label>
                <Select
                  value={editRole}
                  onValueChange={handleEditRoleChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No role (custom permissions)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No role (custom permissions)</SelectItem>
                    {ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Department</label>
                <input
                  className="fv-input"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Contact</label>
                <input
                  className="fv-input"
                  value={editContact}
                  onChange={(e) => setEditContact(e.target.value)}
                  placeholder="+254 700 000 000"
                />
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                {isEmployeesSupabase ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Permission preset</label>
                      <Select
                        value={editPermissionPreset}
                        onValueChange={(val) => {
                          const next = val as EmployeeRoleKey;
                          setEditPermissionPreset(next);
                          if (next === 'custom') return;
                          setEditPermissionsFlat(getEmployeePresetPermissions(next));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Custom" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom</SelectItem>
                          {EMPLOYEE_ROLES.filter((r) => r !== 'custom').map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_PRESET_LABELS[roleToPreset(r)]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3">
                      <Accordion type="multiple" className="w-full">
                        {PERMISSION_GROUPS.map((group) => {
                          const viewKey = `${group.module}.view`;
                          const canView = Boolean(editPermissionsFlat[viewKey]);
                          return (
                            <AccordionItem key={group.module} value={group.module} className="border-border/50">
                              <div className="flex items-center gap-3">
                                <AccordionTrigger className="py-3 hover:no-underline">
                                  <span className="text-sm font-medium text-foreground">{group.label}</span>
                                </AccordionTrigger>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="text-xs text-muted-foreground">View</span>
                                  <Switch
                                    checked={canView}
                                    onCheckedChange={(checked) =>
                                      setEditPermissionsFlat((prev) => ({ ...prev, [viewKey]: Boolean(checked) }))
                                    }
                                    aria-label={`${group.label} view permission`}
                                  />
                                </div>
                              </div>
                              <AccordionContent className="pt-1 pb-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {group.keys
                                    .filter((k) => k !== (viewKey as PermissionKey))
                                    .map((key) => {
                                      const checked = Boolean(editPermissionsFlat[key]);
                                      return (
                                        <label
                                          key={key}
                                          className="flex items-center gap-2 rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-xs sm:text-sm"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={(next) =>
                                              setEditPermissionsFlat((prev) => ({ ...prev, [key]: Boolean(next) }))
                                            }
                                          />
                                          <span className="text-foreground">{labelForPermissionKey(key)}</span>
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
                  </div>
                ) : (
                  <PermissionEditor
                    value={editPermissions}
                    onChange={handleEditPermissionChange}
                    preset={editPreset}
                    onPresetChange={handleEditPresetChange}
                    lockedRole={editRole === 'none' ? null : editRole}
                  />
                )}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as typeof editStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on-leave">On leave</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={() => { setEditOpen(false); setEditingEmployee(null); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="fv-btn fv-btn--primary"
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Total Employees"
          value={companyEmployees.length}
          layout="vertical"
        />
        <SimpleStatCard
          title="Active"
          value={activeEmployees.length}
          valueVariant="success"
          layout="vertical"
        />
        <SimpleStatCard
          title="Pending Invites"
          value={invitedEmployees.length}
          valueVariant="warning"
          layout="vertical"
        />
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => setSection('active')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm border transition-colors',
            section === 'active'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:text-foreground',
          )}
        >
          Active Employees ({activeEmployees.length})
        </button>
        <button
          type="button"
          onClick={() => setSection('invited')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm border transition-colors',
            section === 'invited'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:text-foreground',
          )}
        >
          Sent Invites ({invitedEmployees.length})
        </button>
        <button
          type="button"
          onClick={() => setSection('draft')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm border transition-colors',
            section === 'draft'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:text-foreground',
          )}
        >
          Drafts ({draftEmployees.length})
        </button>
        <button
          type="button"
          onClick={() => setSection('archived')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm border transition-colors',
            section === 'archived'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:text-foreground',
          )}
        >
          Archived ({archivedEmployees.length})
        </button>
      </div>

      {/* Filters (applied within selected section) */}
      <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search employees..."
            className="fv-input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="none">No role (custom)</SelectItem>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Employees Table */}
      <div className="fv-card">
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              {section === 'active' && (
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Contact / Email</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              )}
              {section === 'invited' && (
                <tr>
                  <th>Invitee</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Last sent</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              )}
              {section === 'draft' && (
                <tr>
                  <th>Draft</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Last Saved</th>
                  <th></th>
                </tr>
              )}
              {section === 'archived' && (
                <tr>
                  <th>Employee</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Archived At</th>
                  <th></th>
                </tr>
              )}
            </thead>
            <tbody>
              {(isEmployeesSupabase ? loadingSupabase : isLoading) && (
                <tr>
                  <td colSpan={6} className="text-sm text-muted-foreground">
                    Loading employees…
                  </td>
                </tr>
              )}
              {filteredEmployees.map((employee) =>
                section === 'active' ? (
                  <tr key={employee.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          avatarUrl={employee.avatarUrl}
                          name={getEmployeeName(employee)}
                          size="md"
                          className="h-10 w-10 bg-primary/10 text-primary"
                        />
                        <div>
                          <span className="font-medium text-foreground">{getEmployeeName(employee)}</span>
                          <p className="text-xs text-muted-foreground">
                            Joined {formatDate(employee.joinDate, { month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>{getRoleLabel(getEmployeeRole(employee))}</td>
                    <td>{employee.department || 'General'}</td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {getEmployeeEmail(employee) && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{getEmployeeEmail(employee)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{getEmployeePhone(employee) || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={cn('fv-badge capitalize', getStatusBadge(employee.status))}>
                        {employee.status.replace('-', ' ')}
                      </span>
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => navigate(`/employees/${employee.id}`)}
                          >
                            <UserIcon className="h-3.5 w-3.5 mr-2" />
                            View profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setDetailsOpen(true);
                            }}
                          >
                            View details
                          </DropdownMenuItem>
                          {canEditEmployees && (
                            <>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => openEdit(employee)}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => setDeactivateTarget(employee)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Deactivate
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ) : section === 'invited' ? (
                  <tr key={employee.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                          {getEmployeeName(employee).split(' ').map((n) => n[0]).join('')}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">{getEmployeeName(employee)}</span>
                        </div>
                      </div>
                    </td>
                    <td>{getEmployeeEmail(employee) || '—'}</td>
                    <td>{getRoleLabel(getEmployeeRole(employee))}</td>
                    <td>{employee.department || 'General'}</td>
                  <td>
                    {employee.inviteLastSentAt || employee.inviteSentAt || employee.createdAt
                      ? formatDate(employee.inviteLastSentAt ?? employee.inviteSentAt ?? employee.createdAt, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                    {typeof employee.inviteResendCount === 'number' && employee.inviteResendCount > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (resent {employee.inviteResendCount}x)
                      </span>
                    )}
                  </td>
                    <td>
                      <span className={cn('fv-badge capitalize', getStatusBadge(employee.status))}>
                        {employee.status.replace('-', ' ')}
                      </span>
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEditEmployees && (
                            <>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                disabled={resendingEmployeeId === employee.id}
                                onClick={async () => {
                                  if (!companyId || !isEmployeesSupabase) return;
                                  const email = (getEmployeeEmail(employee) || '').toLowerCase();
                                  if (!email) {
                                    toast.error('Cannot resend invite', {
                                      description: 'Invite has no email address.',
                                    });
                                    return;
                                  }
                                  if (employee.status !== 'invited') {
                                    toast.error('Cannot resend invite', {
                                      description: 'Only pending invites can be resent.',
                                    });
                                    return;
                                  }
                                  try {
                                    setResendingEmployeeId(employee.id);
                                    if (import.meta.env.DEV) {
                                      // eslint-disable-next-line no-console
                                      console.log('[EmployeesPage] resendEmployeeInvite', {
                                        companyId,
                                        email,
                                        employeeId: employee.id,
                                      });
                                    }
                                    await resendEmployeeInvite(companyId, employee.id);
                                    await logActivity({
                                      companyId,
                                      employeeId: employee.id,
                                      action: 'Invite resent',
                                      module: 'employees',
                                      metadata: { updated_by: user?.id, email },
                                    });
                                    await refetchSupabaseEmployees();
                                    toast.success('Invite resent');
                                  } catch (err: unknown) {
                                    const message =
                                      (err as { message?: string })?.message ?? 'Failed to resend invite';
                                    toast.error('Resend failed', { description: message });
                                  } finally {
                                    setResendingEmployeeId((current) =>
                                      current === employee.id ? null : current,
                                    );
                                  }
                                }}
                              >
                                Resend invite
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={async () => {
                                  if (!companyId || !isEmployeesSupabase) return;
                                  const email = (getEmployeeEmail(employee) || '').toLowerCase();
                                  if (!email) {
                                    toast.error('Cannot revoke invite', { description: 'Invite has no email address.' });
                                    return;
                                  }
                                  try {
                                    if (import.meta.env.DEV) {
                                      // eslint-disable-next-line no-console
                                      console.log('[EmployeesPage] revokeEmployeeInvite', {
                                        companyId,
                                        email,
                                        employeeId: employee.id,
                                      });
                                    }
                                    await revokeEmployeeInvite(companyId, email);
                                    await logActivity({
                                      companyId,
                                      employeeId: employee.id,
                                      action: 'Invite revoked',
                                      module: 'employees',
                                      metadata: { updated_by: user?.id, email },
                                    });
                                    await refetchSupabaseEmployees();
                                    toast.success('Invite revoked');
                                  } catch (err: unknown) {
                                    const message = (err as { message?: string })?.message ?? 'Failed to revoke invite';
                                    toast.error('Revoke failed', { description: message });
                                  }
                                }}
                              >
                                Revoke invite
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={async () => {
                                  if (!companyId || !isEmployeesSupabase) return;
                                  try {
                                    await setEmployeeStatus(employee.id, 'archived');
                                    await logActivity({
                                      companyId,
                                      employeeId: employee.id,
                                      action: 'Invite archived',
                                      module: 'employees',
                                      metadata: { updated_by: user?.id },
                                    });
                                    await refetchSupabaseEmployees();
                                    toast.success('Invite archived');
                                  } catch (err: unknown) {
                                    const message = (err as { message?: string })?.message ?? 'Failed to archive invite';
                                    toast.error('Archive failed', { description: message });
                                  }
                                }}
                              >
                                Archive
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ) : section === 'draft' ? (
                  <tr key={employee.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                          {getEmployeeName(employee).split(' ').map((n) => n[0]).join('')}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">{getEmployeeName(employee)}</span>
                        </div>
                      </div>
                    </td>
                    <td>{getEmployeeEmail(employee) || '—'}</td>
                    <td>{getRoleLabel(getEmployeeRole(employee))}</td>
                    <td>{employee.department || 'General'}</td>
                    <td>
                      {employee.createdAt
                        ? formatDate(employee.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => {
                              // Continue editing: open Add modal prefilled from this draft.
                              setCurrentDraftEmployeeId(employee.id);
                              setName(getEmployeeName(employee));
                              setDepartment(employee.department || '');
                              setContact(getEmployeePhone(employee));
                              setEmail(getEmployeeEmail(employee) || '');
                              const draftRole = getEmployeeRole(employee);
                              setRole((draftRole ?? 'none') as EmployeeRoleSelection);
                              setAddPermissions(resolvePermissions(draftRole, employee.permissions ?? getDefaultPermissions()));
                              setAddPreset('custom');
                              setAddOpen(true);
                            }}
                          >
                            Continue editing
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={async () => {
                              if (!companyId || !isEmployeesSupabase) return;
                              try {
                                const selectedRole = getEmployeeRole(employee);
                                const permissionPreset = (selectedRole ?? 'viewer') as string;
                                await inviteEmployee({
                                  companyId,
                                  fullName: getEmployeeName(employee),
                                  email: (getEmployeeEmail(employee) || '').toLowerCase(),
                                  phone: getEmployeePhone(employee) || undefined,
                                  role: selectedRole ?? undefined,
                                  department: employee.department || undefined,
                                  permissionPreset,
                                  permissionOverrides: employee.permissions ?? null,
                                  assignedProjectIds: [],
                                  actorEmployeeId: employeeProfile?.id ?? undefined,
                                });
                                await refetchSupabaseEmployees();
                                toast.success('Invite sent');
                              } catch (err: unknown) {
                                const message = (err as { message?: string })?.message ?? 'Failed to send invite';
                                toast.error('Invite failed', { description: message });
                              }
                            }}
                          >
                            Send invite
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-red-600"
                            onClick={async () => {
                              if (!isEmployeesSupabase) return;
                              try {
                                await deleteEmployeeSupabase(employee.id);
                                await refetchSupabaseEmployees();
                                toast.success('Draft deleted');
                              } catch (err: unknown) {
                                const message = (err as { message?: string })?.message ?? 'Failed to delete draft';
                                toast.error('Delete failed', { description: message });
                              }
                            }}
                          >
                            Delete draft
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={async () => {
                              if (!companyId || !isEmployeesSupabase) return;
                              try {
                                await setEmployeeStatus(employee.id, 'archived');
                                await logActivity({
                                  companyId,
                                  employeeId: employee.id,
                                  action: 'Draft archived',
                                  module: 'employees',
                                  metadata: { updated_by: user?.id },
                                });
                                await refetchSupabaseEmployees();
                                toast.success('Draft archived');
                              } catch (err: unknown) {
                                const message = (err as { message?: string })?.message ?? 'Failed to archive draft';
                                toast.error('Archive failed', { description: message });
                              }
                            }}
                          >
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ) : (
                  // archived
                  <tr key={employee.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                          {getEmployeeName(employee).split(' ').map((n) => n[0]).join('')}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">{getEmployeeName(employee)}</span>
                        </div>
                      </div>
                    </td>
                    <td>{getEmployeeEmail(employee) || '—'}</td>
                    <td>{getRoleLabel(getEmployeeRole(employee))}</td>
                    <td>{employee.department || 'General'}</td>
                    <td>
                      {employee.createdAt
                        ? formatDate(employee.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEditEmployees && (
                            <>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={async () => {
                                  if (!companyId || !isEmployeesSupabase) return;
                                  try {
                                    await setEmployeeStatus(employee.id, 'active');
                                    await logActivity({
                                      companyId,
                                      employeeId: employee.id,
                                      action: 'Employee restored from archived',
                                      module: 'employees',
                                      metadata: { updated_by: user?.id },
                                    });
                                    await refetchSupabaseEmployees();
                                    toast.success('Employee restored');
                                  } catch (err: unknown) {
                                    const message = (err as { message?: string })?.message ?? 'Failed to restore employee';
                                    toast.error('Restore failed', { description: message });
                                  }
                                }}
                              >
                                Restore
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {filteredEmployees.map((employee) =>
            section === 'active' ? (
              <div key={employee.id} className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      avatarUrl={employee.avatarUrl}
                      name={getEmployeeName(employee)}
                      size="md"
                      className="h-10 w-10 bg-primary/10 text-primary"
                    />
                    <div>
                      <p className="font-medium text-foreground">{getEmployeeName(employee)}</p>
                      <p className="text-xs text-muted-foreground">{getRoleLabel(getEmployeeRole(employee))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn('fv-badge capitalize', getStatusBadge(employee.status))}>
                      {employee.status.replace('-', ' ')}
                    </span>
                      <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="p-2 hover:bg-muted rounded-lg">
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => navigate(`/employees/${employee.id}`)}
                        >
                          <UserIcon className="h-3.5 w-3.5 mr-2" />
                          View profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setDetailsOpen(true);
                          }}
                        >
                          View details
                        </DropdownMenuItem>
                        {canEditEmployees && (
                          <>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(employee)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setDeactivateTarget(employee)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Deactivate
                          </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                      </DropdownMenu>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>{employee.department || 'General'}</div>
                  {getEmployeeEmail(employee) && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span>{getEmployeeEmail(employee)}</span>
                    </div>
                  )}
                  {getEmployeePhone(employee) && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{getEmployeePhone(employee)}</span>
                    </div>
                  )}
                </div>
              </div>
              ) : section === 'invited' ? (
              <div key={employee.id} className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      avatarUrl={employee.avatarUrl}
                      name={getEmployeeName(employee)}
                      size="md"
                      className="h-10 w-10 bg-primary/10 text-primary"
                    />
                    <div>
                      <p className="font-medium text-foreground">{getEmployeeName(employee)}</p>
                      <p className="text-xs text-muted-foreground">{getRoleLabel(getEmployeeRole(employee))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn('fv-badge capitalize', getStatusBadge(employee.status))}>
                      {employee.status.replace('-', ' ')}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEditEmployees && (
                          <>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              disabled={resendingEmployeeId === employee.id}
                              onClick={async () => {
                                if (!companyId || !isEmployeesSupabase) return;
                                const emailAddr = (getEmployeeEmail(employee) || '').toLowerCase();
                                if (!emailAddr) {
                                  toast.error('Cannot resend invite', {
                                    description: 'Invite has no email address.',
                                  });
                                  return;
                                }
                                if (employee.status !== 'invited') {
                                  toast.error('Cannot resend invite', {
                                    description: 'Only pending invites can be resent.',
                                  });
                                  return;
                                }
                                try {
                                  setResendingEmployeeId(employee.id);
                                  if (import.meta.env.DEV) {
                                    // eslint-disable-next-line no-console
                                    console.log('[EmployeesPage] resendEmployeeInvite (mobile)', {
                                      companyId,
                                      email: emailAddr,
                                      employeeId: employee.id,
                                    });
                                  }
                                  await resendEmployeeInvite(companyId, employee.id);
                                  await logActivity({
                                    companyId,
                                    employeeId: employee.id,
                                    action: 'Invite resent',
                                    module: 'employees',
                                    metadata: { updated_by: user?.id, email: emailAddr },
                                  });
                                  await refetchSupabaseEmployees();
                                  toast.success('Invite resent');
                                } catch (err: unknown) {
                                  const message =
                                    (err as { message?: string })?.message ?? 'Failed to resend invite';
                                  toast.error('Resend failed', { description: message });
                                } finally {
                                  setResendingEmployeeId((current) =>
                                    current === employee.id ? null : current,
                                  );
                                }
                              }}
                            >
                              Resend invite
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={async () => {
                                if (!companyId || !isEmployeesSupabase) return;
                                const emailAddr = (getEmployeeEmail(employee) || '').toLowerCase();
                                if (!emailAddr) {
                                  toast.error('Cannot revoke invite', { description: 'Invite has no email address.' });
                                  return;
                                }
                                try {
                                  if (import.meta.env.DEV) {
                                    // eslint-disable-next-line no-console
                                    console.log('[EmployeesPage] revokeEmployeeInvite (mobile)', {
                                      companyId,
                                      email: emailAddr,
                                      employeeId: employee.id,
                                    });
                                  }
                                  await revokeEmployeeInvite(companyId, emailAddr);
                                  await logActivity({
                                    companyId,
                                    employeeId: employee.id,
                                    action: 'Invite revoked',
                                    module: 'employees',
                                    metadata: { updated_by: user?.id, email: emailAddr },
                                  });
                                  await refetchSupabaseEmployees();
                                  toast.success('Invite revoked');
                                } catch (err: unknown) {
                                  const message = (err as { message?: string })?.message ?? 'Failed to revoke invite';
                                  toast.error('Revoke failed', { description: message });
                                }
                              }}
                            >
                              Revoke invite
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>{employee.department || 'General'}</div>
                  {getEmployeeEmail(employee) && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span>{getEmployeeEmail(employee)}</span>
                    </div>
                  )}
                  {(employee.inviteSentAt ?? employee.createdAt) && (
                    <div className="flex items-center gap-2">
                      <span>Invited:</span>
                      <span>
                        {formatDate(employee.inviteSentAt ?? employee.createdAt, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : section === 'draft' ? (
              <div key={employee.id} className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      avatarUrl={employee.avatarUrl}
                      name={getEmployeeName(employee)}
                      size="md"
                      className="h-10 w-10 bg-primary/10 text-primary"
                    />
                    <div>
                      <p className="font-medium text-foreground">{getEmployeeName(employee)}</p>
                      <p className="text-xs text-muted-foreground">{getRoleLabel(getEmployeeRole(employee))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => {
                            setCurrentDraftEmployeeId(employee.id);
                            setName(getEmployeeName(employee));
                            setDepartment(employee.department || '');
                            setContact(getEmployeePhone(employee));
                            setEmail(getEmployeeEmail(employee) || '');
                            const draftRole = getEmployeeRole(employee);
                            setRole((draftRole ?? 'none') as EmployeeRoleSelection);
                            setAddPermissions(resolvePermissions(draftRole, employee.permissions ?? getDefaultPermissions()));
                            setAddPreset('custom');
                            setAddOpen(true);
                          }}
                        >
                          Continue editing
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={async () => {
                            if (!companyId || !isEmployeesSupabase) return;
                            try {
                              const selectedRole = getEmployeeRole(employee);
                              const permissionPreset = (selectedRole ?? 'viewer') as string;
                              await inviteEmployee({
                                companyId,
                                fullName: getEmployeeName(employee),
                                email: (getEmployeeEmail(employee) || '').toLowerCase(),
                                phone: getEmployeePhone(employee) || undefined,
                                role: selectedRole ?? undefined,
                                department: employee.department || undefined,
                                permissionPreset,
                                permissionOverrides: employee.permissions ?? null,
                                assignedProjectIds: [],
                                actorEmployeeId: employeeProfile?.id ?? undefined,
                              });
                              await refetchSupabaseEmployees();
                              toast.success('Invite sent');
                            } catch (err: unknown) {
                              const message = (err as { message?: string })?.message ?? 'Failed to send invite';
                              toast.error('Invite failed', { description: message });
                            }
                          }}
                        >
                          Send invite
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-red-600"
                          onClick={async () => {
                            if (!isEmployeesSupabase) return;
                            try {
                              await deleteEmployeeSupabase(employee.id);
                              await refetchSupabaseEmployees();
                              toast.success('Draft deleted');
                            } catch (err: unknown) {
                              const message = (err as { message?: string })?.message ?? 'Failed to delete draft';
                              toast.error('Delete failed', { description: message });
                            }
                          }}
                        >
                          Delete draft
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={async () => {
                            if (!companyId || !isEmployeesSupabase) return;
                            try {
                              await setEmployeeStatus(employee.id, 'archived');
                              await logActivity({
                                companyId,
                                employeeId: employee.id,
                                action: 'Draft archived',
                                module: 'employees',
                                metadata: { updated_by: user?.id },
                              });
                              await refetchSupabaseEmployees();
                              toast.success('Draft archived');
                            } catch (err: unknown) {
                              const message = (err as { message?: string })?.message ?? 'Failed to archive draft';
                              toast.error('Archive failed', { description: message });
                            }
                          }}
                        >
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>{employee.department || 'General'}</div>
                  {getEmployeeEmail(employee) && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span>{getEmployeeEmail(employee)}</span>
                    </div>
                  )}
                  {employee.createdAt && (
                    <div className="flex items-center gap-2">
                      <span>Last saved:</span>
                      <span>
                        {formatDate(employee.createdAt, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key={employee.id} className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      avatarUrl={employee.avatarUrl}
                      name={getEmployeeName(employee)}
                      size="md"
                      className="h-10 w-10 bg-primary/10 text-primary"
                    />
                    <div>
                      <p className="font-medium text-foreground">{getEmployeeName(employee)}</p>
                      <p className="text-xs text-muted-foreground">{getRoleLabel(getEmployeeRole(employee))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="p-2 hover:bg-muted rounded-lg">
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEditEmployees && (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={async () => {
                              if (!companyId || !isEmployeesSupabase) return;
                              try {
                                await setEmployeeStatus(employee.id, 'active');
                                await logActivity({
                                  companyId,
                                  employeeId: employee.id,
                                  action: 'Employee restored from archived',
                                  module: 'employees',
                                  metadata: { updated_by: user?.id },
                                });
                                await refetchSupabaseEmployees();
                                toast.success('Employee restored');
                              } catch (err: unknown) {
                                const message = (err as { message?: string })?.message ?? 'Failed to restore employee';
                                toast.error('Restore failed', { description: message });
                              }
                            }}
                          >
                            Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>{employee.department || 'General'}</div>
                  {getEmployeeEmail(employee) && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span>{getEmployeeEmail(employee)}</span>
                    </div>
                  )}
                  {employee.createdAt && (
                    <div className="flex items-center gap-2">
                      <span>Archived:</span>
                      <span>
                        {formatDate(employee.createdAt, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        isTrial={isTrial}
        isExpired={isExpired}
        daysRemaining={daysRemaining}
      />

      {/* Deactivate Employee Confirmation */}
      <Dialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Deactivate Employee</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to deactivate{' '}
            <span className="font-medium text-foreground">
              {deactivateTarget ? getEmployeeName(deactivateTarget) : ''}
            </span>
            ? They will lose access and be moved to the Archived section. You can restore them later.
          </p>
          <DialogFooter>
            <button
              type="button"
              className="fv-btn fv-btn--outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={deactivating}
            >
              Cancel
            </button>
            <button
              type="button"
              className="fv-btn bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeactivateEmployee}
              disabled={deactivating}
            >
              {deactivating ? 'Deactivating…' : 'Deactivate'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
