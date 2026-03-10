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
  /** Optional per-row action area (edit/delete buttons, etc.) */
  renderItemActions?: (item: ExpectedChallengeItem) => React.ReactNode;
}

export function ExpectedChallengesCard({
  challenges,
  onAddChallenge,
  addForm,
  renderItemActions,
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
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{c.title}</p>
              {c.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {c.challengeType && (
                  <span className="rounded-md border border-border/60 bg-background px-2 py-0.5 capitalize">
                    {c.challengeType}
                  </span>
                )}
                {c.severity && (
                  <span className="rounded-md border border-border/60 bg-background px-2 py-0.5 capitalize">
                    Intensity: {c.severity}
                  </span>
                )}
              </div>
            </div>
            {renderItemActions ? (
              <div className="shrink-0 pt-0.5">
                {renderItemActions(c)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {!challenges.length && !addForm && (
        <p className="text-sm text-muted-foreground">No expected challenges added yet.</p>
      )}
    </div>
  );
}
