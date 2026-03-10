import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CHALLENGE_ICON: Record<string, string> = {
  weather: '🌦️',
  pests: '🐛',
  diseases: '🦠',
  prices: '💰',
  labor: '👷',
  equipment: '🔧',
  other: '⚠️',
};

export interface ExpectedChallengeItem {
  id: string;
  title: string;
  description?: string;
  challengeType?: string;
  severity?: string;
}

export interface ExpectedChallengesCardProps {
  challenges: ExpectedChallengeItem[];
  onAddChallenge: () => void;
  /** Form or modal content rendered by parent */
  addForm?: React.ReactNode;
}

export function ExpectedChallengesCard({
  challenges,
  onAddChallenge,
  addForm,
}: ExpectedChallengesCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Expected Challenges
        </h2>
        <Button variant="outline" size="sm" onClick={onAddChallenge}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Weather, pests, diseases, operational risks.
      </p>
      {addForm}
      <ul className="space-y-2">
        {challenges.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
          >
            <span className="shrink-0">
              {CHALLENGE_ICON[c.challengeType ?? 'other'] ?? CHALLENGE_ICON.other}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{c.title}</p>
              {c.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
              )}
              {c.severity && (
                <span className="text-xs text-muted-foreground capitalize mt-1 inline-block">
                  {c.severity}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!challenges.length && !addForm && (
        <p className="text-sm text-muted-foreground">No expected challenges added yet.</p>
      )}
    </div>
  );
}
