import React from 'react';
import { cn } from '@/lib/utils';

/** Responsive metric grids: 2 columns on small phones, scale up on larger breakpoints. */
const COLS: Record<'2' | '3' | '4' | '5' | '6', string> = {
  '2': 'grid grid-cols-2 gap-2.5 sm:gap-3',
  '3': 'grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3',
  '4': 'grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4',
  '5': 'grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5',
  '6': 'grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6',
};

export function DeveloperStatGrid({
  cols,
  className,
  children,
}: {
  cols: keyof typeof COLS;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(COLS[cols], className)}>{children}</div>;
}
