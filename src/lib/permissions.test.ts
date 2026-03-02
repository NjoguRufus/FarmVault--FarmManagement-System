import { describe, it, expect } from 'vitest';
import {
  getPresetPermissions,
  getFullAccessPermissions,
  getRoleDefaultPermissions,
} from '@/lib/permissions';

describe('permission presets', () => {
  it('viewer preset is read-only', () => {
    const perms = getPresetPermissions('viewer');

    expect(perms.dashboard.view).toBe(true);
    expect(perms.projects.view).toBe(true);
    expect(perms.inventory.view).toBe(true);
    expect(perms.operations.view).toBe(true);
    expect(perms.harvest.view).toBe(true);

    expect(perms.inventory.addItem).toBe(false);
    expect(perms.operations.createWorkCard).toBe(false);
    expect(perms.harvest.payPickers).toBe(false);
    expect(perms.settings.edit).toBe(false);
  });

  it('manager preset can manage operations and approve expenses', () => {
    const perms = getPresetPermissions('manager');

    expect(perms.operations.view).toBe(true);
    expect(perms.operations.assignWork).toBe(true);
    expect(perms.operations.recordDailyWork).toBe(true);
    expect(perms.operations.approveWorkLog).toBe(true);
    expect(perms.operations.markPaid).toBe(true);
    expect(perms.expenses.approve).toBe(true);
  });

  it('full-access preset and full-access helper both grant full control', () => {
    const preset = getPresetPermissions('full-access');
    const full = getFullAccessPermissions();

    expect(preset.projects.create).toBe(true);
    expect(preset.inventory.deleteItem).toBe(true);
    expect(preset.harvest.payPickers).toBe(true);

    expect(full.projects.create).toBe(true);
    expect(full.inventory.deleteItem).toBe(true);
    expect(full.harvest.payPickers).toBe(true);
  });

  it('role default mapping for manager matches manager preset', () => {
    const fromRole = getRoleDefaultPermissions('manager');
    const fromPreset = getPresetPermissions('manager');

    expect(fromRole.operations.assignWork).toBe(fromPreset.operations.assignWork);
    expect(fromRole.operations.markPaid).toBe(fromPreset.operations.markPaid);
    expect(fromRole.expenses.approve).toBe(fromPreset.expenses.approve);
  });
});

