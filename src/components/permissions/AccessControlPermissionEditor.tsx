/**
 * Permission editor using module.action keys, grouped by module.
 * For use with employee access control (permissions + employee_permissions tables).
 */

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { PERMISSION_GROUPS, type PermissionKey } from '@/config/accessControl';
import { cn } from '@/lib/utils';

export interface AccessControlPermissionEditorProps {
  allowedKeys: Set<string>;
  onChange: (allowedKeys: Set<string>) => void;
  disabled?: boolean;
  className?: string;
}

function actionLabel(key: string): string {
  const action = key.split('.').slice(1).join('.') || 'view';
  return action.replace(/_/g, ' ');
}

export function AccessControlPermissionEditor({
  allowedKeys,
  onChange,
  disabled = false,
  className,
}: AccessControlPermissionEditorProps) {
  const toggle = (key: PermissionKey, checked: boolean) => {
    const next = new Set(allowedKeys);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.module} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-sm font-semibold text-foreground">{group.label}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {group.keys.map((key) => (
              <label
                key={key}
                className={cn(
                  'flex items-center gap-2 cursor-pointer text-sm',
                  disabled && 'opacity-60 cursor-not-allowed'
                )}
              >
                <Checkbox
                  checked={allowedKeys.has(key)}
                  onCheckedChange={(c) => toggle(key, c === true)}
                  disabled={disabled}
                  className="h-4 w-4"
                />
                <span className="text-muted-foreground capitalize">{actionLabel(key)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
