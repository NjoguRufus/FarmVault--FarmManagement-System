import React from "react";
import { Lock, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface NewFeatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isProEligible: boolean;
  onPrimary: () => void;
}

export function NewFeatureModal({
  open,
  onOpenChange,
  isProEligible,
  onPrimary,
}: NewFeatureModalProps) {
  const title = "New: App Lock 🔒";

  const handleMaybeLater = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] p-6 space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Add an extra lock to FarmVault with a PIN. If your phone supports it,
                you can also use fingerprint / Face ID.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="space-y-1.5 text-sm text-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Stops other people from opening your farm records</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Locks automatically when you step away</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Works even when offline</span>
          </li>
        </ul>

        <div className="space-y-2">
          <Button
            type="button"
            className="w-full flex items-center justify-center gap-2"
            onClick={onPrimary}
          >
            <Lock className="h-4 w-4" />
            <span>{isProEligible ? "Enable App Lock" : "Upgrade to Pro"}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={handleMaybeLater}
          >
            Maybe later
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          You&apos;ll only see this once for this feature.
        </p>
      </DialogContent>
    </Dialog>
  );
}

