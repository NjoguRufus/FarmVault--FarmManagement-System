import { useState, useEffect } from "react";
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
  Package,
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
import { canInstall as nativeInstallReady, waitForDeferredPrompt } from "@/lib/pwa-install";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { isMarketingProductionHost, getAppBaseUrl } from "@/lib/urls/domains";

const APK_DOWNLOAD_URL = "/downloads/farmvault.apk";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  logger.log("[PWA Install Button]", ...args);
}

interface InstallFarmVaultProps {
  className?: string;
  /** Compact style for navbar (smaller button, rounded-xl). */
  compact?: boolean;
}

/** Install prompt + fallback UI. Rendered only on app.farmvault.africa (and localhost). */
export function InstallFarmVault(props: InstallFarmVaultProps) {
  return <InstallFarmVaultInner {...props} />;
}

function InstallFarmVaultInner({ className, compact }: InstallFarmVaultProps) {
  const navigate = useNavigate();
  const { isInstalled, installState, canInstall, browserInfo, promptInstall, getFallbackInstructions } = usePwaInstall();
  const [showFallback, setShowFallback] = useState(false);
  const [showApkFallback, setShowApkFallback] = useState(false);

  // APK is viable on any non-iOS platform
  const isApkViable = browserInfo.platform !== "ios";

  // Show APK button when the native install prompt won't be available
  useEffect(() => {
    if (isInstalled || !isApkViable) return;

    // Immediately show for browsers that definitively don't support beforeinstallprompt
    if (!browserInfo.supportsBeforeInstallPrompt) {
      setShowApkFallback(true);
      return;
    }

    // For Chromium browsers: wait 1.5s to see if the prompt fires before showing APK
    const timer = setTimeout(() => {
      setShowApkFallback(true);
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide APK button when the native install prompt becomes available
  useEffect(() => {
    if (canInstall) setShowApkFallback(false);
  }, [canInstall]);

  const handleApkDownload = () => {
    window.location.href = APK_DOWNLOAD_URL;
  };

  const handleOpenApp = () => {
    navigate("/home");
  };

  const handleInstallClick = async () => {
    log("=== Install FarmVault clicked ===", { nativeReady: nativeInstallReady(), installState, browserInfo });

    // On the marketing site (farmvault.africa) the manifest is blocked and
    // beforeinstallprompt will never fire. Redirect to the app subdomain
    // with ?install=true so the real PWA host handles the install prompt.
    if (isMarketingProductionHost()) {
      window.location.href = `${getAppBaseUrl()}?install=true`;
      return;
    }

    // Never show the manual sheet while we are about to use the native dialog
    setShowFallback(false);

    let ready = nativeInstallReady();
    if (!ready && browserInfo.supportsBeforeInstallPrompt && installState !== "unsupported") {
      ready = await waitForDeferredPrompt(10_000);
    }

    if (ready) {
      log("Opening native install prompt (prompt + userChoice)");
      const result = await promptInstall();
      log("Native install result:", result);

      if (result === "accepted") {
        toast.success("FarmVault installed! Open it from your home screen.");
      } else if (result === "dismissed") {
        toast.info("Install cancelled. You can try again anytime.");
      } else if (result === "unavailable") {
        setShowFallback(true);
      }
      return;
    }

    log("No deferred install event — showing fallback instructions");
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

  // Determine which primary action to show:
  // - canInstall → native browser install prompt available
  // - iOS/macOS Safari → show install button that opens manual instructions Sheet
  // - Otherwise → APK download (after 1.5s timeout)
  const isIosOrSafari =
    browserInfo.platform === "ios" ||
    (browserInfo.platform === "macos" && browserInfo.browser === "safari");
  const showInstallButton = canInstall || isIosOrSafari;
  const showApkButton = showApkFallback && !canInstall && !isInstalled && isApkViable && !isIosOrSafari;

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
      {/* Native install button — only shown when prompt is ready or iOS/Safari needs Sheet instructions */}
      {showInstallButton && (
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
      )}

      {/* APK download fallback — shown after 1.5s when native install is unavailable */}
      {showApkButton && (
        <Button
          type="button"
          size={compact ? "sm" : "lg"}
          onClick={handleApkDownload}
          variant="outline"
          className={cn(
            "btn-luxury shadow-luxury transition-transform duration-300 hover:scale-[1.02] border-primary text-primary hover:bg-primary/10",
            compact ? "rounded-xl px-5 h-10 text-sm font-medium" : "rounded-2xl px-7 h-14 text-base font-semibold",
            className,
          )}
        >
          <Package className="h-4 w-4 mr-2" />
          Download APK
        </Button>
      )}

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

              {/* APK option inside the sheet for non-iOS browsers */}
              {isApkViable && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground text-center mb-2">Or install directly via APK:</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleApkDownload}
                    className="w-full rounded-xl border-primary text-primary hover:bg-primary/10"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Download FarmVault APK
                  </Button>
                </div>
              )}

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
