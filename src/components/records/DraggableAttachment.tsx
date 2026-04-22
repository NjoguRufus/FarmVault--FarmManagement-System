import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BringToFront, RotateCcw, RotateCw, X, MoveDiagonal2, Trash2 } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type NoteAttachmentLayout = {
  id: string;
  url: string;
  /** When set (e.g. from `File.type`), disambiguates blob: URLs and non-image files. */
  mimeType?: string;
  /** While the file is only local (e.g. blob: URL), set until remote upload completes. */
  localUploadState?: "uploading" | "error";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

const DRAG_SLOP_PX = 10;

type Mode = "idle" | "pending" | "drag" | "resize";

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

function snap10(n: number) {
  return Math.round(n / 10) * 10;
}

function isImageUrl(url: string) {
  const u = String(url ?? "");
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(u);
}

function showAttachmentAsImage(attachment: NoteAttachmentLayout) {
  if (attachment.mimeType?.startsWith("image/")) return true;
  if (attachment.mimeType && !attachment.mimeType.startsWith("image/")) return false;
  const u = String(attachment.url ?? "");
  if (u.startsWith("blob:")) return true; // local preview path only used for images in the notebook
  return isImageUrl(u);
}

type DraggableAttachmentProps = {
  attachment: NoteAttachmentLayout;
  containerRef: React.RefObject<HTMLElement | null>;
  onChange: (next: NoteAttachmentLayout) => void;
  onDelete: (id: string) => void;
  onBringFront: (id: string) => void;
};

function DraggableAttachmentImpl({
  attachment,
  containerRef,
  onChange,
  onDelete,
  onBringFront,
}: DraggableAttachmentProps) {
  const [hover, setHover] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1);
  const modeRef = useRef<Mode>("idle");
  const lightboxTwoFingerRef = useRef<{
    d0: number;
    a0: number;
    r0: number;
    s0: number;
  } | null>(null);
  const lightboxScaleRef = useRef(1);
  lightboxScaleRef.current = lightboxScale;
  const lightboxViewportRef = useRef<HTMLDivElement | null>(null);
  const attachmentRef = useRef(attachment);
  attachmentRef.current = attachment;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hadPointerMoveForGestureRef = useRef(false);
  const showImage = useMemo(() => showAttachmentAsImage(attachment), [attachment]);
  const showImageRef = useRef(showImage);
  showImageRef.current = showImage;
  const attachmentRootRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    px: number;
    py: number;
  } | null>(null);

  const commitMove = useCallback(
    (clientX: number, clientY: number) => {
      const start = startRef.current;
      if (!start) return;
      hadPointerMoveForGestureRef.current = true;
      const el = containerRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      const dx = clientX - start.px;
      const dy = clientY - start.py;
      const maxX = Math.max(0, bounds.width - attachment.width);
      const maxY = Math.max(0, bounds.height - attachment.height);
      const nextX = clamp(snap10(start.x + dx), 0, maxX);
      const nextY = clamp(snap10(start.y + dy), 0, maxY);
      onChange({ ...attachment, x: nextX, y: nextY });
    },
    [attachment, containerRef, onChange],
  );

  const commitResize = useCallback(
    (clientX: number, clientY: number) => {
      const start = startRef.current;
      if (!start) return;
      hadPointerMoveForGestureRef.current = true;
      const el = containerRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      const dx = clientX - start.px;
      const dy = clientY - start.py;
      const minW = 120;
      const minH = 90;
      const maxW = Math.max(minW, bounds.width - attachment.x);
      const maxH = Math.max(minH, bounds.height - attachment.y);
      const nextW = clamp(snap10(start.w + dx), minW, maxW);
      const nextH = clamp(snap10(start.h + dy), minH, maxH);
      onChange({ ...attachment, width: nextW, height: nextH });
    },
    [attachment, containerRef, onChange],
  );

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      if (pointerIdRef.current == null) return;
      if (ev.pointerId !== pointerIdRef.current) return;
      if (modeRef.current === "pending" && startRef.current) {
        const s = startRef.current;
        const dx = ev.clientX - s.px;
        const dy = ev.clientY - s.py;
        if (Math.hypot(dx, dy) >= DRAG_SLOP_PX) {
          const root = attachmentRootRef.current;
          if (root) {
            try {
              root.setPointerCapture(ev.pointerId);
            } catch {
              // ignore
            }
          }
          startRef.current = { ...s, px: ev.clientX, py: ev.clientY };
          modeRef.current = "drag";
          hadPointerMoveForGestureRef.current = true;
        }
      }
      if (modeRef.current === "drag") commitMove(ev.clientX, ev.clientY);
      if (modeRef.current === "resize") commitResize(ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (pointerIdRef.current == null) return;
      if (ev.pointerId !== pointerIdRef.current) return;
      if (ev.type === "pointerup" && modeRef.current === "pending" && showImageRef.current) {
        setLightboxOpen(true);
      }
      const root = attachmentRootRef.current;
      if (root) {
        try {
          if (root.hasPointerCapture?.(ev.pointerId)) {
            root.releasePointerCapture(ev.pointerId);
          }
        } catch {
          // ignore
        }
      }
      pointerIdRef.current = null;
      modeRef.current = "idle";
      startRef.current = null;
      setTimeout(() => {
        hadPointerMoveForGestureRef.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [commitMove, commitResize, setLightboxOpen]);

  const onPointerDownDrag = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.stopPropagation();
    hadPointerMoveForGestureRef.current = false;
    onBringFront(attachment.id);
    pointerIdRef.current = ev.pointerId;
    modeRef.current = "pending";
    startRef.current = { x: attachment.x, y: attachment.y, w: attachment.width, h: attachment.height, px: ev.clientX, py: ev.clientY };
  };

  const onPointerDownResize = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    hadPointerMoveForGestureRef.current = false;
    onBringFront(attachment.id);
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    pointerIdRef.current = ev.pointerId;
    modeRef.current = "resize";
    startRef.current = { x: attachment.x, y: attachment.y, w: attachment.width, h: attachment.height, px: ev.clientX, py: ev.clientY };
  };

  const nudgeRotation = (deltaDeg: number) => {
    onBringFront(attachment.id);
    onChange({
      ...attachment,
      rotation: (attachment.rotation + deltaDeg + 360) % 360,
    });
  };

  useEffect(() => {
    if (!lightboxOpen) {
      setLightboxScale(1);
      lightboxTwoFingerRef.current = null;
    }
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
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
        r0: attachmentRef.current.rotation,
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
      const att = attachmentRef.current;
      onChangeRef.current({ ...att, rotation: (g.r0 + da + 360) % 360 });
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
  }, [lightboxOpen]);

  const previewName = useMemo(() => {
    const raw = String(attachment.url ?? "");
    if (raw.startsWith("blob:")) return "Image";
    try {
      const u = new URL(raw);
      return decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "Attachment");
    } catch {
      return "Attachment";
    }
  }, [attachment.url]);

  return (
    <>
    <div
      ref={attachmentRootRef}
      className="fv-attachment attachment"
      style={{
        left: attachment.x,
        top: attachment.y,
        width: attachment.width,
        height: attachment.height,
        zIndex: Math.min(attachment.zIndex, 20),
        transform: `rotate(${attachment.rotation}deg)`,
      }}
      onPointerDown={onPointerDownDrag}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="group"
      aria-label={previewName}
    >
      {hover ? (
        <div
          className={cn(
            "fv-attachment-toolbar",
            showImage ? "fv-attachment-toolbar--image" : "fv-attachment-toolbar--file",
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" className="fv-attachment-tool" title="Drag">
            <MoveDiagonal2 className="h-3.5 w-3.5" />
          </button>
          {!showImage ? (
            <>
              <button
                type="button"
                className="fv-attachment-tool"
                title="Rotate 15°"
                onClick={() => nudgeRotation(15)}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="fv-attachment-tool danger"
                title="Delete"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
          <button type="button" className="fv-attachment-tool" title="Bring to front" onClick={() => onBringFront(attachment.id)}>
            <BringToFront className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="fv-attachment-body">
        {showImage ? (
          <>
            <div
              className="fv-attachment-image-actions"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="fv-attachment-image-actions-left">
                <button
                  type="button"
                  className="fv-attachment-image-btn"
                  title="Rotate 15° counterclockwise"
                  aria-label="Rotate 15° counterclockwise"
                  onClick={(e) => {
                    e.stopPropagation();
                    nudgeRotation(-15);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="fv-attachment-image-btn"
                  title="Rotate 15° clockwise"
                  aria-label="Rotate 15° clockwise"
                  onClick={(e) => {
                    e.stopPropagation();
                    nudgeRotation(15);
                  }}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="fv-attachment-image-btn fv-attachment-image-btn--wide"
                  title="Rotate 90° clockwise"
                  aria-label="Rotate 90° clockwise"
                  onClick={(e) => {
                    e.stopPropagation();
                    nudgeRotation(90);
                  }}
                >
                  90°
                </button>
              </div>
              <button
                type="button"
                className="fv-attachment-image-btn fv-attachment-image-btn--remove"
                title="Remove image"
                aria-label="Remove image"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmOpen(true);
                }}
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
            <img
              src={attachment.url}
              alt={previewName}
              draggable={false}
              decoding="async"
              loading="lazy"
              tabIndex={0}
              className="fv-attachment-preview-img"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setLightboxOpen(true);
                }
              }}
              title="Tap to expand"
              aria-label={`Expand ${previewName}`}
            />
          </>
        ) : (
          <a href={attachment.url} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()}>
            {previewName}
          </a>
        )}
        {attachment.localUploadState === "uploading" ? (
          <div className="fv-attachment-upload-badge" aria-live="polite">
            Uploading…
          </div>
        ) : null}
        {attachment.localUploadState === "error" ? (
          <div className="fv-attachment-upload-badge fv-attachment-upload-badge--error" aria-live="polite">
            Will retry when online
          </div>
        ) : null}
      </div>

      <div className="fv-attachment-resize-handle" onPointerDown={onPointerDownResize} />
    </div>

      {showImage ? (
        <Dialog
          open={lightboxOpen}
          onOpenChange={(o) => {
            setLightboxOpen(o);
            if (!o) setLightboxScale(1);
          }}
        >
          <DialogContent
            className={cn(
              "fv-attachment-lightbox-dialog !fixed !inset-0 !left-0 !top-0 !z-[102] flex !h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !rounded-none !border-0 !bg-black !p-0 !shadow-none",
              "data-[state=open]:!slide-in-from-top-0 data-[state=closed]:!slide-out-to-top-0",
              "[&>div:first-child]:hidden",
            )}
            showCloseButton={false}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-describedby="fv-notebook-lightbox-desc"
          >
            <DialogTitle className="sr-only">View image</DialogTitle>
            <DialogDescription id="fv-notebook-lightbox-desc" className="sr-only">
              Two-finger pinch to zoom and rotate. Ctrl or Command and scroll to zoom. Use the bar for fine rotation.
            </DialogDescription>
            <DialogClose
              type="button"
              className="absolute right-3 top-3 z-[200] flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-zinc-900/80 text-white shadow-lg backdrop-blur-sm transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </DialogClose>
            <div
              ref={lightboxViewportRef}
              className="fv-attachment-lightbox-viewport flex min-h-0 w-full flex-1 touch-none flex-col"
            >
              <div className="flex min-h-0 flex-1 items-center justify-center p-2">
                <div
                  className="flex max-h-full max-w-full items-center justify-center"
                  style={{
                    transform: `rotate(${attachment.rotation}deg) scale(${lightboxScale})`,
                    transformOrigin: "center center",
                    willChange: "transform",
                  }}
                >
                  <img
                    src={attachment.url}
                    alt=""
                    className="max-h-[min(90dvh,960px)] max-w-[100vw] select-none sm:max-w-[min(100vw,1400px)]"
                    style={{ objectFit: "contain" }}
                    decoding="async"
                    draggable={false}
                  />
                </div>
              </div>
            </div>
            <div
              className="fv-attachment-lightbox-toolbar flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 bg-zinc-950/95 px-2 py-2.5"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/20 bg-zinc-800/90 text-white hover:bg-zinc-700"
                onClick={() => nudgeRotation(-15)}
                title="Rotate 15° left"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/20 bg-zinc-800/90 text-white hover:bg-zinc-700"
                onClick={() => nudgeRotation(15)}
                title="Rotate 15° right"
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 min-w-11 items-center justify-center rounded-lg border border-white/20 bg-zinc-800/90 text-[11px] font-bold text-white hover:bg-zinc-700"
                onClick={() => nudgeRotation(90)}
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
              <p className="ml-1 hidden text-[10px] text-zinc-500 sm:block">Pinch: zoom and rotate</p>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from this note. You cannot undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
              onClick={() => {
                onDelete(attachment.id);
                setDeleteConfirmOpen(false);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
export const DraggableAttachment = React.memo(DraggableAttachmentImpl, (prev, next) => {
  if (prev.containerRef !== next.containerRef) return false;
  if (prev.onChange !== next.onChange || prev.onDelete !== next.onDelete || prev.onBringFront !== next.onBringFront) {
    return false;
  }
  const a = prev.attachment;
  const b = next.attachment;
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.url === b.url &&
    a.mimeType === b.mimeType &&
    a.localUploadState === b.localUploadState &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.rotation === b.rotation &&
    a.zIndex === b.zIndex
  );
});
