import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Wrench, Receipt, Package, TrendingUp, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Each path opens the target page with a query that triggers the add modal directly. */
const OPTIONS = [
  { label: 'Add expense', path: '/expenses?add=1', icon: Receipt },
  { label: 'Plan / Record daily work', path: '/operations?add=1', icon: Wrench },
  { label: 'Add inventory item', path: '/inventory?add=1', icon: Package },
  { label: 'Record harvest', path: '/harvest-sales?harvest=1', icon: TrendingUp },
  { label: 'Add sale', path: '/harvest-sales?sale=1', icon: TrendingUp },
  { label: 'Add project', path: '/projects/new', icon: FolderPlus },
] as const;

interface NewOperationMenuProps {
  variant?: 'default' | 'mobile';
  className?: string;
}

export function NewOperationMenu({ variant = 'default', className = '' }: NewOperationMenuProps) {
  const navigate = useNavigate();

  const isMobile = variant === 'mobile';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-tour="new-operation-button"
          size={isMobile ? 'sm' : 'default'}
          className={
            className ||
            (isMobile
              ? 'h-9 gap-1.5 rounded-md border border-white/20 dark:border-white/10 bg-primary/85 dark:bg-primary/80 backdrop-blur-xl text-primary-foreground shadow-sm hover:bg-primary/90'
              : 'gap-2 rounded-md border border-white/20 dark:border-white/10 bg-primary/85 dark:bg-primary/80 backdrop-blur-xl text-primary-foreground shadow-sm hover:bg-primary/90')
          }
        >
          <Zap className="h-4 w-4" />
          Quick Access
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-md">
        {OPTIONS.map(({ label, path, icon: Icon }) => (
          <DropdownMenuItem
            key={label}
            className="gap-2 cursor-pointer rounded-md"
            onSelect={() => navigate(path)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
