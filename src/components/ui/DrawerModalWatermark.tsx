import * as React from "react";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/Logo/FarmVault_Logo dark mode.png";

export function DrawerModalWatermark({
  className,
  /** "top" = top-centered (modals); "center" = centered (drawers) */
  position = "center",
}: {
  className?: string;
  position?: "center" | "top";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 flex justify-center overflow-hidden",
        position === "top" ? "items-start pt-4" : "items-center",
        className
      )}
    >
      <img
        src={LOGO_SRC}
        alt=""
        className={cn(
          "w-auto max-w-[40%] select-none opacity-[0.06] dark:opacity-[0.08]",
          position === "top" ? "h-14" : "h-24"
        )}
        draggable={false}
      />
    </div>
  );
}
