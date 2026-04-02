import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BringToFront, RotateCw, Trash2, MoveDiagonal2 } from "lucide-react";

export type NoteAttachmentLayout = {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

type Mode = "idle" | "drag" | "resize";

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

export function DraggableAttachment({
  attachment,
  containerRef,
  onChange,
  onDelete,
  onBringFront,
}: {
  attachment: NoteAttachmentLayout;
  containerRef: React.RefObject<HTMLElement | null>;
  onChange: (next: NoteAttachmentLayout) => void;
  onDelete: (id: string) => void;
  onBringFront: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const modeRef = useRef<Mode>("idle");
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
      if (modeRef.current === "drag") commitMove(ev.clientX, ev.clientY);
      if (modeRef.current === "resize") commitResize(ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (pointerIdRef.current == null) return;
      if (ev.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      modeRef.current = "idle";
      startRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [commitMove, commitResize]);

  const onPointerDownDrag = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    onBringFront(attachment.id);
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
    pointerIdRef.current = ev.pointerId;
    modeRef.current = "drag";
    startRef.current = { x: attachment.x, y: attachment.y, w: attachment.width, h: attachment.height, px: ev.clientX, py: ev.clientY };
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
    startRef.current = { x: attachment.x, y: attachment.y, w: attachment.width, h: attachment.height, px: ev.clientX, py: ev.clientY };
  };

  const rotate = () => {
    onBringFront(attachment.id);
    onChange({ ...attachment, rotation: (attachment.rotation + 15) % 360 });
  };

  const previewName = useMemo(() => {
    try {
      const u = new URL(attachment.url);
      return decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "Attachment");
    } catch {
      return "Attachment";
    }
  }, [attachment.url]);

  return (
    <div
      className="fv-attachment attachment"
      style={{
        left: attachment.x,
        top: attachment.y,
        width: attachment.width,
        height: attachment.height,
        zIndex: attachment.zIndex,
        transform: `rotate(${attachment.rotation}deg)`,
      }}
      onPointerDown={onPointerDownDrag}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="group"
      aria-label={previewName}
    >
      {hover ? (
        <div className="fv-attachment-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="fv-attachment-tool" title="Drag">
            <MoveDiagonal2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="fv-attachment-tool" title="Rotate" onClick={rotate}>
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="fv-attachment-tool" title="Bring to front" onClick={() => onBringFront(attachment.id)}>
            <BringToFront className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="fv-attachment-tool danger" title="Delete" onClick={() => onDelete(attachment.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="fv-attachment-body">
        {isImageUrl(attachment.url) ? (
          <img src={attachment.url} alt={previewName} draggable={false} />
        ) : (
          <a href={attachment.url} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()}>
            {previewName}
          </a>
        )}
      </div>

      <div className="fv-attachment-resize-handle" onPointerDown={onPointerDownResize} />
    </div>
  );
}

