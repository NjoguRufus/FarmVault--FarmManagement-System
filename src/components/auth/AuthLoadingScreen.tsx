import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

interface AuthLoadingScreenProps {
  message?: string;
}

export function AuthLoadingScreen({ message = "Loading.." }: AuthLoadingScreenProps) {
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return 92;
        }
        return current + 6;
      });
    }, 180);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-muted-foreground">{message}</p>
        <Progress value={progress} className="h-2" />
        <img
          src="/Logo/FarmVault_Logo dark mode.png"
          alt="FarmVault logo"
          className="mx-auto h-14 w-auto object-contain"
        />
      </div>
    </div>
  );
}
