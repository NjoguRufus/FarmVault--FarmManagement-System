import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface OnboardingNavButtonsProps {
  onBack?: () => void;
  onContinue: () => void;
  backLabel?: string;
  continueLabel: string;
  canContinue: boolean;
  isLoading?: boolean;
  showBack?: boolean;
}

export function OnboardingNavButtons({
  onBack,
  onContinue,
  backLabel = 'Back',
  continueLabel = 'Continue',
  canContinue,
  isLoading = false,
  showBack = true,
}: OnboardingNavButtonsProps) {
  return (
    <div className="flex items-center justify-between gap-4 pt-6">
      {showBack && onBack ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isLoading}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Button>
      ) : (
        <div />
      )}
      <Button
        type="button"
        onClick={onContinue}
        disabled={!canContinue || isLoading}
        className="gap-2 min-w-[120px]"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            {continueLabel}
            <ChevronRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
