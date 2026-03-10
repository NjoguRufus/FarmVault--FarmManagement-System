import React from 'react';
import { AlertTriangle, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SeasonChallenge } from '@/types';
import type { ChallengeType } from '@/types';

const CHALLENGE_ICON: Record<string, string> = {
  weather: '🌦️',
  pests: '🐛',
  diseases: '🦠',
  prices: '💰',
  labor: '👷',
  equipment: '🔧',
  other: '⚠️',
};

export interface ProjectChallengesPanelProps {
  challenges: SeasonChallenge[];
  onAddChallenge: () => void;
  onViewAll: () => void;
  /** Limit how many to show in the panel */
  limit?: number;
}

export function ProjectChallengesPanel({
  challenges,
  onAddChallenge,
  onViewAll,
  limit = 5,
}: ProjectChallengesPanelProps) {
  const openChallenges = challenges.filter(
    (c) => String(c.status).toLowerCase() !== 'resolved'
  );
  const toShow = openChallenges.slice(0, limit);

  const getSourceLabel = (challenge: SeasonChallenge): string | null => {
    const source = String((challenge as any).source ?? '');
    if (source === 'preseason-plan') return 'PRE-SEASON';
    if (source === 'field-report') return 'FIELD REPORT';
    return null;
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Season Challenges
        </h3>
        <Button variant="ghost" size="sm" onClick={onAddChallenge}>
          <Plus className="h-4 w-4 mr-1" />
          Add Challenge
        </Button>
      </div>

      {!challenges.length ? (
        <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>No challenges recorded yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {toShow.map((c) => {
            const sourceLabel = getSourceLabel(c);
            return (
              <li
                key={c.id}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm overflow-hidden cursor-pointer hover:bg-muted/40 transition-colors',
                  c.status === 'identified' && 'bg-amber-500/5 border-amber-500/20',
                  c.status === 'mitigating' && 'bg-amber-500/10 border-amber-500/30'
                )}
                onClick={onViewAll}
                role="button"
                aria-label={`View details for challenge ${c.title}`}
              >
                {sourceLabel && (
                  <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 overflow-hidden">
                    <div className="absolute right-[-26px] top-[10px] rotate-45 bg-primary px-6 py-0.5 text-[9px] font-semibold text-primary-foreground shadow-sm tracking-wide">
                      {sourceLabel}
                    </div>
                  </div>
                )}
                <span className="text-lg shrink-0">
                  {CHALLENGE_ICON[c.challengeType as ChallengeType] ?? CHALLENGE_ICON.other}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{c.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                    {c.severity} · {c.status}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {challenges.length > limit && (
        <Button variant="ghost" size="sm" className="w-full" onClick={onViewAll}>
          View All ({challenges.length})
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      )}
    </div>
  );
}
