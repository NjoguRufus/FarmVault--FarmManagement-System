import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Flag, Gauge, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

const KNOWN_CROP_IMAGE_FILES: Record<string, string> = {
  tomatoes: 'tomatoes.png',
  frenchbeans: 'Frenchbeans.png',
  capsicum: 'capsicum.png',
  maize: 'maize.png',
  rice: 'rice.png',
  watermelon: 'watermelon.png',
  watermelons: 'watermelon.png',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeCropKey = (crop: string) =>
  crop
    .toLowerCase()
    .replace(/[-_\s]/g, '')
    .replace(/[^a-z]/g, '');

const prettifyCropName = (crop: string) =>
  crop
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTitleCase = (value: string) =>
  value.replace(/\b\w/g, (char) => char.toUpperCase());

function buildCropImageCandidates(crop: string) {
  const raw = String(crop || '').trim();
  const spaced = raw.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const lowered = spaced.toLowerCase();
  const titled = toTitleCase(lowered);
  const normalized = normalizeCropKey(raw);

  const candidates = [
    KNOWN_CROP_IMAGE_FILES[normalized] ? `/cropstage images/${KNOWN_CROP_IMAGE_FILES[normalized]}` : null,
    raw ? `/cropstage images/${raw}.png` : null,
    spaced ? `/cropstage images/${spaced}.png` : null,
    lowered ? `/cropstage images/${lowered}.png` : null,
    titled ? `/cropstage images/${titled}.png` : null,
    normalized ? `/cropstage images/${normalized}.png` : null,
    '/cropstage images/tomatoes.png',
  ].filter(Boolean) as string[];

  return [...new Set(candidates)].map((path) => encodeURI(path));
}

export interface CropProgressCardProps {
  crop: 'tomatoes' | 'frenchbeans' | 'capsicum' | string;
  farmName?: string | null;
  projectName?: string | null;
  stage: string;
  progress: number;
  dayOf?: number;
  totalDays?: number;
  daysCompleted: number;
  estimatedFinish: string;
  daysLeft?: number;
  className?: string;
}

interface CropStripProgressProps {
  imageSrc: string;
  cropLabel: string;
  progress: number;
  subtitle: string;
  onImageError?: React.ReactEventHandler<HTMLImageElement>;
}

function CropStripProgress({
  imageSrc,
  cropLabel,
  progress,
  subtitle,
  onImageError,
}: CropStripProgressProps) {
  const revealWidth = clamp(progress, 0, 100);
  const overlayWidth =
    revealWidth >= 99.5 ? '0px' : `calc(${100 - revealWidth}% + 60px)`;

  return (
    <div className="mt-2 w-full px-0">
      <div className="relative h-[112px] w-full overflow-hidden rounded-lg border border-emerald-950/20 bg-emerald-50/5 sm:h-[120px]">
        <img
          src={imageSrc}
          alt={`${cropLabel} growth stages`}
          onError={onImageError}
          className="pointer-events-none absolute inset-x-0 bottom-[-44px] h-[118%] w-full select-none object-cover object-left opacity-[0.9] sm:bottom-[-32px]"
          loading="lazy"
          decoding="async"
          draggable={false}
        />

        <div
          className="pointer-events-none absolute inset-y-0 right-0 transition-[width] duration-700 ease-out"
          style={{
            width: overlayWidth,
            background:
              'linear-gradient(to right, hsl(var(--background) / 0) 0px, hsl(var(--background) / 0.72) 60px, hsl(var(--background) / 0.9) 100%)',
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/80 via-background/45 to-transparent" />

        <div className="absolute inset-x-0 top-0 p-2.5 sm:p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sprout className="h-4 w-4 text-fv-green-light" />
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                Crop Stage Progress
              </span>
            </div>
            <span className="font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {progress}%
            </span>
          </div>

          <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{subtitle}</p>

          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
            <Gauge className="h-3 w-3" />
            <span>Stage completion</span>
          </div>
        </div>
      </div>

      <div className="relative top-[4px] mt-1 h-[6px] w-[96%] mx-auto overflow-hidden rounded-full bg-emerald-200/55 dark:bg-emerald-950/45">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-fv-green-dark via-fv-green-medium to-fv-green-light transition-[width] duration-700 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.08)_35%,rgba(255,255,255,0.24)_50%,rgba(255,255,255,0.08)_65%,transparent_100%)] bg-[length:220%_100%] animate-crop-stage-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function CropProgressCard({
  crop,
  farmName,
  projectName,
  stage,
  progress,
  dayOf,
  totalDays,
  daysCompleted,
  estimatedFinish,
  daysLeft,
  className,
}: CropProgressCardProps) {
  const safeProgress = useMemo(
    () => clamp(Number.isFinite(progress) ? Math.round(progress) : 0, 0, 100),
    [progress]
  );

  const safeDayOf = useMemo(() => {
    const value = dayOf ?? totalDays ?? 1;
    return Math.max(1, Number.isFinite(value) ? Math.round(value) : 1);
  }, [dayOf, totalDays]);

  const safeDaysCompleted = useMemo(
    () =>
      clamp(
        Number.isFinite(daysCompleted) ? Math.round(daysCompleted) : 0,
        0,
        safeDayOf
      ),
    [daysCompleted, safeDayOf]
  );

  const safeDaysLeft = useMemo(
    () =>
      daysLeft == null
        ? clamp(safeDayOf - safeDaysCompleted, 0, safeDayOf)
        : clamp(Number.isFinite(daysLeft) ? Math.round(daysLeft) : 0, 0, safeDayOf),
    [daysLeft, safeDayOf, safeDaysCompleted]
  );

  const imageCandidates = useMemo(() => buildCropImageCandidates(crop || ''), [crop]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [imageCandidates]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setAnimatedProgress(safeProgress);
    });
    return () => cancelAnimationFrame(rafId);
  }, [safeProgress]);

  const handleImageError = () => {
    setActiveImageIndex((current) => Math.min(current + 1, imageCandidates.length - 1));
  };

  const imageSrc = imageCandidates[Math.min(activeImageIndex, imageCandidates.length - 1)];
  const cropLabel = prettifyCropName(crop || 'crop');
  const stageLabel = (stage || 'Stage').trim();
  const farmLabel = farmName?.trim() || projectName?.trim() || '';
  const subtitle = farmLabel ? `${farmLabel} • ${stageLabel}` : stageLabel;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/50 bg-card/65 p-3 sm:p-4 shadow-card backdrop-blur-sm',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsla(120,35%,38%,0.14)_0%,transparent_56%)]" />

      <div className="relative">
        <CropStripProgress
          imageSrc={imageSrc}
          cropLabel={cropLabel}
          progress={animatedProgress}
          subtitle={subtitle}
          onImageError={handleImageError}
        />

        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] sm:text-xs">
          <div className="rounded-lg border border-border/25 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              <span>
                Day {safeDaysCompleted} of {safeDayOf}
              </span>
            </div>
            <p className="mt-1 truncate text-foreground/90">
              {safeDaysCompleted} {safeDaysCompleted === 1 ? 'day' : 'days'} completed
            </p>
          </div>

          <div className="rounded-lg border border-border/25 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Flag className="h-3 w-3" />
              <span>Est. finish {estimatedFinish}</span>
            </div>
            <p className="mt-1 truncate text-foreground/90">
              {safeDaysLeft} {safeDaysLeft === 1 ? 'day' : 'days'} left
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
