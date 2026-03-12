import React, { useMemo, useState } from 'react';
import { 
  Plus, 
  Minus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  Package,
  FileText,
  Archive,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AuditAction =
  | 'ADD_ITEM'
  | 'EDIT_ITEM'
  | 'RESTOCK'
  | 'STOCK_IN'
  | 'DEDUCT'
  | 'USAGE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'TRANSFER'
  | 'STATUS_CHANGE'
  | 'CREATED';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  itemId?: string;
  itemName?: string;
  quantity?: number;
  actorId?: string;
  actorName?: string;
  timestamp: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  isArchived?: boolean;
}

interface InventoryAuditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditLogs: AuditLogEntry[];
  isLoading?: boolean;
  onRestoreItem?: (itemId: string, itemName: string) => void;
  canRestore?: boolean;
}

type ActionCategory = 'added' | 'updated' | 'deducted' | 'archived' | 'restored';

const actionToCategory: Record<AuditAction, ActionCategory> = {
  ADD_ITEM: 'added',
  CREATED: 'added',
  RESTOCK: 'added',
  STOCK_IN: 'added',
  EDIT_ITEM: 'updated',
  DEDUCT: 'deducted',
  USAGE: 'deducted',
  DELETE: 'archived',
  ARCHIVE: 'archived',
  RESTORE: 'restored',
  TRANSFER: 'updated',
  STATUS_CHANGE: 'updated',
};

const categoryConfig: Record<ActionCategory, {
  label: string;
  color: string;
  bgColor: string;
  dotColor: string;
  icon: React.ElementType;
}> = {
  added: {
    label: 'Added',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 hover:bg-emerald-100',
    dotColor: 'bg-emerald-500',
    icon: Plus,
  },
  updated: {
    label: 'Updated',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 hover:bg-blue-100',
    dotColor: 'bg-blue-500',
    icon: Edit3,
  },
  deducted: {
    label: 'Deducted',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50 hover:bg-orange-100',
    dotColor: 'bg-orange-500',
    icon: Minus,
  },
  archived: {
    label: 'Archived',
    color: 'text-red-700',
    bgColor: 'bg-red-50 hover:bg-red-100',
    dotColor: 'bg-red-500',
    icon: Archive,
  },
  restored: {
    label: 'Restored',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50 hover:bg-purple-100',
    dotColor: 'bg-purple-500',
    icon: RotateCcw,
  },
};

const actionConfig: Record<AuditAction, {
  label: string;
  color: string;
  bgColor: string;
  dotColor: string;
  icon: React.ElementType;
  description: (entry: AuditLogEntry) => string;
}> = {
  ADD_ITEM: {
    label: 'Added',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    dotColor: 'bg-emerald-500',
    icon: Plus,
    description: (e) => `Created new item${e.quantity ? ` with ${e.quantity} units` : ''}`,
  },
  CREATED: {
    label: 'Added',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    dotColor: 'bg-emerald-500',
    icon: Plus,
    description: (e) => `Created new item${e.quantity ? ` with ${e.quantity} units` : ''}`,
  },
  RESTOCK: {
    label: 'Added',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    dotColor: 'bg-emerald-500',
    icon: Plus,
    description: (e) => `Added ${e.quantity ?? 0} units to stock`,
  },
  STOCK_IN: {
    label: 'Added',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    dotColor: 'bg-emerald-500',
    icon: Plus,
    description: (e) => `Stock in: +${e.quantity ?? 0} units`,
  },
  EDIT_ITEM: {
    label: 'Updated',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    dotColor: 'bg-blue-500',
    icon: Edit3,
    description: () => 'Item details updated',
  },
  DEDUCT: {
    label: 'Deducted',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    dotColor: 'bg-orange-500',
    icon: Minus,
    description: (e) => `Deducted ${e.quantity ?? 0} units from stock`,
  },
  USAGE: {
    label: 'Deducted',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    dotColor: 'bg-orange-500',
    icon: Minus,
    description: (e) => `Usage recorded: -${e.quantity ?? 0} units`,
  },
  DELETE: {
    label: 'Archived',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    dotColor: 'bg-red-500',
    icon: Trash2,
    description: () => 'Item archived (soft delete)',
  },
  ARCHIVE: {
    label: 'Archived',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    dotColor: 'bg-red-500',
    icon: Archive,
    description: () => 'Item archived (soft delete)',
  },
  RESTORE: {
    label: 'Restored',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    dotColor: 'bg-purple-500',
    icon: RotateCcw,
    description: () => 'Item restored from archive',
  },
  TRANSFER: {
    label: 'Updated',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    dotColor: 'bg-indigo-500',
    icon: RefreshCw,
    description: (e) => `Transferred ${e.quantity ?? 0} units`,
  },
  STATUS_CHANGE: {
    label: 'Updated',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    dotColor: 'bg-gray-500',
    icon: FileText,
    description: () => 'Status changed',
  },
};

function formatTimestamp(timestamp: string): { date: string; time: string; relative: string } {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let relative: string;
  if (diffMins < 1) {
    relative = 'Just now';
  } else if (diffMins < 60) {
    relative = `${diffMins}m ago`;
  } else if (diffHours < 24) {
    relative = `${diffHours}h ago`;
  } else if (diffDays < 7) {
    relative = `${diffDays}d ago`;
  } else {
    relative = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return {
    date: date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    }),
    time: date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    }),
    relative,
  };
}

