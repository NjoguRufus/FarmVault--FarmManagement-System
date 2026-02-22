import React, { useMemo, useState } from 'react';
import { Plus, Search, MoreHorizontal, Phone, Mail, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db, authEmployeeCreate } from '@/lib/firebase';
import { serverTimestamp, doc, setDoc, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useCollection } from '@/hooks/useCollection';
import { Employee, PermissionMap, PermissionPresetKey, User } from '@/types';
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
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { PermissionEditor } from '@/components/permissions/PermissionEditor';
import { getDefaultPermissions, getPresetPermissions, resolvePermissions } from '@/lib/permissions';

type ManagedEmployeeRole = 'operations-manager' | 'logistics-driver' | 'sales-broker';
type EmployeeRoleSelection = ManagedEmployeeRole | 'none';
type PermissionEditorPreset = PermissionPresetKey | 'custom';

const ROLE_OPTIONS: Array<{
  value: ManagedEmployeeRole;
  label: string;
  department: string;
}> = [
  { value: 'operations-manager', label: 'Operations (Manager)', department: 'Operations' },
  { value: 'logistics-driver', label: 'Logistics (Driver)', department: 'Logistics' },
  { value: 'sales-broker', label: 'Sales (Broker)', department: 'Sales' },
];

const DEFAULT_PERMISSIONS = resolvePermissions(null, getDefaultPermissions());

function mapEmployeeRoleToAppRole(role: ManagedEmployeeRole | null): 'manager' | 'broker' | 'employee' {
  if (role === 'operations-manager') return 'manager';
  if (role === 'sales-broker') return 'broker';
  return 'employee';
}

function normalizeEmployeeRole(role: string | null | undefined): ManagedEmployeeRole | null {
  if (!role) return null;
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
  return employee.fullName || employee.name || 'Employee';
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
  const { user } = useAuth();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const canCreateEmployees = can('employees', 'create');
  const canEditEmployees = can('employees', 'edit');
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'fv-badge--active',
      'on-leave': 'fv-badge--warning',
      inactive: 'bg-muted text-muted-foreground',
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
  const { data: employees = [], isLoading } = useCollection<Employee>('employees', 'employees');
  const { data: allUsers = [] } = useCollection<User>('employees-page-users', 'users');

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
  const [editStatus, setEditStatus] = useState<'active' | 'on-leave' | 'inactive'>('active');
  const [editSaving, setEditSaving] = useState(false);
  const [editPermissions, setEditPermissions] = useState<PermissionMap>(DEFAULT_PERMISSIONS);
  const [editPreset, setEditPreset] = useState<PermissionEditorPreset>('custom');

  const openEdit = (employee: Employee) => {
    const employeeRole = getEmployeeRole(employee);
    setEditingEmployee(employee);
    setEditName(getEmployeeName(employee));
    setEditRole(employeeRole || 'none');
    setEditDepartment(employee.department || getDepartmentFromRole(employeeRole));
    setEditContact(getEmployeePhone(employee));
    setEditStatus((employee.status as typeof editStatus) || 'active');
    setEditPermissions(resolvePermissions(employeeRole, employee.permissions ?? getDefaultPermissions()));
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
  };

  const handleRoleChange = (value: string) => {
    const normalized = value === 'none' ? null : normalizeEmployeeRole(value);
    setRole((normalized ?? 'none') as EmployeeRoleSelection);
    setDepartment(getDepartmentFromRole(normalized));
    setAddPermissions(resolvePermissions(normalized, getDefaultPermissions()));
    setAddPreset('custom');
  };

  const handleEditRoleChange = (value: string) => {
    const normalized = value === 'none' ? null : normalizeEmployeeRole(value);
    setEditRole((normalized ?? 'none') as EmployeeRoleSelection);
    setEditDepartment(getDepartmentFromRole(normalized));
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
    setEditSaving(true);
    try {
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
    if (!canCreateEmployees) {
      toast.error('Permission denied', { description: 'You cannot create employees.' });
      return;
    }
    setSaving(true);
    try {
      const companyId = user?.companyId ?? null;
      if (!companyId && user?.role !== 'developer') {
        toast.error('Cannot add employee', {
          description: 'Your account is not linked to a company. Please contact support or sign in with a company admin account.',
        });
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
    if (!user?.companyId && user?.role !== 'developer') return [];
    if (user?.role === 'developer') return employees;
    return employees.filter((e) => e.companyId === user?.companyId);
  }, [employees, user?.companyId, user?.role]);

  const authUserIdToEmail = useMemo(() => {
    const map = new Map<string, string>();
    (allUsers as User[]).forEach((u) => {
      if (u.email) map.set(u.id, u.email);
    });
    return map;
  }, [allUsers]);

  const getEmployeeEmail = (emp: Employee) => {
    if (emp.email) return emp.email;
    const authId = emp.authUserId || emp.id;
    return authUserIdToEmail.get(authId);
  };

  const filteredEmployees = useMemo(
    () =>
      companyEmployees.filter((e) => {
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
      }),
    [companyEmployees, search, roleFilter, authUserIdToEmail],
  );

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
        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) resetAddForm();
          }}
        >
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary">
              <Plus className="h-4 w-4" />
              Add Employee
            </button>
          </DialogTrigger>
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
                <PermissionEditor
                  value={editPermissions}
                  onChange={handleEditPermissionChange}
                  preset={editPreset}
                  onPresetChange={handleEditPresetChange}
                  lockedRole={editRole === 'none' ? null : editRole}
                />
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
          value={companyEmployees.filter(e => e.status === 'active').length}
          valueVariant="success"
          layout="vertical"
        />
        <SimpleStatCard
          title="On Leave"
          value={companyEmployees.filter(e => e.status === 'on-leave').length}
          valueVariant="warning"
          layout="vertical"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
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
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Contact / Email</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-sm text-muted-foreground">
                    Loading employees…
                  </td>
                </tr>
              )}
              {filteredEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                        {getEmployeeName(employee).split(' ').map(n => n[0]).join('')}
                      </div>
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
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setDetailsOpen(true);
                          }}
                        >
                          View details
                        </DropdownMenuItem>
                        {canEditEmployees && (
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => openEdit(employee)}
                        >
                          Edit
                        </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {filteredEmployees.map((employee) => (
            <div key={employee.id} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                    {getEmployeeName(employee).split(' ').map(n => n[0]).join('')}
                  </div>
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
                      <DropdownMenuItem className="cursor-pointer" onClick={() => { setSelectedEmployee(employee); setDetailsOpen(true); }}>
                        View details
                      </DropdownMenuItem>
                      {canEditEmployees && (
                      <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(employee)}>
                        Edit
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
                {getEmployeePhone(employee) && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{getEmployeePhone(employee)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
