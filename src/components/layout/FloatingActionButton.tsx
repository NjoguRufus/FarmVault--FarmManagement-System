import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Plus, Zap, Wrench, Receipt, NotebookPen, Package, FolderPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FARMER_FARM_WORK_PATH,
  FARMER_HOME_PATH,
  FARMER_NOTES_PATH,
} from '@/lib/routing/farmerAppPaths';

type QuickActionId = 'farm-work' | 'expense' | 'record-note' | 'inventory' | 'project';

type QuickAction = {
  id: QuickActionId;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
};

/** Staff shell vs company (farmer/admin) shell — FAB is only mounted in MainLayout or StaffLayout. */
function getFabShell(pathname: string): 'company' | 'staff' {
  const p = pathname.replace(/\/+/g, '/') || '/';
  if (p === '/staff' || p.startsWith('/staff/')) {
    return 'staff';
  }
  return 'company';
}

/** Hide FAB on Billing & Subscription and Settings & Help (Settings, Support, Feedback). */
function shouldHideFloatingActionButton(pathname: string): boolean {
  const p = pathname.replace(/\/+/g, '/') || '/';
  const hiddenPrefixes = ['/billing', '/settings', '/support', '/feedback'] as const;
  for (const prefix of hiddenPrefixes) {
    if (p === prefix || p.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  if (p === '/staff/support' || p.startsWith('/staff/support/')) return true;
  if (p === '/staff/feedback' || p.startsWith('/staff/feedback/')) return true;
  return false;
}

export function FloatingActionButton() {
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { effectiveAccess } = useAuth();
  const { can } = usePermissions();

  useEffect(() => {
    setMounted(true);
  }, []);

  const shell = getFabShell(location.pathname);
  const isStaff = shell === 'staff';

  const canFarmWorkQuickAdd = isStaff
    ? can('operations', 'recordDailyWork')
    : can('operations', 'createWorkCard');
  const canFarmWorkPage = can('operations', 'view');
  const canExpenseAdd = can('expenses', 'create');
  const canExpensePage = can('expenses', 'view');
  const canNoteQuickAdd = can('notes', 'create');
  const canNotesPage = can('notes', 'view');
  const canInventoryAdd =
    can('inventory', 'addItem') || can('inventory', 'create');
  const canInventoryPage = can('inventory', 'view');
  const canProjectCreate = can('projects', 'create');
  const canProjectPage = can('projects', 'view');

  const handleFarmWork = useCallback(() => {
    if (isStaff) {
      if (canFarmWorkQuickAdd) navigate('/staff/operations?add=1');
      else navigate('/staff/operations');
      return;
    }
    if (canFarmWorkQuickAdd) navigate(`${FARMER_FARM_WORK_PATH}?add=1`);
    else navigate(FARMER_FARM_WORK_PATH);
  }, [isStaff, navigate, canFarmWorkQuickAdd]);

  const handleExpense = useCallback(() => {
    if (isStaff) {
      if (canExpenseAdd) navigate('/staff/expenses?add=1');
      else navigate('/staff/expenses');
      return;
    }
    if (canExpenseAdd) navigate('/expenses?add=1');
    else navigate('/expenses');
  }, [isStaff, navigate, canExpenseAdd]);

  const handleRecordNote = useCallback(() => {
    if (isStaff) {
      if (canNoteQuickAdd) navigate('/staff/notes?add=1');
      else navigate('/staff/notes');
      return;
    }
    if (canNoteQuickAdd) navigate(`${FARMER_NOTES_PATH}?add=1`);
    else navigate(FARMER_NOTES_PATH);
  }, [isStaff, navigate, canNoteQuickAdd]);

  const handleInventory = useCallback(() => {
    if (isStaff) {
      if (canInventoryAdd) navigate('/staff/inventory?add=1');
      else navigate('/staff/inventory');
      return;
    }
    if (canInventoryAdd) navigate('/inventory?add=1');
    else navigate('/inventory');
  }, [isStaff, navigate, canInventoryAdd]);

  const handleProject = useCallback(() => {
    navigate('/projects?new=1');
  }, [navigate]);

  /** Menu order: Add expense → Add note → Record/Plan work → Add project → Add inventory (permission-filtered). */
  const actions = useMemo((): QuickAction[] => {
    const out: QuickAction[] = [];
    if (canExpensePage) {
      out.push({
        id: 'expense',
        label: 'Add expense',
        icon: Receipt,
        onSelect: handleExpense,
      });
    }
    if (canNotesPage) {
      out.push({
        id: 'record-note',
        label: 'Add note',
        icon: NotebookPen,
        onSelect: handleRecordNote,
      });
    }
    if (canFarmWorkPage) {
      out.push({
        id: 'farm-work',
        label: 'Record/Plan work',
        icon: Wrench,
        onSelect: handleFarmWork,
      });
    }
    if (!isStaff && canProjectPage && canProjectCreate) {
      out.push({
        id: 'project',
        label: 'Add project',
        icon: FolderPlus,
        onSelect: handleProject,
      });
    }
    if (canInventoryPage) {
      out.push({
        id: 'inventory',
        label: 'Add inventory',
        icon: Package,
        onSelect: handleInventory,
      });
    }
    return out;
  }, [
    canExpensePage,
    canFarmWorkPage,
    canInventoryPage,
    canNotesPage,
    canProjectCreate,
    canProjectPage,
    handleExpense,
    handleFarmWork,
    handleInventory,
    handleProject,
    handleRecordNote,
    isStaff,
  ]);

  if (
    !mounted ||
    effectiveAccess.isBroker ||
    shouldHideFloatingActionButton(location.pathname) ||
    actions.length === 0
  ) {
    return null;
  }

  const node = (
    <div
      className={cn(
        'pointer-events-none fixed z-[70]',
        'right-4 max-lg:right-3',
        'max-lg:bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]',
        'lg:bottom-6 lg:right-8',
      )}
    >
      <div className="pointer-events-auto flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              aria-label="Quick actions"
              data-floating-actions-trigger
              className={cn(
                'group relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/20 dark:border-white/10',
                'bg-primary/85 dark:bg-primary/80 backdrop-blur-xl text-primary-foreground shadow-sm',
                'hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/30',
                'motion-reduce:transition-none',
              )}
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                <Plus
                  className={cn(
                    'h-4 w-4 transition-opacity duration-200 ease-out',
                    'group-data-[state=open]:opacity-0 group-data-[state=open]:scale-75',
                  )}
                  strokeWidth={2.25}
                  aria-hidden
                />
                <Zap
                  className={cn(
                    'pointer-events-none absolute inset-0 m-auto h-4 w-4 scale-75 opacity-0',
                    'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.75)]',
                    'dark:text-amber-300 dark:drop-shadow-[0_0_10px_rgba(252,211,77,0.55)]',
                    'transition-[opacity,transform] duration-200 ease-out',
                    'group-data-[state=open]:motion-safe:animate-fab-spin-once group-data-[state=open]:motion-reduce:animate-none',
                    'group-data-[state=open]:scale-100 group-data-[state=open]:opacity-100',
                  )}
                  strokeWidth={2.25}
                  aria-hidden
                />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            className="z-[70] w-56 rounded-md"
          >
            {actions.map(({ id, label, icon: Icon, onSelect }) => (
              <DropdownMenuItem
                key={id}
                className="gap-2 cursor-pointer rounded-md"
                onSelect={() => onSelect()}
              >
                <Icon className="h-4 w-4" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
