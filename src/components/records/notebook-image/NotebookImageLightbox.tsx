import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal, Pencil, Redo2, Trash2, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function touchDistance(t: TouchList) {
  if (t.length < 2) return 0.0001;
  const a = t[0];
  const b = t[1];
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 0.0001;
}

function touchAngleDeg(t: TouchList) {
  if (t.length < 2) return 0;
  const a = t[0];
  const b = t[1];
  return (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  previewName: string;
  rotation: number;
  onRotationDelta: (deltaDeg: number) => void;
  onAbsoluteRotation?: (rotationDeg: number) => void;
  onRequestRemove: () => void;
};

export function NotebookImageLightbox({
  open,
  onOpenChange,
  imageUrl,
  previewName,
  rotation,
  onRotationDelta,
  onAbsoluteRotation,
  onRequestRemove,
}: Props) {
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const lightboxTwoFingerRef = useRef<{ d0: number; a0: number; r0: number; s0: number } | null>(null);
  const lightboxScaleRef = useRef(1);
  lightboxScaleRef.current = lightboxScale;
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;
  const lightboxViewportRef = useRef<HTMLDivElement | null>(null);

  const closeModal = useCallback(() => {
    setMenuOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const setRotationAbsolute = useCallback(
    (r: number) => {
      if (onAbsoluteRotation) {
        onAbsoluteRotation((r + 360) % 360);
      } else {
        const delta = r - rotationRef.current;
        let d = delta;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        onRotationDelta(d);
      }
    },
    [onAbsoluteRotation, onRotationDelta],
  );

  useEffect(() => {
    if (!open) {
      setLightboxScale(1);
      lightboxTwoFingerRef.current = null;
      setIsEditingImage(false);
      setMenuOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const options = { passive: false } as const;
    let target: HTMLDivElement | null = null;
    let alive = true;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setLightboxScale((s) => clamp(s * (e.deltaY > 0 ? 0.9 : 1.1), 0.2, 6));
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const t = e.touches;
      lightboxTwoFingerRef.current = {
        d0: touchDistance(t),
        a0: touchAngleDeg(t),
        r0: rotationRef.current,
        s0: lightboxScaleRef.current,
      };
    };

    const onMove = (e: TouchEvent) => {
      const g = lightboxTwoFingerRef.current;
      if (!g || e.touches.length < 2) return;
      e.preventDefault();
      const t = e.touches;
      const d1 = touchDistance(t);
      const a1 = touchAngleDeg(t);
      let da = a1 - g.a0;
      while (da > 180) da -= 360;
      while (da < -180) da += 360;
      setRotationAbsolute(g.r0 + da);
      setLightboxScale(clamp(g.s0 * (d1 / g.d0), 0.2, 6));
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lightboxTwoFingerRef.current = null;
      }
    };

    const bind = () => {
      if (!alive) return;
      target = lightboxViewportRef.current;
      if (!target) return;
      target.addEventListener("wheel", onWheel, options);
      target.addEventListener("touchstart", onStart, options);
      target.addEventListener("touchmove", onMove, options);
      target.addEventListener("touchend", onEnd, options);
      target.addEventListener("touchcancel", onEnd, options);
    };
    const tid = window.setTimeout(bind, 0);

    return () => {
      alive = false;
      clearTimeout(tid);
      if (target) {
        target.removeEventListener("wheel", onWheel, options);
        target.removeEventListener("touchstart", onStart, options);
        target.removeEventListener("touchmove", onMove, options);
        target.removeEventListener("touchend", onEnd, options);
        target.removeEventListener("touchcancel", onEnd, options);
      }
    };
  }, [open, setRotationAbsolute]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "fv-attachment-lightbox-dialog !z-[102] !flex !max-h-[min(85vh,calc(100vh-2rem))] !w-full !max-w-[min(920px,calc(100vw-2rem))] !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !rounded-xl !border !border-white/10 !bg-zinc-950 !p-0 !shadow-2xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:duration-200 data-[state=closed]:duration-150",
        )}
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        aria-describedby="fv-notebook-lightbox-desc"
      >
        <DialogTitle className="sr-only">View image</DialogTitle>
        <DialogDescription id="fv-notebook-lightbox-desc" className="sr-only">
          Two-finger pinch to zoom and rotate. Ctrl or Command and scroll to zoom. Use the more menu for edit and remove.
        </DialogDescription>

        {/* Chrome row: never overlaps the image — keeps X / ⋯ reliably clickable */}
        <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-zinc-950 px-2 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {isEditingImage ? (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/25 bg-zinc-900/90 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                onClick={() => setIsEditingImage(false)}
              >
                <Check className="h-4 w-4" />
                Done
              </button>
            ) : (
              <span className="truncate pl-1 text-xs font-medium text-zinc-400">{previewName}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-zinc-900/90 text-white shadow-sm transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  aria-label="More options"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="z-[200] w-48"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() => {
                    setIsEditingImage(true);
                    setMenuOpen(false);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() => {
                    onRotationDelta(90);
                    setMenuOpen(false);
                  }}
                >
                  <Redo2 className="h-4 w-4" />
                  Rotate 90°
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-red-600 focus:text-red-600"
                  onSelect={() => {
                    setMenuOpen(false);
                    onRequestRemove();
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-zinc-900/90 text-white shadow-sm transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              aria-label="Close"
              onClick={closeModal}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div
          ref={lightboxViewportRef}
          className="fv-attachment-lightbox-viewport relative z-0 flex min-h-[200px] min-w-0 flex-1 touch-none flex-col bg-black/90"
        >
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto p-3">
            <div
              className="pointer-events-auto flex max-h-full max-w-full items-center justify-center"
              style={{
                transform: `rotate(${rotation}deg) scale(${lightboxScale})`,
                transformOrigin: "center center",
                willChange: "transform",
                transition: "transform 0.2s ease",
              }}
            >
              <img
                src={imageUrl}
                alt={previewName}
                className="max-h-[min(70vh,680px)] max-w-full select-none"
                style={{ objectFit: "contain" }}
                decoding="async"
                draggable={false}
              />
            </div>
          </div>
        </div>

        {isEditingImage ? (
          <div
            className="relative z-10 flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 bg-zinc-950 px-2 py-2.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/20 bg-zinc-800/90 text-white hover:bg-zinc-700"
              onClick={() => onRotationDelta(-15)}
              title="Rotate 15° left"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/20 bg-zinc-800/90 text-white hover:bg-zinc-700"
              onClick={() => onRotationDelta(15)}
              title="Rotate 15° right"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-9 min-w-11 items-center justify-center rounded-lg border border-white/20 bg-zinc-800/90 text-[11px] font-bold text-white hover:bg-zinc-700"
              onClick={() => onRotationDelta(90)}
              title="Rotate 90°"
            >
              90°
            </button>
            <span className="mx-1 h-5 w-px bg-white/20" aria-hidden />
            <button
              type="button"
              className="inline-flex h-9 min-w-11 items-center justify-center rounded-lg border border-white/20 bg-zinc-800/90 text-xs font-medium text-white hover:bg-zinc-700"
              onClick={() => setLightboxScale(1)}
              title="Reset zoom (1:1)"
            >
              1:1
            </button>
            <p className="ml-1 hidden text-[10px] text-zinc-500 sm:block">Pinch: zoom · rotate</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
