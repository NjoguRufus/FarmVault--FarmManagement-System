import React, { useState } from 'react';
import { ScrollText } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { AuditLogsDrawer, type AuditLogsDrawerProps } from '@/components/audit/AuditLogsDrawer';

export type AuditLogsButtonProps = Omit<ButtonProps, 'onClick'> &
  Pick<
    AuditLogsDrawerProps,
    'companyId' | 'schemaName' | 'tableName' | 'recordId' | 'showEntityFilters' | 'onMutationSuccess' | 'undoWindowHours'
  > & {
    label?: string;
  };

export function AuditLogsButton({
  companyId,
  schemaName,
  tableName,
  recordId,
  showEntityFilters,
  onMutationSuccess,
  undoWindowHours,
  label = 'Audit logs',
  disabled,
  children,
  ...btnProps
}: AuditLogsButtonProps) {
  const [open, setOpen] = useState(false);
  const noTenant = !companyId?.trim();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={Boolean(disabled || noTenant)}
        onClick={() => setOpen(true)}
        {...btnProps}
      >
        {children ?? (
          <>
            <ScrollText className="h-4 w-4 mr-2" aria-hidden />
            {label}
          </>
        )}
      </Button>
      <AuditLogsDrawer
        isOpen={open}
        onClose={() => setOpen(false)}
        companyId={companyId}
        schemaName={schemaName}
        tableName={tableName}
        recordId={recordId}
        showEntityFilters={showEntityFilters}
        onMutationSuccess={onMutationSuccess}
        undoWindowHours={undoWindowHours}
      />
    </>
  );
}
