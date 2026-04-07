import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFarmerSmartInbox } from '@/hooks/useFarmerSmartInbox';

type Props = {
  companyId: string | null;
  clerkUserId: string | null;
};

export function FarmerSmartMessageBanner({ companyId, clerkUserId }: Props) {
  const { latestVisible, dismiss, dismissing } = useFarmerSmartInbox(companyId, clerkUserId);

  if (!latestVisible) return null;

  return (
    <div className="relative rounded-xl border border-emerald-700/25 bg-gradient-to-r from-emerald-950/20 via-card to-card px-4 py-3 pr-12 shadow-sm dark:from-emerald-950/40">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        Farm assistant
      </p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
        {latestVisible.body}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-foreground"
        disabled={dismissing}
        onClick={() => dismiss(latestVisible.id)}
        aria-label="Dismiss message"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
