import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wrench, Receipt, Package, TrendingUp, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const OPTIONS = [
  { label: 'Add expense', path: '/expenses', icon: Receipt },
  { label: 'Plan / Record daily work', path: '/operations', icon: Wrench },
  { label: 'Add inventory item', path: '/inventory', icon: Package },
  { label: 'Record harvest / sales', path: '/harvest-sales', icon: TrendingUp },
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
          size={isMobile ? 'sm' : 'default'}
          className={
            className ||
            (isMobile
              ? 'h-9 gap-1.5 rounded-xl border border-white/20 dark:border-white/10 bg-primary/85 dark:bg-primary/80 backdrop-blur-xl text-primary-foreground shadow-sm hover:bg-primary/90'
              : 'gap-2 rounded-xl border border-white/20 dark:border-white/10 bg-primary/85 dark:bg-primary/80 backdrop-blur-xl text-primary-foreground shadow-sm hover:bg-primary/90')
          }
        >
          <Plus className="h-4 w-4" />
          New Operation
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        {OPTIONS.map(({ label, path, icon: Icon }) => (
          <DropdownMenuItem
            key={path}
            className="gap-2 cursor-pointer rounded-lg"
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
