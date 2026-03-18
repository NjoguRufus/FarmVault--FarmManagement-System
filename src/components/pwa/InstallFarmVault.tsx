import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Download, ExternalLink, Loader2, Share2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface InstallFarmVaultProps {
  className?: string;
  /** Compact style for navbar (smaller button, rounded-xl). */
  compact?: boolean;
}

export function InstallFarmVault({ className, compact }: InstallFarmVaultProps) {
  const navigate = useNavigate();
  const { canInstall, isInstalled, installState, promptInstall, getFallbackInstructions } = usePwaInstall();
  const [showFallback, setShowFallback] = useState(false);
  const isMobile = useIsMobile();

  const handleOpenApp = () => {
    navigate("/dashboard");
  };

  const handleInstallClick = async () => {
    // If install prompt is available, trigger it directly
    if (canInstall) {
      const result = await promptInstall();
      if (result === "accepted") {
        toast.success("FarmVault installed! Open it from your home screen.");
      } else if (result === "dismissed") {
        toast.info("Install cancelled. You can try again anytime.");
      }
      return;
    }

    // If not available, show fallback instructions
    setShowFallback(true);
  };

  // If already installed, show "Open" button
  if (isInstalled) {
    return (
      <Button
        type="button"
        size={compact ? "sm" : "lg"}
        onClick={handleOpenApp}
        className={cn(
          "gradient-primary text-primary-foreground btn-luxury shadow-luxury transition-transform duration-300 hover:scale-[1.02]",
          compact ? "rounded-xl px-5 h-10 text-sm font-medium" : "rounded-2xl px-7 h-14 text-base font-semibold",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        Open FarmVault
        <ExternalLink className="h-4 w-4 ml-1" />
      </Button>
    );
  }

  const isPrompting = installState === "prompting";
  const fallbackInfo = getFallbackInstructions();

  return (
    <>
      <Button
        type="button"
        size={compact ? "sm" : "lg"}
        onClick={handleInstallClick}
        disabled={isPrompting}
        className={cn(
          "gradient-primary text-primary-foreground btn-luxury shadow-luxury transition-transform duration-300 hover:scale-[1.02]",
          compact ? "rounded-xl px-5 h-10 text-sm font-medium" : "rounded-2xl px-7 h-14 text-base font-semibold",
          className,
        )}
      >
        {isPrompting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Installing...
          </>
        ) : (
          <>
            <Download className="h-4 w-4 mr-2" />
            Install FarmVault
          </>
        )}
      </Button>

      {/* Fallback Instructions Sheet */}
      <Sheet open={showFallback} onOpenChange={setShowFallback}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle>{fallbackInfo?.title || "Install FarmVault"}</SheetTitle>
            <SheetDescription>
              Follow these steps to install FarmVault on your device.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {fallbackInfo?.steps.map((step, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center shrink-0 text-primary-foreground font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-foreground">{step}</p>
                </div>
              </div>
            ))}

            {/* Visual hint for iOS */}
            {fallbackInfo?.title.includes("iPhone") && (
              <div className="mt-6 p-4 bg-secondary/50 rounded-xl flex items-center gap-3">
                <Share2 className="h-6 w-6 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Look for the Share icon at the bottom of Safari
                </p>
              </div>
            )}

            {/* Visual hint for Android */}
            {fallbackInfo?.title.includes("Android") && (
              <div className="mt-6 p-4 bg-secondary/50 rounded-xl flex items-center gap-3">
                <MoreVertical className="h-6 w-6 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Look for the three-dot menu in Chrome
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                Once installed, FarmVault will appear on your home screen and work offline.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
