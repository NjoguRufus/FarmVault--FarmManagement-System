import { FC } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { WorkCardStatus } from '@/services/operationsWorkCardService';

export interface WorkCardsFilterValue {
  projectId: string | null;
  stageName: string | null;
  managerId: string | null;
  status: WorkCardStatus | 'all';
  search: string;
}

interface WorkCardsFilterBarProps {
  projects: { id: string; name: string }[];
  stages: string[];
  managers: { id: string; name: string }[];
  value: WorkCardsFilterValue;
  onChange: (next: WorkCardsFilterValue) => void;
  onCreateWorkCard?: () => void;
  canCreateWorkCard?: boolean;
}

export const WorkCardsFilterBar: FC<WorkCardsFilterBarProps> = ({
  projects,
  stages,
  managers,
  value,
  onChange,
  onCreateWorkCard,
  canCreateWorkCard = false,
}) => {
  const setField = <K extends keyof WorkCardsFilterValue>(key: K, v: WorkCardsFilterValue[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3 border-b border-border pb-3 mb-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Operations – Work Cards</h1>
        {canCreateWorkCard && (
          <Button size="sm" onClick={onCreateWorkCard}>
            + Create Work Card
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={value.projectId ?? 'all'}
          onValueChange={(v) => setField('projectId', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.stageName ?? 'all'}
          onValueChange={(v) => setField('stageName', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.managerId ?? 'all'}
          onValueChange={(v) => setField('managerId', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Manager" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All managers</SelectItem>
            {managers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.status}
          onValueChange={(v) => setField('status', v as WorkCardStatus | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by title or category"
            value={value.search}
            onChange={(e) => setField('search', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

