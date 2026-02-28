import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { GripVertical, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { DrawerModalWatermark } from "@/components/ui/DrawerModalWatermark";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

const WIDTH_MIN = 280;
const WIDTH_MAX_DEFAULT = 520;
const HEIGHT_MIN = 200;

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** When true, the sheet can be resized: width for left/right, height for top/bottom */
  draggable?: boolean;
}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", className, children, draggable = false, ...props }, ref) => {
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [sizePx, setSizePx] = React.useState<number | null>(null);
    const [isResizing, setIsResizing] = React.useState(false);
    const startRef = React.useRef({ client: 0, size: 0 });

    const isHorizontal = side === "left" || side === "right";

    React.useEffect(() => {
      if (!draggable || !isResizing) return;
      const onMove = (e: PointerEvent) => {
        if (isHorizontal) {
          const delta = side === "right" ? startRef.current.client - e.clientX : e.clientX - startRef.current.client;
          const maxW = Math.min(WIDTH_MAX_DEFAULT, typeof window !== "undefined" ? window.innerWidth * 0.9 : 600);
          const next = Math.max(WIDTH_MIN, Math.min(maxW, startRef.current.size + delta));
          setSizePx(next);
        } else {
          const delta = side === "bottom" ? startRef.current.client - e.clientY : e.clientY - startRef.current.client;
          const maxH = typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.9) : 600;
          const next = Math.max(HEIGHT_MIN, Math.min(maxH, startRef.current.size + delta));
          setSizePx(next);
        }
      };
      const onUp = () => setIsResizing(false);
      window.addEventListener("pointermove", onMove, { capture: true });
      window.addEventListener("pointerup", onUp, { capture: true });
      return () => {
        window.removeEventListener("pointermove", onMove, { capture: true });
        window.removeEventListener("pointerup", onUp, { capture: true });
      };
    }, [draggable, isResizing, isHorizontal, side]);

    const onResizeStart = React.useCallback(
      (e: React.PointerEvent) => {
        if (!draggable) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const el = contentRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          if (isHorizontal) {
            startRef.current = { client: e.clientX, size: rect.width };
          } else {
            startRef.current = { client: e.clientY, size: rect.height };
          }
        } else {
          startRef.current = {
            client: isHorizontal ? e.clientX : e.clientY,
            size: isHorizontal ? WIDTH_MAX_DEFAULT : (typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.6) : 400),
          };
        }
        setSizePx((prev) => prev ?? startRef.current.size);
        setIsResizing(true);
      },
      [draggable, isHorizontal]
    );

    const resizeStyle = React.useMemo(() => {
      if (!draggable || sizePx == null) return undefined;
      if (isHorizontal) {
        return { width: sizePx, minWidth: WIDTH_MIN, maxWidth: "90vw" };
      }
      return { height: sizePx, minHeight: HEIGHT_MIN, maxHeight: "90vh" };
    }, [draggable, sizePx, isHorizontal]);

    const resizeHandle = draggable ? (
      <div
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-label={isHorizontal ? "Drag to resize width" : "Drag to resize height"}
        onPointerDown={onResizeStart}
        className={cn(
          "flex shrink-0 touch-none items-center justify-center bg-muted/40 text-muted-foreground hover:bg-muted/60",
          isHorizontal ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize",
          side === "right" && "border-r border-border/50",
          side === "left" && "border-l border-border/50",
          side === "bottom" && "border-b border-border/50",
          side === "top" && "border-t border-border/50"
        )}
      >
        <GripVertical className={cn("text-muted-foreground", isHorizontal ? "h-4 w-4" : "h-4 w-4 rotate-90")} />
      </div>
    ) : null;

    const mainFlexDir = isHorizontal ? "flex-row" : "flex-col";
    const handleFirst = side === "right" || side === "bottom";

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={(node) => {
            (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          className={cn(sheetVariants({ side }), "flex min-h-0 overflow-hidden", mainFlexDir, className)}
          style={resizeStyle}
          {...props}
        >
          {handleFirst && resizeHandle}
          <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
            <DrawerModalWatermark />
            <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0 py-px">
              {children}
            </div>
          </div>
          {!handleFirst && resizeHandle}
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-secondary hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  }
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
