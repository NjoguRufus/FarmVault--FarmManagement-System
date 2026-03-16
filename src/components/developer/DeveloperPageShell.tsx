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
  searchPlaceholder,
  searchValue,
  onSearchChange,
  children,
}: DeveloperPageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {onSearchChange && (
            <div className="w-full sm:w-64">
              <Input
                placeholder={searchPlaceholder ?? 'Search…'}
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-9"
              />
            </div>
          )}
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RotateCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
              <span className="text-xs font-medium">
                {isRefetching ? 'Refreshing…' : 'Refresh'}
              </span>
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

