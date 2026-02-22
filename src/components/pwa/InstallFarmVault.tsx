import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Download, MonitorSmartphone, Smartphone } from "lucide-react";

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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

type InstructionTarget = "this-device" | "android" | "iphone" | null;

interface InstallFarmVaultProps {
  className?: string;
}

const instructionCopy: Record<Exclude<InstructionTarget, null>, {
  title: string;
  description: string;
  helper: string;
}> = {
  "this-device": {
    title: "Install on this device",
    description: "Automatic install prompt is unavailable in this browser session.",
    helper: "Use your browser menu \u2192 Add to Home Screen",
  },
  android: {
    title: "Install on Android",
    description: "Open FarmVault in Chrome, then follow these steps:",
    helper: "Chrome \u2192 \u22ee menu \u2192 Add to Home screen \u2192 Install",
  },
  iphone: {
    title: "Install on iPhone",
    description: "Open FarmVault in Safari, then follow these steps:",
    helper: "Safari \u2192 Share button \u2192 Add to Home Screen",
  },
};

export function InstallFarmVault({ className }: InstallFarmVaultProps) {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [instructionsFor, setInstructionsFor] = useState<InstructionTarget>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const isMobile = useIsMobile();
  const promptInProgressRef = useRef(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      setIsOpen(false);
      setInstructionsFor(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const activeInstruction = useMemo(
    () => (instructionsFor ? instructionCopy[instructionsFor] : null),
    [instructionsFor],
  );

  const openInstructions = (target: Exclude<InstructionTarget, null>) => {
    setIsOpen(false);
    setInstructionsFor(target);
  };

  const promptInstall = async (fallbackTarget: Exclude<InstructionTarget, null>) => {
    if (promptInProgressRef.current) {
      return;
    }

    if (!installPromptEvent) {
      openInstructions(fallbackTarget);
      return;
    }

    promptInProgressRef.current = true;
    setIsOpen(false);

    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
    } catch {
      openInstructions(fallbackTarget);
    } finally {
      promptInProgressRef.current = false;
      setInstallPromptEvent(null);
    }
  };

  const handleInstallOnThisDevice = () => {
    void promptInstall("this-device");
  };

  const handleInstallAndroid = () => {
    if (installPromptEvent) {
      void promptInstall("android");
      return;
    }
    openInstructions("android");
  };

  const handleInstallIphone = () => {
    openInstructions("iphone");
  };

  const options = (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={handleInstallOnThisDevice}
        className="group flex w-full items-start gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/[0.03] px-4 py-3 text-left transition-all duration-300 hover:scale-[1.01] hover:border-gold/40 hover:bg-primary-foreground/[0.1]"
      >
        <MonitorSmartphone className="mt-0.5 h-4 w-4 text-gold" />
        <span className="space-y-1">
          <span className="block text-sm font-semibold text-primary-foreground">Install on this device</span>
          <span className="block text-xs text-primary-foreground/70">
            Primary option. Uses native prompt when available.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={handleInstallAndroid}
        className="group flex w-full items-start gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/[0.03] px-4 py-3 text-left transition-all duration-300 hover:scale-[1.01] hover:border-gold/40 hover:bg-primary-foreground/[0.1]"
      >
        <Smartphone className="mt-0.5 h-4 w-4 text-gold" />
        <span className="space-y-1">
          <span className="block text-sm font-semibold text-primary-foreground">Install on Android</span>
          <span className="block text-xs text-primary-foreground/70">
            Prompts install if supported, otherwise shows Chrome steps.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={handleInstallIphone}
        className="group flex w-full items-start gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/[0.03] px-4 py-3 text-left transition-all duration-300 hover:scale-[1.01] hover:border-gold/40 hover:bg-primary-foreground/[0.1]"
      >
        <Download className="mt-0.5 h-4 w-4 text-gold" />
        <span className="space-y-1">
          <span className="block text-sm font-semibold text-primary-foreground">Install on iPhone</span>
          <span className="block text-xs text-primary-foreground/70">
            Opens Safari instructions for Add to Home Screen.
          </span>
        </span>
      </button>
    </div>
  );

  const triggerButton = (
    <Button
      type="button"
      size="lg"
      className={cn(
        "gradient-primary text-primary-foreground btn-luxury rounded-2xl px-7 h-14 text-base font-semibold shadow-luxury transition-transform duration-300 hover:scale-[1.02]",
        className,
      )}
    >
      {isInstalled ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          FarmVault Installed
        </>
      ) : (
        <>
          Install FarmVault
          <ChevronDown className="h-4 w-4 opacity-90" />
        </>
      )}
    </Button>
  );

  return (
    <>
      {!isMobile && !isInstalled ? (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={10}
            className="w-[22rem] rounded-2xl border border-gold/25 bg-[hsl(150_30%_10%/0.97)] p-4 text-primary-foreground shadow-luxury backdrop-blur-xl"
          >
            <p className="mb-1 text-sm font-semibold text-primary-foreground">Install FarmVault</p>
            <p className="mb-4 text-xs text-primary-foreground/70">
              Choose your install path for fast access from your home screen.
            </p>
            {options}
          </PopoverContent>
        </Popover>
      ) : (
        <Button
          type="button"
          size="lg"
          onClick={() => setIsOpen(true)}
          disabled={isInstalled}
          className={cn(
            "gradient-primary text-primary-foreground btn-luxury rounded-2xl px-7 h-14 text-base font-semibold shadow-luxury transition-transform duration-300 hover:scale-[1.02]",
            className,
          )}
        >
          {isInstalled ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              FarmVault Installed
            </>
          ) : (
            <>
              Install FarmVault
              <ChevronDown className="h-4 w-4 opacity-90" />
            </>
          )}
        </Button>
      )}

      <Sheet open={isMobile && isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-gold/25 bg-[hsl(150_30%_10%/0.98)] px-5 pb-8 pt-6 text-primary-foreground shadow-luxury"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-primary-foreground">Install FarmVault</SheetTitle>
            <SheetDescription className="text-primary-foreground/70">
              Choose your preferred install option.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-5">{options}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={instructionsFor !== null} onOpenChange={(open) => !open && setInstructionsFor(null)}>
        <DialogContent className="max-w-md rounded-2xl border border-gold/20 bg-[hsl(150_30%_10%/0.97)] text-primary-foreground shadow-luxury">
          <DialogHeader>
            <DialogTitle className="text-primary-foreground">{activeInstruction?.title}</DialogTitle>
            <DialogDescription className="text-primary-foreground/70">
              {activeInstruction?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/[0.05] px-4 py-3 text-sm font-medium text-primary-foreground/90">
            {activeInstruction?.helper}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
