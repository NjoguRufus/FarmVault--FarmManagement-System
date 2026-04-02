import React from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DeveloperPageShellProps {
  title: string;
  description?: string;
  isLoading?: boolean;
  isRefetching?: boolean;
  onRefresh?: () => void;
  /** Renders in the header toolbar row next to Refresh (e.g. secondary links). */
  toolbarEnd?: React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  children: React.ReactNode;
}

export function DeveloperPageShell({
  title,
  description,
  isLoading,
  isRefetching,
  onRefresh,
  toolbarEnd,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  children,
}: DeveloperPageShellProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl leading-relaxed">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
          {onSearchChange && (
            <div className="w-full min-w-0 sm:w-64">
              <Input
                placeholder={searchPlaceholder ?? 'Search…'}
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-9"
              />
            </div>
          )}
          {(toolbarEnd || onRefresh) && (
            <div className="flex flex-row flex-wrap items-center gap-2 justify-end w-full sm:w-auto min-w-0">
              {toolbarEnd}
              {onRefresh && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="gap-1.5 shrink-0"
                >
                  <RotateCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-medium">
                    {isRefetching ? 'Refreshing…' : 'Refresh'}
                  </span>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

