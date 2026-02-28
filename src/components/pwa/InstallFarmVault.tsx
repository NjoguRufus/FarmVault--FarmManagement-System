import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, Download, ExternalLink, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

const MANUAL_INSTRUCTIONS = {
  android: {
    title: "Add to Home Screen (Android)",
    description: "In Chrome, use the browser menu to install:",
    steps: "Menu ⋮ → Install app (or Add to Home screen)",
  },
  iphone: {
    title: "Add to Home Screen (iPhone)",
    description: "In Safari, use the Share menu:",
    steps: "Share → Add to Home Screen",
  },
} as const;

interface InstallFarmVaultProps {
  className?: string;
  /** Compact style for navbar (smaller button, rounded-xl). */
  compact?: boolean;
}

export function InstallFarmVault({ className, compact }: InstallFarmVaultProps) {
  const navigate = useNavigate();
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const [panelOpen, setPanelOpen] = useState(false);
  const [manualTarget, setManualTarget] = useState<"android" | "iphone" | null>(null);
  const isMobile = useIsMobile();

  const handleOpenApp = () => {
    setPanelOpen(false);
    navigate("/dashboard");
  };

  const handleInstallRecommended = async () => {
    const result = await promptInstall();
    if (result === "accepted") {
      toast.success("FarmVault is installing. Open it from your home screen when ready.");
      setPanelOpen(false);
    } else if (result === "dismissed") {
      toast.info("Install cancelled. You can try again from the Install button.");
    }
    if (result !== "unavailable") setPanelOpen(false);
  };

  const handleManualInstructions = (target: "android" | "iphone") => {
    setPanelOpen(false);
    setManualTarget(target);
  };

  const triggerLabel = isInstalled ? "Open FarmVault" : "Install FarmVault";
  const triggerIcon = isInstalled ? <CheckCircle2 className="h-4 w-4" /> : <ChevronDown className="h-4 w-4 opacity-90" />;

  const triggerButton = (
    <Button
      type="button"
      size={compact ? "sm" : "lg"}
      className={cn(
        "gradient-primary text-primary-foreground btn-luxury shadow-luxury transition-transform duration-300 hover:scale-[1.02]",
        compact ? "rounded-xl px-5 h-10 text-sm font-medium" : "rounded-2xl px-7 h-14 text-base font-semibold",
        className,
      )}
    >
      {triggerLabel}
      {!isInstalled && triggerIcon}
      {isInstalled && <ExternalLink className="h-4 w-4 ml-1" />}
    </Button>
  );

  const optionsContent = (
    <div className="space-y-2">
      {canInstall && (
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-start h-auto py-3 rounded-xl font-medium"
          onClick={handleInstallRecommended}
        >
          <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
          Install App (Recommended)
        </Button>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 rounded-xl"
          onClick={() => handleManualInstructions("android")}
        >
          <Smartphone className="h-3.5 w-3.5 mr-1.5" />
          Android
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 rounded-xl"
          onClick={() => handleManualInstructions("iphone")}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          iPhone
        </Button>
      </div>
      <p className="text-xs text-muted-foreground pt-1">
        Manual: use browser menu → Add to Home Screen
      </p>
    </div>
  );

  if (isInstalled) {
    return (
      <>
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
          <CheckCircle2 className="h-4 w-4" />
          Open FarmVault
          <ExternalLink className="h-4 w-4 ml-1" />
        </Button>
        <Dialog open={!!manualTarget} onOpenChange={(open) => !open && setManualTarget(null)}>
          <DialogContent className="max-w-md rounded-2xl">
            {manualTarget && (
              <>
                <DialogHeader>
                  <DialogTitle>{MANUAL_INSTRUCTIONS[manualTarget].title}</DialogTitle>
                  <DialogDescription>{MANUAL_INSTRUCTIONS[manualTarget].description}</DialogDescription>
                </DialogHeader>
                <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm font-medium">
                  {MANUAL_INSTRUCTIONS[manualTarget].steps}
                </p>
              </>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {!isMobile ? (
        <Popover open={panelOpen} onOpenChange={setPanelOpen}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={10}
            className="w-[20rem] rounded-2xl border border-border bg-card p-4 shadow-lg"
          >
            <p className="text-sm font-semibold text-foreground mb-1">Install options</p>
            <p className="text-xs text-muted-foreground mb-4">
              Get the app for a clean icon and standalone experience.
            </p>
            {optionsContent}
          </PopoverContent>
        </Popover>
      ) : (
        <>
          <Button
            type="button"
            size={compact ? "sm" : "lg"}
            onClick={() => setPanelOpen(true)}
            className={cn(
              "gradient-primary text-primary-foreground btn-luxury shadow-luxury",
              compact ? "rounded-xl px-5 h-10 text-sm font-medium" : "rounded-2xl px-7 h-14 text-base font-semibold",
              className,
            )}
          >
            {triggerLabel}
            {triggerIcon}
          </Button>
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetContent side="bottom" className="rounded-t-3xl">
              <SheetHeader className="text-left">
                <SheetTitle>Install FarmVault</SheetTitle>
                <SheetDescription>
                  Choose how to install for a clean home screen icon.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-5">{optionsContent}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      <Dialog open={!!manualTarget} onOpenChange={(open) => !open && setManualTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          {manualTarget && (
            <>
              <DialogHeader>
                <DialogTitle>{MANUAL_INSTRUCTIONS[manualTarget].title}</DialogTitle>
                <DialogDescription>{MANUAL_INSTRUCTIONS[manualTarget].description}</DialogDescription>
              </DialogHeader>
              <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm font-medium">
                {MANUAL_INSTRUCTIONS[manualTarget].steps}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
