import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BringToFront, Menu, MoveDiagonal2, Redo2, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { NotebookImageLightbox } from "@/components/records/notebook-image/NotebookImageLightbox";
import { NotebookImageBlock } from "@/components/records/notebook-image/NotebookImageBlock";
import { readHasSeenImageTour, setHasSeenImageTour as persistImageTourSeen } from "@/lib/notebook/notebookImageUx";

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
const LONG_PRESS_MS = 520;
const EXPAND_AFTER_TOUR_MS = 1300;

type Mode = "idle" | "pending" | "pending-image" | "drag" | "resize";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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
  if (u.startsWith("blob:")) return true;
  return isImageUrl(u);
}

type DraggableAttachmentProps = {
  attachment: NoteAttachmentLayout;
  containerRef: React.RefObject<HTMLElement | null>;
  /** Insert position for undo when removing an image */
  attachmentIndex?: number;
  onChange: (next: NoteAttachmentLayout) => void;
  onDelete: (id: string) => void;
  onRemoveImageWithUndo?: (snapshot: NoteAttachmentLayout, insertIndex: number) => void;
  onBringFront: (id: string) => void;
};

function DraggableAttachmentImpl({
  attachment,
  containerRef,
  attachmentIndex = 0,
  onChange,
  onDelete,
  onRemoveImageWithUndo,
  onBringFront,
}: DraggableAttachmentProps) {
  const [hover, setHover] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tourVisible, setTourVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const tourSeenRef = useRef(readHasSeenImageTour());

  const modeRef = useRef<Mode>("idle");
  const attachmentRef = useRef(attachment);
  attachmentRef.current = attachment;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pointerIdRef = useRef<number | null>(null);
  const attachmentRootRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    px: number;
    py: number;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandAfterTourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActivatedRef = useRef(false);
  const tapSuppressedRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const imageTwoFingerRef = useRef<{
    d0: number;
    a0: number;
    w0: number;
    h0: number;
    r0: number;
  } | null>(null);

  const showImage = useMemo(() => showAttachmentAsImage(attachment), [attachment]);

  const selectedImageId = lightboxOpen || tourVisible ? attachment.id : null;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearExpandTimer = useCallback(() => {
    if (expandAfterTourTimerRef.current) {
      clearTimeout(expandAfterTourTimerRef.current);
      expandAfterTourTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      clearExpandTimer();
    };
  }, [clearLongPressTimer, clearExpandTimer]);

  const commitMove = useCallback(
    (clientX: number, clientY: number) => {
      const start = startRef.current;
      if (!start) return;
      const el = containerRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      const dx = clientX - start.px;
      const dy = clientY - start.py;
      const a = attachmentRef.current;
      const maxX = Math.max(0, bounds.width - a.width);
      const maxY = Math.max(0, bounds.height - a.height);
      const nextX = clamp(snap10(start.x + dx), 0, maxX);
      const nextY = clamp(snap10(start.y + dy), 0, maxY);
      onChange({ ...a, x: nextX, y: nextY });
    },
    [containerRef, onChange],
  );

  const commitResize = useCallback(
    (clientX: number, clientY: number) => {
      const start = startRef.current;
      if (!start) return;
      const el = containerRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      const dx = clientX - start.px;
      const dy = clientY - start.py;
      const a = attachmentRef.current;
      const minW = 120;
      const minH = 90;
      const maxW = Math.max(minW, bounds.width - a.x);
      const maxH = Math.max(minH, bounds.height - a.y);
      const nextW = clamp(snap10(start.w + dx), minW, maxW);
      const nextH = clamp(snap10(start.h + dy), minH, maxH);
      onChange({ ...a, width: nextW, height: nextH });
    },
    [containerRef, onChange],
  );

  const openLightboxNow = useCallback(() => {
    clearExpandTimer();
    setTourVisible(false);
    if (!tourSeenRef.current) {
      tourSeenRef.current = true;
      persistImageTourSeen();
    }
    setLightboxOpen(true);
  }, [clearExpandTimer]);

  const handleImageTap = useCallback(() => {
    clearExpandTimer();
    if (!tourSeenRef.current) {
      tourSeenRef.current = true;
      persistImageTourSeen();
      setTourVisible(true);
      expandAfterTourTimerRef.current = setTimeout(() => {
        setLightboxOpen(true);
        setTourVisible(false);
        expandAfterTourTimerRef.current = null;
      }, EXPAND_AFTER_TOUR_MS);
    } else {
      openLightboxNow();
    }
  }, [clearExpandTimer, openLightboxNow]);

  const nudgeRotation = (deltaDeg: number) => {
    onBringFront(attachment.id);
    const a = attachmentRef.current;
    onChange({
      ...a,
      rotation: (a.rotation + deltaDeg + 360) % 360,
    });
  };

  const removeImageNow = useCallback(() => {
    const snap = { ...attachmentRef.current };
    const idx = attachmentIndex;
    if (onRemoveImageWithUndo) {
      onRemoveImageWithUndo(snap, idx);
    } else {
      onDelete(snap.id);
    }
  }, [attachmentIndex, onDelete, onRemoveImageWithUndo]);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      if (pointerIdRef.current == null) return;
      if (ev.pointerId !== pointerIdRef.current) return;
      lastPointerRef.current = { x: ev.clientX, y: ev.clientY };

      if (modeRef.current === "pending-image" && startRef.current && !longPressActivatedRef.current) {
        const s = startRef.current;
        const dx = ev.clientX - s.px;
        const dy = ev.clientY - s.py;
        if (Math.hypot(dx, dy) >= DRAG_SLOP_PX) {
          clearLongPressTimer();
          tapSuppressedRef.current = true;
          modeRef.current = "idle";
          pointerIdRef.current = null;
          startRef.current = null;
        }
        return;
      }

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
        }
      }
      if (modeRef.current === "drag") commitMove(ev.clientX, ev.clientY);
      if (modeRef.current === "resize") commitResize(ev.clientX, ev.clientY);
    };

    const onUp = (ev: PointerEvent) => {
      if (pointerIdRef.current == null) return;
      if (ev.pointerId !== pointerIdRef.current) return;
      lastPointerRef.current = { x: ev.clientX, y: ev.clientY };

      if (modeRef.current === "pending-image") {
        clearLongPressTimer();
        if (!tapSuppressedRef.current) {
          handleImageTap();
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
        longPressActivatedRef.current = false;
        setIsDragging(false);
        return;
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
      longPressActivatedRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clearLongPressTimer, commitMove, commitResize, handleImageTap]);

  useEffect(() => {
    if (!showImage) return;
    const target = attachmentRootRef.current;
    if (!target) return;
    const options = { passive: false } as const;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const a = attachmentRef.current;
      imageTwoFingerRef.current = {
        d0: touchDistance(e.touches),
        a0: touchAngleDeg(e.touches),
        w0: a.width,
        h0: a.height,
        r0: a.rotation,
      };
    };

    const onMove = (e: TouchEvent) => {
      const g = imageTwoFingerRef.current;
      if (!g || e.touches.length < 2) return;
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      const d1 = touchDistance(e.touches);
      const a1 = touchAngleDeg(e.touches);
      const scale = d1 / g.d0;
      const nextW = clamp(snap10(g.w0 * scale), 120, Math.max(120, bounds.width));
      const nextH = clamp(snap10(g.h0 * scale), 90, Math.max(90, bounds.height));
      let da = a1 - g.a0;
      while (da > 180) da -= 360;
      while (da < -180) da += 360;
      const nextRotation = (g.r0 + da + 360) % 360;
      const a = attachmentRef.current;
      const maxX = Math.max(0, bounds.width - nextW);
      const maxY = Math.max(0, bounds.height - nextH);
      onChangeRef.current({
        ...a,
        width: nextW,
        height: nextH,
        x: clamp(a.x, 0, maxX),
        y: clamp(a.y, 0, maxY),
        rotation: nextRotation,
      });
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) imageTwoFingerRef.current = null;
    };

    target.addEventListener("touchstart", onStart, options);
    target.addEventListener("touchmove", onMove, options);
    target.addEventListener("touchend", onEnd, options);
    target.addEventListener("touchcancel", onEnd, options);
    return () => {
      target.removeEventListener("touchstart", onStart, options);
      target.removeEventListener("touchmove", onMove, options);
      target.removeEventListener("touchend", onEnd, options);
      target.removeEventListener("touchcancel", onEnd, options);
    };
  }, [containerRef, showImage]);

  const onPointerDownDrag = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.stopPropagation();
    onBringFront(attachment.id);
    pointerIdRef.current = ev.pointerId;
    lastPointerRef.current = { x: ev.clientX, y: ev.clientY };

    if (showImage) {
      clearLongPressTimer();
      clearExpandTimer();
      setTourVisible(false);
      longPressActivatedRef.current = false;
      tapSuppressedRef.current = false;
      modeRef.current = "pending-image";
      startRef.current = {
        x: attachment.x,
        y: attachment.y,
        w: attachment.width,
        h: attachment.height,
        px: ev.clientX,
        py: ev.clientY,
      };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        if (modeRef.current !== "pending-image") return;
        longPressActivatedRef.current = true;
        modeRef.current = "drag";
        const root = attachmentRootRef.current;
        const pid = pointerIdRef.current;
        if (root && pid != null) {
          try {
            root.setPointerCapture(pid);
          } catch {
            // ignore
          }
        }
        const a = attachmentRef.current;
        const lp = lastPointerRef.current;
        startRef.current = {
          x: a.x,
          y: a.y,
          w: a.width,
          h: a.height,
          px: lp.x,
          py: lp.y,
        };
        setIsDragging(true);
      }, LONG_PRESS_MS);
      return;
    }

    modeRef.current = "pending";
    startRef.current = {
      x: attachment.x,
      y: attachment.y,
      w: attachment.width,
      h: attachment.height,
      px: ev.clientX,
      py: ev.clientY,
    };
  };

  const onPointerDownResize = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    onBringFront(attachment.id);
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    pointerIdRef.current = ev.pointerId;
    modeRef.current = "resize";
    startRef.current = {
      x: attachment.x,
      y: attachment.y,
      w: attachment.width,
      h: attachment.height,
      px: ev.clientX,
      py: ev.clientY,
    };
  };

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
        className={cn(
          "fv-attachment attachment",
          showImage && "fv-attachment--notebook-image",
          showImage && (lightboxOpen || tourVisible) && "fv-attachment--image-selected",
          showImage && isDragging && "fv-attachment--image-dragging",
        )}
        style={{
          left: attachment.x,
          top: attachment.y,
          width: attachment.width,
          height: attachment.height,
          zIndex: Math.min(attachment.zIndex, 20),
          transform: showImage && isDragging ? "scale(1.02)" : undefined,
          transition: showImage ? "transform 0.15s ease, box-shadow 0.15s ease" : undefined,
        }}
        onPointerDown={onPointerDownDrag}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        role="group"
        aria-label={previewName}
        data-selected-image-id={selectedImageId ?? undefined}
      >
        {hover && !showImage ? (
          <div
            className={cn("fv-attachment-toolbar", "fv-attachment-toolbar--file")}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button type="button" className="fv-attachment-tool" title="Drag">
              <MoveDiagonal2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="fv-attachment-tool" title="Rotate 15°" onClick={() => nudgeRotation(15)}>
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
            <button type="button" className="fv-attachment-tool" title="Bring to front" onClick={() => onBringFront(attachment.id)}>
              <BringToFront className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className="fv-attachment-body">
          {showImage ? (
            <>
              <div
                className="fv-attachment-image-menu-wrap"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="fv-attachment-hamburger"
                      title="Image options"
                      aria-label={`Options for ${previewName}`}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Menu className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="z-[300] w-52"
                    onPointerDown={(e) => e.stopPropagation()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <DropdownMenuItem className="gap-2" onSelect={() => openLightboxNow()}>
                      View larger
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={() => nudgeRotation(-15)}>
                      <RotateCcw className="h-4 w-4" />
                      Rotate 15° left
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={() => nudgeRotation(15)}>
                      <RotateCw className="h-4 w-4" />
                      Rotate 15° right
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={() => nudgeRotation(90)}>
                      <Redo2 className="h-4 w-4" />
                      Rotate 90°
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 text-red-600 focus:text-red-600"
                      onSelect={() => {
                        removeImageNow();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <NotebookImageBlock
                url={attachment.url}
                previewName={previewName}
                tourVisible={tourVisible}
                imageStyle={{
                  transform: `rotate(${attachment.rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.2s ease",
                }}
                onImageKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    openLightboxNow();
                  }
                }}
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
        <NotebookImageLightbox
          open={lightboxOpen}
          onOpenChange={(o) => {
            setLightboxOpen(o);
            if (!o) clearExpandTimer();
          }}
          imageUrl={attachment.url}
          previewName={previewName}
          rotation={attachment.rotation}
          onRotationDelta={(d) => nudgeRotation(d)}
          onRequestRemove={removeImageNow}
        />
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
  if (
    prev.onChange !== next.onChange ||
    prev.onDelete !== next.onDelete ||
    prev.onBringFront !== next.onBringFront ||
    prev.onRemoveImageWithUndo !== next.onRemoveImageWithUndo
  ) {
    return false;
  }
  if (prev.attachmentIndex !== next.attachmentIndex) return false;
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
