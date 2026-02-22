import React from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  canByPermissionMap,
  isPermissionLockedForRole,
  PERMISSION_PRESET_OPTIONS,
  setPermissionValue,
} from '@/lib/permissions';
import type { PermissionMap, PermissionModule, PermissionPresetKey } from '@/types';

type EditorPreset = PermissionPresetKey | 'custom';

type ToggleSpec = {
  path: string;
  label: string;
};

type ModuleSpec = {
  module: PermissionModule;
  title: string;
  toggles: ToggleSpec[];
};

const MODULE_SPECS: ModuleSpec[] = [
  {
    module: 'dashboard',
    title: 'Dashboard',
    toggles: [
      { path: 'cards.cropStage', label: 'Crop stage card' },
      { path: 'cards.revenue', label: 'Revenue card' },
      { path: 'cards.expenses', label: 'Expenses card' },
      { path: 'cards.profitLoss', label: 'Profit & loss card' },
      { path: 'cards.budget', label: 'Budget card' },
    ],
  },
  {
    module: 'projects',
    title: 'Projects',
    toggles: [
      { path: 'create', label: 'Create project' },
      { path: 'edit', label: 'Edit project' },
      { path: 'delete', label: 'Delete project' },
      { path: 'accessTabs.overview', label: 'Tab: Overview' },
      { path: 'accessTabs.planning', label: 'Tab: Planning' },
      { path: 'accessTabs.expenses', label: 'Tab: Expenses' },
      { path: 'accessTabs.inventory', label: 'Tab: Inventory' },
      { path: 'accessTabs.operations', label: 'Tab: Operations' },
      { path: 'accessTabs.harvest', label: 'Tab: Harvest' },
      { path: 'accessTabs.reports', label: 'Tab: Reports' },
    ],
  },
  {
    module: 'planning',
    title: 'Planning',
    toggles: [
      { path: 'create', label: 'Create planning items' },
      { path: 'edit', label: 'Edit planning items' },
      { path: 'delete', label: 'Delete planning items' },
    ],
  },
  {
    module: 'inventory',
    title: 'Inventory',
    toggles: [
      { path: 'addItem', label: 'Add item' },
      { path: 'editItem', label: 'Edit item' },
      { path: 'deleteItem', label: 'Delete item' },
      { path: 'restock', label: 'Restock' },
      { path: 'deduct', label: 'Deduct stock' },
      { path: 'categories', label: 'Manage categories' },
      { path: 'purchases', label: 'Record purchases' },
    ],
  },
  {
    module: 'expenses',
    title: 'Expenses',
    toggles: [
      { path: 'create', label: 'Create expense' },
      { path: 'edit', label: 'Edit expense' },
      { path: 'delete', label: 'Delete expense' },
      { path: 'approve', label: 'Approve expense' },
    ],
  },
  {
    module: 'operations',
    title: 'Operations',
    toggles: [
      { path: 'createWorkCard', label: 'Create work card' },
      { path: 'assignWork', label: 'Assign work' },
      { path: 'recordDailyWork', label: 'Record daily work' },
      { path: 'approveWorkLog', label: 'Approve work log' },
      { path: 'markPaid', label: 'Mark paid' },
      { path: 'viewCost', label: 'View cost' },
    ],
  },
  {
    module: 'harvest',
    title: 'Harvest',
    toggles: [
      { path: 'create', label: 'Create harvest entries' },
      { path: 'edit', label: 'Edit harvest entries' },
      { path: 'close', label: 'Close harvest cycle' },
      { path: 'recordIntake', label: 'Record intake' },
      { path: 'viewFinancials', label: 'View financials' },
      { path: 'payPickers', label: 'Pay pickers' },
      { path: 'viewBuyerSection', label: 'View buyer section' },
    ],
  },
  {
    module: 'reports',
    title: 'Reports',
    toggles: [{ path: 'export', label: 'Export reports' }],
  },
  {
    module: 'employees',
    title: 'Employees',
    toggles: [
      { path: 'create', label: 'Create employee' },
      { path: 'edit', label: 'Edit employee' },
      { path: 'deactivate', label: 'Deactivate employee' },
    ],
  },
  {
    module: 'settings',
    title: 'Settings',
    toggles: [{ path: 'edit', label: 'Edit settings' }],
  },
];

interface PermissionEditorProps {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  preset: EditorPreset;
  onPresetChange: (next: EditorPreset) => void;
  lockedRole?: string | null;
}

export function PermissionEditor({
  value,
  onChange,
  preset,
  onPresetChange,
  lockedRole = null,
}: PermissionEditorProps) {
  const setToggle = (module: PermissionModule, path: string, checked: boolean) => {
    onChange(setPermissionValue(value, module, path, checked));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">Permission preset</label>
        <Select value={preset} onValueChange={(val) => onPresetChange(val as EditorPreset)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom</SelectItem>
            {PERMISSION_PRESET_OPTIONS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(lockedRole === 'manager' || lockedRole === 'operations-manager') && (
        <p className="text-xs text-muted-foreground">
          Manager operations access is fixed. You can still grant additional permissions.
        </p>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/20 px-3">
        <Accordion type="multiple" className="w-full">
          {MODULE_SPECS.map((moduleSpec) => {
            const viewLocked = isPermissionLockedForRole(lockedRole, moduleSpec.module, 'view');
            const canView = viewLocked ? true : canByPermissionMap(value, moduleSpec.module, 'view');
            return (
              <AccordionItem key={moduleSpec.module} value={moduleSpec.module} className="border-border/50">
                <div className="flex items-center gap-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="text-sm font-medium text-foreground">{moduleSpec.title}</span>
                  </AccordionTrigger>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">View</span>
                    <Switch
                      checked={canView}
                      disabled={viewLocked}
                      onCheckedChange={(checked) =>
                        setToggle(moduleSpec.module, 'view', Boolean(checked))
                      }
                      aria-label={`${moduleSpec.title} view permission`}
                    />
                  </div>
                </div>
                <AccordionContent className="pt-1 pb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {moduleSpec.toggles.map((toggle) => {
                      const locked = isPermissionLockedForRole(lockedRole, moduleSpec.module, toggle.path);
                      const checked = locked
                        ? true
                        : canByPermissionMap(value, moduleSpec.module, toggle.path);
                      return (
                        <label
                          key={toggle.path}
                          className="flex items-center gap-2 rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-xs sm:text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={locked}
                            onCheckedChange={(next) =>
                              setToggle(moduleSpec.module, toggle.path, Boolean(next))
                            }
                          />
                          <span className="text-foreground">{toggle.label}</span>
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
  );
}