function AuditListItem({ 
  entry, 
  onRestore,
  canRestore,
}: { 
  entry: AuditLogEntry;
  onRestore?: (itemId: string, itemName: string) => void;
  canRestore?: boolean;
}) {
  const config = actionConfig[entry.action] || actionConfig.STATUS_CHANGE;
  const timestamp = formatTimestamp(entry.timestamp);
  const showRestoreButton = canRestore && entry.isArchived && entry.itemId && onRestore;

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 border-b border-border/50 last:border-b-0">
      {/* Color indicator dot */}
      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', config.dotColor)} />
      
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Item name */}
        <p className="font-medium text-sm text-foreground truncate">
          {entry.itemName || 'Unknown Item'}
        </p>
        
        {/* Row 2: Action + by + user name + at + time */}
        <div className="flex items-center gap-1 mt-0.5 text-xs flex-wrap">
          <span className={cn('font-medium', config.color)}>
            {config.label}
          </span>
          {entry.actorName && (
            <>
              <span className="text-muted-foreground">by</span>
              <span className="text-foreground font-medium">{entry.actorName}</span>
            </>
          )}
          <span className="text-muted-foreground">at</span>
          <span className="text-muted-foreground">{timestamp.time}</span>
        </div>

        {/* Row 3: Description */}
        <p className="text-xs text-muted-foreground mt-0.5">
          {config.description(entry)}
        </p>
      </div>

      {/* Right side: Timestamp + Restore button */}
      <div className="flex flex-col items-end shrink-0 gap-1">
        <p className="text-xs text-muted-foreground">{timestamp.relative}</p>
        
        {/* Restore button for archived items */}
        {showRestoreButton && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-purple-700 hover:text-purple-800 hover:bg-purple-50 px-2"
            onClick={() => onRestore(entry.itemId!, entry.itemName || 'Item')}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}

function groupLogsByDate(logs: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const groups = new Map<string, AuditLogEntry[]>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const log of logs) {
    const logDate = new Date(log.timestamp);
    logDate.setHours(0, 0, 0, 0);
    
    let key: string;
    if (logDate.getTime() === today.getTime()) {
      key = 'Today';
    } else if (logDate.getTime() === yesterday.getTime()) {
      key = 'Yesterday';
    } else {
      key = logDate.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'short', 
        day: 'numeric',
        year: logDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(log);
  }

  return groups;
}

export function InventoryAuditDrawer({
  open,
  onOpenChange,
  auditLogs,
  isLoading,
  onRestoreItem,
  canRestore = false,
}: InventoryAuditDrawerProps) {
  const [activeFilter, setActiveFilter] = useState<ActionCategory | 'all'>('all');

  const sortedLogs = useMemo(() => {
    return [...auditLogs].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    if (activeFilter === 'all') return sortedLogs;
    return sortedLogs.filter(log => actionToCategory[log.action] === activeFilter);
  }, [sortedLogs, activeFilter]);

  const groupedLogs = useMemo(() => groupLogsByDate(filteredLogs), [filteredLogs]);

  const categoryCounts = useMemo(() => {
    const counts: Record<ActionCategory, number> = {
      added: 0,
      updated: 0,
      deducted: 0,
      archived: 0,
      restored: 0,
    };
    
    for (const log of auditLogs) {
      const category = actionToCategory[log.action];
      if (category) {
        counts[category]++;
      }
    }
    
    return counts;
  }, [auditLogs]);

  const activeCategories = useMemo(() => {
    return (Object.keys(categoryCounts) as ActionCategory[]).filter(
      cat => categoryCounts[cat] > 0
    );
  }, [categoryCounts]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col" draggable>
        {/* Header - title on same row as close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-semibold text-base">Inventory Audit</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Subtitle */}
        <div className="px-4 py-1.5 text-xs text-muted-foreground border-b border-border/50 shrink-0">
          Activity log for inventory changes
        </div>

        {/* Stats bar with Total + Action categories */}
        <div className="px-4 py-2 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Total count */}
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                activeFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-foreground'
              )}
            >
              Total
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                activeFilter === 'all' ? 'bg-primary-foreground/20' : 'bg-background'
              )}>
                {auditLogs.length}
              </span>
            </button>

            {/* Action category filters - only show ones that exist */}
            {activeCategories.map(category => {
              const config = categoryConfig[category];
              const count = categoryCounts[category];
              const isActive = activeFilter === category;
              
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveFilter(isActive ? 'all' : category)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    isActive
                      ? cn(config.bgColor, config.color, 'ring-1 ring-current')
                      : cn('bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground')
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', config.dotColor)} />
                  {config.label}
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                    isActive ? 'bg-white/50' : 'bg-background'
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List content */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground px-4">
              <Package className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {activeFilter === 'all' ? 'No audit events yet' : `No ${categoryConfig[activeFilter].label.toLowerCase()} events`}
              </p>
              <p className="text-xs text-center mt-1">
                {activeFilter === 'all' 
                  ? 'Actions like adding stock, editing items, or archiving will appear here.'
                  : 'Try selecting a different filter or "Total" to see all events.'}
              </p>
            </div>
          ) : (
            <div className="pb-4">
              {Array.from(groupedLogs.entries()).map(([dateLabel, logs]) => (
                <div key={dateLabel}>
                  {/* Date header */}
                  <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-4 py-2 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {dateLabel}
                    </p>
                  </div>
                  {/* Entries for this date */}
                  {logs.map((entry) => (
                    <AuditListItem
                      key={entry.id}
                      entry={entry}
                      onRestore={onRestoreItem}
                      canRestore={canRestore}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// Re-export types for backward compatibility
export type { AuditLogEntry as AuditEntry };
