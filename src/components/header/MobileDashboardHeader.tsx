import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wrench, Receipt, TrendingUp, FolderPlus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getGreetingText } from '@/lib/getTimeGreeting';
import { ConnectivityStatusPill } from '@/components/status/ConnectivityStatusPill';
import { Project } from '@/types';

const NEW_OPERATION_OPTIONS = [
  { label: 'Log work', path: '/operations', icon: Wrench },
  { label: 'Add expense', path: '/expenses', icon: Receipt },
  { label: 'Record harvest', path: '/harvest-sales', icon: TrendingUp },
  { label: 'New project', path: '/projects/new', icon: FolderPlus },
] as const;

interface MobileDashboardHeaderProps {
  firstName: string | null;
  projects: Project[];
  selectedProjectId: string | null;
  onProjectChange: (projectId: string) => void;
}

export function MobileDashboardHeader({
  firstName,
  projects,
  selectedProjectId,
  onProjectChange,
}: MobileDashboardHeaderProps) {
  const navigate = useNavigate();
  const greeting = getGreetingText(firstName);
  const projectFilterValue = selectedProjectId || 'all';

  return (
    <div className="space-y-3">
      {/* Greeting + status */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{greeting}</h2>
        <ConnectivityStatusPill />
      </div>

      {/* Project selector (left) + New Operation button (right) */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={projectFilterValue} onValueChange={onProjectChange}>
          <SelectTrigger className="h-9 flex-1 min-w-0 max-w-[180px] sm:max-w-[200px] rounded-xl border border-white/20 dark:border-white/10 bg-white/60 dark:bg-black/40 backdrop-blur-xl text-sm shadow-sm">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-9 gap-1.5 rounded-xl border border-white/20 dark:border-white/10 bg-primary/85 dark:bg-primary/80 backdrop-blur-xl text-primary-foreground shadow-sm hover:bg-primary/90 hover:backdrop-blur-xl"
            >
              <Plus className="h-4 w-4" />
              New Operation
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            {NEW_OPERATION_OPTIONS.map(({ label, path, icon: Icon }) => (
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
      </div>
    </div>
  );
}
