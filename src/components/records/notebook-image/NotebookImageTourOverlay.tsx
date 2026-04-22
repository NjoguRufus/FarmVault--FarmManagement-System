import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/**
 * One-time mini tour shown on first image tap (per device).
 */
export function NotebookImageTourOverlay({ className }: Props) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[5] flex flex-col justify-end rounded-[inherit] p-3",
        "bg-gradient-to-t from-black/75 via-black/35 to-transparent",
        className,
      )}
      aria-hidden
    >
      <ul className="space-y-1.5 text-[11px] font-medium leading-snug text-white/95 drop-shadow-sm sm:text-xs">
        <li>Tap again to expand 🔍</li>
        <li>Long press to move ✋</li>
        <li>⋯ for more options</li>
      </ul>
    </div>
  );
}
