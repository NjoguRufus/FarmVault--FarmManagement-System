import { FC } from 'react';
import type { WorkCard } from '@/services/operationsWorkCardService';
import { WorkCardItem } from './WorkCardItem';

interface WorkCardsListProps {
  workCards: WorkCard[];
  onView: (card: WorkCard) => void;
  onEdit: (card: WorkCard) => void;
  onApprove: (card: WorkCard) => void;
  onReject: (card: WorkCard) => void;
  onMarkPaid: (card: WorkCard) => void;
}

export const WorkCardsList: FC<WorkCardsListProps> = ({
  workCards,
  onView,
  onEdit,
  onApprove,
  onReject,
  onMarkPaid,
}) => {
  if (!workCards.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No work cards found. Try adjusting your filters or creating a new card.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {workCards.map((card) => (
        <WorkCardItem
          key={card.id}
          card={card}
          onView={() => onView(card)}
          onEdit={() => onEdit(card)}
          onApprove={() => onApprove(card)}
          onReject={() => onReject(card)}
          onMarkPaid={() => onMarkPaid(card)}
        />
      ))}
    </div>
  );
};

