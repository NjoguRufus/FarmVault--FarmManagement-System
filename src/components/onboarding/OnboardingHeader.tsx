import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface OnboardingHeaderProps {
  title: string;
  subtitle?: string;
  step: number;
  totalSteps: number;
  className?: string;
}

export function OnboardingHeader({
  title,
  subtitle,
  step,
  totalSteps,
  className,
}: OnboardingHeaderProps) {
  const progress = (step / totalSteps) * 100;

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Step {step} of {totalSteps}
      </p>
      <Progress value={progress} className="h-2 rounded-full" />
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
