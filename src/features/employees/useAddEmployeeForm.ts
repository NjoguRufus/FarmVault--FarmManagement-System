/**
 * Form state and submit for Add Employee flow.
 * Uses addEmployee() for Supabase insert; identity from Clerk.
 */
import { useState, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { addEmployee } from '@/lib/employees/addEmployee';
import type { EmployeeRoleKey } from '@/config/accessControl';

export interface AddEmployeeFormState {
  name: string;
  email: string;
  phone: string;
  role: EmployeeRoleKey | '';
  department: string;
  permission_preset: EmployeeRoleKey | '';
  /** Flat "module.action" permission keys used for Add Role. */
  permissions: Record<string, boolean>;
  project_ids: string[];
}

const defaultState: AddEmployeeFormState = {
  name: '',
  email: '',
  phone: '',
  role: '',
  department: '',
  permission_preset: 'custom',
  permissions: {},
  project_ids: [],
};

export function useAddEmployeeForm() {
  const { userId } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const [state, setState] = useState<AddEmployeeFormState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(<K extends keyof AddEmployeeFormState>(key: K, value: AddEmployeeFormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setState(defaultState);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!activeCompanyId) {
      setError('No company selected.');
      return;
    }
    const email = state.email.trim();
    const name = state.name.trim() || email;
    if (!email) {
      setError('Email is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addEmployee({
        company_id: activeCompanyId,
        email,
        full_name: name,
        phone: state.phone.trim() || null,
        role: state.role || undefined,
        department: state.department.trim() || null,
        permission_preset: (state.permission_preset as EmployeeRoleKey) || 'custom',
        permissions: state.role === 'custom' || state.role === 'operations-manager' ? state.permissions : null,
        project_ids: state.project_ids.length ? state.project_ids : undefined,
        created_by_clerk_id: userId ?? undefined,
      });
      reset();
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add employee';
      setError(message);
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, [activeCompanyId, state, userId, reset]);

  return { state, update, submit, reset, saving, error };
}
