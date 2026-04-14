import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type PreviewGroup = {
  id: string;
  title: string;
  images: { src: string; alt: string; previewTitle: string; previewDescription: string }[];
  fullWidth?: boolean;
};

const previewGroups: PreviewGroup[] = [
  {
    id: "projects-expenses",
    title: "Projects and expenses",
    images: [
      {
        src: "/landing/screenshots/projects.png",
        alt: "FarmVault projects screen",
        previewTitle: "Projects overview",
        previewDescription: "See active projects, crop progress, and key project details in one view.",
      },
      {
        src: "/landing/screenshots/expenses.png",
        alt: "FarmVault expenses screen",
        previewTitle: "Expense tracking",
        previewDescription: "Capture spending by category and monitor where farm money goes each day.",
      },
    ],
  },
  {
    id: "operations",
    title: "Operations and team activity",
    images: [
      {
        src: "/landing/screenshots/operations.png",
        alt: "FarmVault operations screen",
        previewTitle: "Daily operations",
        previewDescription: "Track daily farm activities and follow what has been completed on the ground.",
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory and farm inputs",
    fullWidth: true,
    images: [
      {
        src: "/landing/screenshots/inventory.png",
        alt: "FarmVault inventory screen",
        previewTitle: "Inventory and inputs",
        previewDescription: "Check available inputs and keep farm stock records up to date.",
      },
    ],
  },
];

export function FeaturesSection() {
  const [showPreviews, setShowPreviews] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<{ groupId: string; index: number } | null>(null);
  const [slideByGroup, setSlideByGroup] = useState<Record<string, number>>(
    Object.fromEntries(previewGroups.map((group) => [group.id, 0]))
  );
  const touchStartX = useRef<number | null>(null);

  const selectedGroup = useMemo(
    () => previewGroups.find((group) => group.id === selectedPreview?.groupId) ?? null,
    [selectedPreview]
  );
  const selectedImage = selectedGroup && selectedPreview
    ? selectedGroup.images[selectedPreview.index]
    : null;

  const goToPrev = (group: PreviewGroup) => {
    setSlideByGroup((prev) => {
      const current = prev[group.id] ?? 0;
      const next = (current - 1 + group.images.length) % group.images.length;
      return { ...prev, [group.id]: next };
    });
  };

  const goToNext = (group: PreviewGroup) => {
    setSlideByGroup((prev) => {
      const current = prev[group.id] ?? 0;
      const next = (current + 1) % group.images.length;
      return { ...prev, [group.id]: next };
    });
  };

  const goModalPrev = () => {
    if (!selectedGroup || !selectedPreview) return;
    setSelectedPreview((prev) => {
      if (!prev) return prev;
      const nextIndex = (prev.index - 1 + selectedGroup.images.length) % selectedGroup.images.length;
      return { ...prev, index: nextIndex };
    });
  };

  const goModalNext = () => {
    if (!selectedGroup || !selectedPreview) return;
    setSelectedPreview((prev) => {
      if (!prev) return prev;
      const nextIndex = (prev.index + 1) % selectedGroup.images.length;
      return { ...prev, index: nextIndex };
    });
  };

  return (
    <section id="product-proof" className="bg-white py-14">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mb-6 max-w-3xl">
          <h2 className="text-3xl font-bold leading-tight text-[#1f3a2d] md:text-4xl">
            Product <span className="text-[#D8B980]">Preview</span>
          </h2>
          <p className="mt-4 text-base leading-7 text-[#5f6f63]">
            These are real FarmVault screens used for daily operations, harvest records, and expense tracking.
          </p>
          <button
            type="button"
            onClick={() => setShowPreviews((prev) => !prev)}
            className="mt-5 inline-flex items-center rounded-md border border-[#d8b980]/50 px-4 py-2 text-sm font-medium text-[#1f3a2d] transition-colors hover:bg-[#f8f3e6]"
          >
            {showPreviews ? "Hide screenshots" : "View screenshots"}
          </button>
        </div>

        {showPreviews && (
        <>
        <div className="grid gap-8 md:grid-cols-2">
          {previewGroups.map((group) => {
            const currentIndex = slideByGroup[group.id] ?? 0;
            const currentImage = group.images[currentIndex];
            const hasManyImages = group.images.length > 1;

            return (
              <article key={group.id} className={group.fullWidth ? "md:col-span-2" : ""}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[#D8B980]">{group.title}</p>
                  {hasManyImages && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => goToPrev(group)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d8b980]/50 text-[#1f3a2d] transition-colors hover:bg-[#f8f3e6]"
                        aria-label={`Previous ${group.title} screenshot`}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => goToNext(group)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d8b980]/50 text-[#1f3a2d] transition-colors hover:bg-[#f8f3e6]"
                        aria-label={`Next ${group.title} screenshot`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPreview({ groupId: group.id, index: currentIndex })}
                  className={`mx-auto block w-full cursor-zoom-in ${
                    group.fullWidth ? "max-w-4xl" : "max-w-xl"
                  }`}
                  aria-label={`Open ${group.title} screenshot`}
                >
                  <OptimizedImage
                    src={currentImage.src}
                    alt={currentImage.alt}
                    className="w-full rounded-lg drop-shadow-[0_22px_60px_rgba(0,0,0,0.4)]"
                  />
                </button>

                {hasManyImages && (
                  <p className="mt-2 text-xs text-[#5f6f63]">
                    {currentIndex + 1} / {group.images.length}
                  </p>
                )}
              </article>
            );
          })}
        </div>
        </>
        )}
      </div>

      <Dialog
        open={Boolean(selectedPreview)}
        onOpenChange={(open) => {
          if (!open) setSelectedPreview(null);
        }}
      >
        <DialogContent className="h-[100dvh] w-[100vw] max-w-none overflow-hidden border-none bg-transparent p-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">
            {selectedImage?.alt ?? "Screenshot preview"}
          </DialogTitle>
          {selectedImage && (
            <div
              className="flex h-full w-full items-center justify-center px-4 py-6 md:px-6"
              onTouchStart={(e) => {
                touchStartX.current = e.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                if (!selectedGroup || selectedGroup.images.length < 2 || touchStartX.current == null) return;
                const endX = e.changedTouches[0]?.clientX ?? 0;
                const delta = endX - touchStartX.current;
                if (Math.abs(delta) > 50) {
                  if (delta > 0) goModalPrev();
                  else goModalNext();
                }
                touchStartX.current = null;
              }}
            >
              <div className="flex w-full flex-col items-center animate-in fade-in zoom-in-95 duration-200">
                <div className="relative flex w-full items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setSelectedPreview(null)}
                    className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {selectedGroup && selectedGroup.images.length > 1 && (
                    <button
                      type="button"
                      onClick={goModalPrev}
                      className="absolute left-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white transition-colors hover:bg-black/55"
                      aria-label="Previous screenshot"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}

                  <img
                    src={selectedImage.src}
                    alt={selectedImage.alt}
                    className="mx-auto h-auto max-h-[70vh] w-auto max-w-[calc(100vw-5rem)] rounded-xl object-contain shadow-xl md:max-w-[calc(100vw-8rem)]"
                  />

                  {selectedGroup && selectedGroup.images.length > 1 && (
                    <button
                      type="button"
                      onClick={goModalNext}
                    className="absolute right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white transition-colors hover:bg-black/55"
                      aria-label="Next screenshot"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <div className="mt-6 w-full max-w-md text-left">
                  <h3 className="text-lg font-medium text-white md:text-xl">
                    {selectedImage.previewTitle}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-300 md:text-base">
                    {selectedImage.previewDescription}
                  </p>

                  <ul className="mt-4 space-y-2 text-sm text-gray-300">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A937]" />
                      <span>Real-time farm records</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A937]" />
                      <span>Track inputs and stock clearly</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A937]" />
                      <span>Used on real farms</span>
                    </li>
                  </ul>
                </div>

                {selectedGroup && selectedGroup.images.length > 1 && selectedPreview && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    {selectedGroup.images.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setSelectedPreview((prev) =>
                            prev ? { ...prev, index: idx } : prev
                          )
                        }
                        className={`h-2.5 w-2.5 rounded-full transition-colors ${
                          idx === selectedPreview.index ? "bg-[#D4A937]" : "bg-white/40"
                        }`}
                        aria-label={`Go to screenshot ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
