import React, { useState } from 'react';
import { Clock, CheckCircle, Edit, Banknote, Calendar, User, Package, Cloud, Droplets, Bug, Tractor, Leaf, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import type { WorkCard, WorkCardStatus } from '@/services/operationsWorkCardService';
import { MarkPaidModal } from './MarkPaidModal';

interface StatusConfig {
  label: string;
  color: string;
  icon: React.ReactNode;
}

interface WorkCardGridProps {
  cards: WorkCard[];
  isLoading?: boolean;
  onCardClick?: (card: WorkCard) => void;
  statusConfig: Record<WorkCardStatus, StatusConfig>;
  onMarkPaidSuccess?: () => void;
}

export function WorkCardGrid({ cards, isLoading, onCardClick, statusConfig, onMarkPaidSuccess }: WorkCardGridProps) {
  const { can } = usePermissions();
  const canMarkPaid = can('operations', 'markPaid');
  const [markPaidCard, setMarkPaidCard] = useState<WorkCard | null>(null);
  const getWorkCategoryIcon = (category: string) => {
    const normalized = (category || '').toLowerCase();
    if (normalized.includes('spray')) return Cloud;
    if (normalized.includes('fertilizer') || normalized.includes('fertiliser')) return Leaf;
    if (normalized.includes('water')) return Droplets;
    if (normalized.includes('weed')) return Tractor;
    if (normalized.includes('land preparation') || normalized.includes('land prep')) return Tractor;
    if (normalized.includes('plant')) return Leaf;
    if (normalized.includes('harvest')) return Package;
    if (normalized.includes('pest')) return Bug;
    return Wrench;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-1">No work cards found</h3>
          <p className="text-sm text-muted-foreground">
            Create a new work card to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card) => {
        const config = statusConfig[card.status];
        const hasInputs = card.inputsUsed && card.inputsUsed.length > 0;
        const isEdited = card.status === 'edited' || (card.editHistory && card.editHistory.length > 0);
        const CategoryIcon = getWorkCategoryIcon(card.workCategory);
        const showMarkPaidOnCard =
          canMarkPaid &&
          (card.status === 'logged' || card.status === 'edited') &&
          !card.payment.isPaid;

        return (
          <Card
            key={card.id}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
              'relative overflow-hidden'
            )}
            onClick={() => onCardClick?.(card)}
          >
            {/* Status watermark */}
            <div className={cn(
              'absolute top-0 right-0 px-3 py-1 text-xs font-medium rounded-bl-lg',
              config.color
            )}>
              {config.label}
            </div>

            <CardContent className="p-4 pt-8">
              <div className="space-y-3">
                {/* Title and Category */}
                <div>
                  <h3 className="font-semibold text-base line-clamp-1 pr-16">
                    {card.workTitle}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <CategoryIcon className="h-3.5 w-3.5" />
                    {card.workCategory}
                  </p>
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(card.plannedDate)}
                  </div>
                  {card.allocatedWorkerName && (
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {card.allocatedWorkerName}
                    </div>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {isEdited && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                      <Edit className="h-3 w-3 mr-1" />
                      Edited
                    </Badge>
                  )}
                  {hasInputs && (
                    <Badge variant="outline" className="text-teal-600 border-teal-300 bg-teal-50">
                      <Package className="h-3 w-3 mr-1" />
                      {card.inputsUsed.length} input{card.inputsUsed.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {card.payment.isPaid && (
                    <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">
                      <Banknote className="h-3 w-3 mr-1" />
                      KSh {(card.payment.amount ?? 0).toLocaleString()}
                    </Badge>
                  )}
                </div>

                {/* Actual work summary (if logged) */}
                {card.status !== 'planned' && card.workDone && (
                  <p className="text-sm text-muted-foreground line-clamp-2 border-t pt-2 mt-2">
                    {card.workDone}
                  </p>
                )}

                {showMarkPaidOnCard && (
                  <Button
                    variant="secondary"
                    className="w-full mt-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMarkPaidCard(card);
                    }}
                  >
                    <Banknote className="h-4 w-4 mr-2" />
                    Mark as paid
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>

    <MarkPaidModal
      open={markPaidCard !== null}
      onOpenChange={(open) => {
        if (!open) setMarkPaidCard(null);
      }}
      workCard={markPaidCard}
      onSuccess={() => {
        setMarkPaidCard(null);
        onMarkPaidSuccess?.();
      }}
    />
    </>
  );
}
