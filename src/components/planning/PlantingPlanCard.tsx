import React from 'react';
import { Calendar } from 'lucide-react';

export interface PlantingPlanCardProps {
  plantingDate: string | null;
  seedName: string | null;
  seedVariety: string | null;
  fieldNotes: string | null;
  hasPlantingDate: boolean;
  hasSeed: boolean;
  /** Inline form or link to edit – parent controls edit flow */
  children: React.ReactNode;
}

export function PlantingPlanCard({
  plantingDate,
  seedName,
  seedVariety,
  fieldNotes,
  hasPlantingDate,
  hasSeed,
  children,
}: PlantingPlanCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Planting Plan
      </h2>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Planting date</p>
          {hasPlantingDate && plantingDate ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium">{plantingDate}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not set</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Seed / variety</p>
          {hasSeed && (seedName || seedVariety) ? (
            <p className="text-sm font-medium text-foreground">
              {[seedName, seedVariety].filter(Boolean).join(' · ') || '—'}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not set</p>
          )}
        </div>
        {fieldNotes && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Field notes</p>
            <p className="text-sm text-foreground">{fieldNotes}</p>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
