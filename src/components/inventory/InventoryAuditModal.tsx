import React, { useMemo } from 'react';
import { 
  Plus, 
  Minus, 
  Edit3, 
  Trash2, 
  RotateCcw, 
  Package,
  Clock,
  User,
  FileText,
  Archive,
  RefreshCw
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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

interface InventoryAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditLogs: AuditLogEntry[];
  isLoading?: boolean;
  onRestoreItem?: (itemId: string, itemName: string) => void;
  canRestore?: boolean;
}

const actionConfig: Record<AuditAction, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ElementType;
  description: (entry: AuditLogEntry) => string;
}> = {
  ADD_ITEM: {
    label: 'Created',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Plus,
    description: (e) => `Created new item${e.quantity ? ` with ${e.quantity} units` : ''}`,
  },
  CREATED: {
    label: 'Created',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Plus,
    description: (e) => `Created new item${e.quantity ? ` with ${e.quantity} units` : ''}`,
  },
  RESTOCK: {
    label: 'Stock Added',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Plus,
    description: (e) => `Added ${e.quantity ?? 0} units to stock`,
  },
  STOCK_IN: {
    label: 'Stock In',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Plus,
    description: (e) => `Recorded stock in of ${e.quantity ?? 0} units`,
  },
  EDIT_ITEM: {
    label: 'Updated',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Edit3,
    description: () => 'Updated item details',
  },
  DEDUCT: {
    label: 'Deducted',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: Minus,
    description: (e) => `Deducted ${e.quantity ?? 0} units from stock`,
  },
  USAGE: {
    label: 'Used',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: Minus,
    description: (e) => `Recorded usage of ${e.quantity ?? 0} units`,
  },
  DELETE: {
    label: 'Deleted',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: Trash2,
    description: () => 'Permanently deleted item',
  },
  ARCHIVE: {
    label: 'Archived',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: Archive,
    description: () => 'Archived item (soft delete)',
  },
  RESTORE: {
    label: 'Restored',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: RotateCcw,
    description: () => 'Restored archived item',
  },
  TRANSFER: {
    label: 'Transferred',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    icon: RefreshCw,
    description: (e) => `Transferred ${e.quantity ?? 0} units`,
  },
  STATUS_CHANGE: {
    label: 'Status Changed',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: FileText,
    description: () => 'Status changed',
  },
};

function ActionBadge({ action }: { action: AuditAction }) {
  const config = actionConfig[action] || actionConfig.STATUS_CHANGE;
  const Icon = config.icon;
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
        config.bgColor,
        config.color,
        config.borderColor
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

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
    relative = `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    relative = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    relative = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    relative = date.toLocaleDateString();
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

function AuditTimelineEntry({ 
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
  const reason = entry.metadata?.reason as string | undefined;
  const notes = entry.notes || reason;

  return (
    <div className={cn(
      'relative pl-6 pb-6 border-l-2 last:border-l-0 last:pb-0',
      config.borderColor
    )}>
      {/* Timeline dot */}
      <div className={cn(
        'absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 bg-background',
        config.borderColor
      )}>
        <div className={cn(
          'w-2 h-2 rounded-full m-0.5',
          config.bgColor
        )} />
      </div>

      {/* Content */}
      <div className="ml-4 space-y-2">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2">
          <ActionBadge action={entry.action} />
          <span className="text-xs text-muted-foreground">
            {timestamp.relative}
          </span>
        </div>

        {/* Item name */}
        {entry.itemName && (
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{entry.itemName}</span>
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-muted-foreground">
          {config.description(entry)}
        </p>

        {/* Actor */}
        {entry.actorName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>by {entry.actorName}</span>
          </div>
        )}

        {/* Notes */}
        {notes && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{notes}</span>
          </div>
        )}

        {/* Timestamp detail */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{timestamp.date} at {timestamp.time}</span>
        </div>

        {/* Restore button for archived items */}
        {showRestoreButton && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 text-purple-700 border-purple-200 hover:bg-purple-50"
            onClick={() => onRestore(entry.itemId!, entry.itemName || 'Item')}
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Restore Item
          </Button>
        )}
      </div>
    </div>
  );
}

export function InventoryAuditModal({
  open,
  onOpenChange,
  auditLogs,
  isLoading,
  onRestoreItem,
  canRestore = false,
}: InventoryAuditModalProps) {
  const sortedLogs = useMemo(() => {
    return [...auditLogs].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [auditLogs]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    return {
      total: auditLogs.length,
      todayCount: auditLogs.filter(log => new Date(log.timestamp) >= today).length,
      weekCount: auditLogs.filter(log => new Date(log.timestamp) >= weekAgo).length,
      archivedCount: auditLogs.filter(log => log.action === 'ARCHIVE' || log.action === 'DELETE').length,
    };
  }, [auditLogs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Inventory Audit Trail
          </DialogTitle>
          <DialogDescription>
            Chronological log of all inventory actions and changes.
          </DialogDescription>
        </DialogHeader>

        {/* Stats summary */}
        <div className="grid grid-cols-4 gap-2 py-3 border-y border-border">
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-emerald-600">{stats.todayCount}</p>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-blue-600">{stats.weekCount}</p>
            <p className="text-xs text-muted-foreground">This Week</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-red-600">{stats.archivedCount}</p>
            <p className="text-xs text-muted-foreground">Archived</p>
          </div>
        </div>

        {/* Timeline */}
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : sortedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No audit events recorded yet.</p>
              <p className="text-xs">Actions will appear here as they happen.</p>
            </div>
          ) : (
            <div className="py-4">
              {sortedLogs.map((entry) => (
                <AuditTimelineEntry
                  key={entry.id}
                  entry={entry}
                  onRestore={onRestoreItem}
                  canRestore={canRestore}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Legend */}
        <div className="pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Action Legend:</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Plus className="h-2.5 w-2.5" /> Added/Created
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <Edit3 className="h-2.5 w-2.5" /> Updated
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">
              <Minus className="h-2.5 w-2.5" /> Deducted
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
              <Archive className="h-2.5 w-2.5" /> Archived
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
              <RotateCcw className="h-2.5 w-2.5" /> Restored
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
