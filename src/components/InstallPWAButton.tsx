/**
 * @deprecated This component is DEPRECATED.
 * 
 * Use <InstallFarmVault /> from "@/components/pwa/InstallFarmVault" instead.
 * 
 * This legacy component has its own event listeners which compete with the
 * global PWA install module (src/lib/pwa-install.ts). The global module
 * captures beforeinstallprompt EARLY (before React mounts) to ensure we
 * don't miss the event.
 * 
 * DO NOT USE THIS COMPONENT - it may cause the install prompt to fail.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface InstallPWAButtonProps {
  className?: string;
}

/**
 * @deprecated Use <InstallFarmVault /> instead. See module comment above.
 */
export function InstallPWAButton({ className }: InstallPWAButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(isStandalone);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (installed || !deferredPrompt) {
    return null;
  }

  return (
    <Button type="button" size="sm" variant="outline" className={className} onClick={handleInstall}>
      Install App
    </Button>
  );
}
