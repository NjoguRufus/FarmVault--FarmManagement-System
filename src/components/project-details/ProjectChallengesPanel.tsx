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
          {toShow.map((c) => (
            <li
              key={c.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm',
                c.status === 'identified' && 'bg-amber-500/5 border-amber-500/20',
                c.status === 'mitigating' && 'bg-amber-500/10 border-amber-500/30'
              )}
            >
              <span className="text-lg shrink-0">
                {CHALLENGE_ICON[c.challengeType as ChallengeType] ?? CHALLENGE_ICON.other}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {c.severity} · {c.status}
                </p>
              </div>
            </li>
          ))}
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
