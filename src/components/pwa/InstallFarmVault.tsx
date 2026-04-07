import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, 
  Download, 
  ExternalLink, 
  Loader2, 
  Share2, 
  MoreVertical, 
  Plus,
  Monitor,
  Smartphone,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { isPwaEnabledHost } from "@/lib/urls/domains";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  logger.log("[PWA Install Button]", ...args);
}

interface InstallFarmVaultProps {
  className?: string;
  /** Compact style for navbar (smaller button, rounded-xl). */
  compact?: boolean;
}

/** Install prompt + fallback UI; only rendered on app.farmvault.africa (and localhost dev). */
export function InstallFarmVault(props: InstallFarmVaultProps) {
  if (!isPwaEnabledHost()) {
    return null;
  }
  return <InstallFarmVaultInner {...props} />;
}

function InstallFarmVaultInner({ className, compact }: InstallFarmVaultProps) {
  const navigate = useNavigate();
  const { 
    canInstall, 
    needsFallback,
    isInstalled, 
    installState, 
    browserInfo,
    promptInstall, 
    getFallbackInstructions,
  } = usePwaInstall();
  const [showFallback, setShowFallback] = useState(false);

  const handleOpenApp = () => {
    navigate("/dashboard");
  };

  const handleInstallClick = async () => {
    log("=== Install button clicked ===");
    log("Current state:", { canInstall, needsFallback, isInstalled, installState, browserInfo });
    
    // If native install prompt is available, trigger it directly
    if (canInstall) {
      log("Native install prompt is available - triggering...");
      const result = await promptInstall();
      log("Native install result:", result);
      
      if (result === "accepted") {
        toast.success("FarmVault installed! Open it from your home screen.");
      } else if (result === "dismissed") {
        toast.info("Install cancelled. You can try again anytime.");
      } else if (result === "unavailable") {
        log("Prompt became unavailable - showing fallback");
        setShowFallback(true);
      }
      return;
    }

    // If browser doesn't support native install, show fallback instructions
    log("Native install NOT available - showing fallback instructions");
    log("Browser:", browserInfo.browser, "Platform:", browserInfo.platform);
    log("Supports beforeinstallprompt:", browserInfo.supportsBeforeInstallPrompt);
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

  // Choose the right icon based on fallback type
  const getFallbackIcon = () => {
    if (!fallbackInfo?.icon) return <MoreVertical className="h-6 w-6 text-primary" />;
    
    switch (fallbackInfo.icon) {
      case "share":
        return <Share2 className="h-6 w-6 text-primary" />;
      case "menu":
        return <MoreVertical className="h-6 w-6 text-primary" />;
      case "plus":
        return <Plus className="h-6 w-6 text-primary" />;
      case "install":
        return <Download className="h-6 w-6 text-primary" />;
      default:
        return <MoreVertical className="h-6 w-6 text-primary" />;
    }
  };

  // Choose platform icon
  const getPlatformIcon = () => {
    if (browserInfo.platform === "ios" || browserInfo.platform === "android") {
      return <Smartphone className="h-5 w-5 text-muted-foreground" />;
    }
    return <Monitor className="h-5 w-5 text-muted-foreground" />;
  };

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
            <            Download className="h-4 w-4 mr-2" />
            Install App
          </>
        )}
      </Button>

      {/* Fallback Instructions Sheet */}
      <Sheet open={showFallback} onOpenChange={setShowFallback}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-2">
              {getPlatformIcon()}
              <SheetTitle>{fallbackInfo?.title || "Install FarmVault"}</SheetTitle>
            </div>
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

            {/* Visual hint with icon */}
            {fallbackInfo?.hint && (
              <div className="mt-6 p-4 bg-secondary/50 rounded-xl flex items-center gap-3">
                {getFallbackIcon()}
                <p className="text-sm text-muted-foreground">
                  {fallbackInfo.hint}
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-border space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Once installed, FarmVault will appear on your home screen and work offline.
              </p>
              {/* Show browser info for debugging in development */}
              {import.meta.env.DEV && (
                <p className="text-[10px] text-muted-foreground/50 text-center font-mono">
                  {browserInfo.browser} on {browserInfo.platform} | 
                  {browserInfo.supportsBeforeInstallPrompt ? " ✓ supports prompt" : " ✗ no prompt support"}
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
