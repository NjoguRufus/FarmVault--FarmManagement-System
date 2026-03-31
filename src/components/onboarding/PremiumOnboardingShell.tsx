import React from 'react';
import { cn } from '@/lib/utils';

type StepDef = {
  label: string;
};

const DEFAULT_STEPS: StepDef[] = [
  { label: 'Your Farm' },
  { label: 'Your Crop' },
  { label: "You're Ready" },
];

function StepIndicator({ step, className, steps = DEFAULT_STEPS }: { step: number; className?: string; steps?: StepDef[] }) {
  const total = steps.length;
  const active = Math.min(Math.max(step, 1), total);
  const progressPct = total <= 1 ? 100 : ((active - 1) / (total - 1)) * 100;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">STEP {active} OF {total}</p>
        <p className="text-[11px] text-white/65">{steps[active - 1]?.label}</p>
      </div>

      <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/70 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        {steps.map((s, idx) => {
          const n = idx + 1;
          const isActive = n === active;
          const isDone = n < active;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2 w-2 rounded-full transition-all duration-300',
                  isDone ? 'bg-white/65' : isActive ? 'bg-white/90' : 'bg-white/25',
                )}
                aria-hidden
              />
              {idx < steps.length - 1 && <span className="h-px w-6 bg-white/20" aria-hidden />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PremiumOnboardingShell({
  step,
  rightTitle,
  rightSubtitle,
  logo,
  children,
  belowPanel,
  className,
}: {
  step: number;
  rightTitle: string;
  rightSubtitle?: string;
  logo?: React.ReactNode;
  children: React.ReactNode;
  belowPanel?: React.ReactNode;
  className?: string;
}) {
  // High-quality farm hero (remote) to avoid adding binary assets + keep repo light.
  // If you later add a local image, replace with: '/images/onboarding-farm.jpg'
  const backgroundUrl =
    "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=2400&q=80";

  return (
    <div
      className={cn(
        'min-h-screen',
        'relative',
        className,
      )}
    >
      {/* Full-screen background image */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[#0B0F0D] bg-cover bg-center"
        style={{ backgroundImage: `url('${backgroundUrl}')` }}
      />

      {/* Dark overlay for readability */}
      <div aria-hidden className="absolute inset-0 bg-black/55" />

      {/* Vignette (no gradients) */}
      <div
        aria-hidden
        className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_0_160px_rgba(0,0,0,0.72),inset_0_0_320px_rgba(0,0,0,0.72),inset_0_-180px_140px_rgba(0,0,0,0.75)]"
      />

      {/* Subtle grain */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 opacity-[0.22] mix-blend-overlay',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E\")]",
        )}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-5 py-10 sm:px-8 sm:py-14">
        {/* Top hero copy */}
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.26em] text-white/65">FARMVAULT ONBOARDING</p>
          <h1 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
            You&apos;re about to farm smarter
          </h1>
          {step !== 3 && (
            <div className="mt-4 max-w-xl">
              <p className="inline-block rounded-xl bg-black/30 px-3 py-2 text-sm leading-relaxed text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:text-base">
                FarmVault helps you track crops, workers, harvest and profit in one place.
              </p>
            </div>
          )}
        </div>

        {/* Floating onboarding panel */}
        <div className="mt-10 w-full">
          <div className="relative max-w-xl sm:max-w-lg md:max-w-xl">
            <div
              className={cn(
                'relative overflow-hidden rounded-[20px]',
                'border border-white/18',
                'bg-white/18 backdrop-blur-xl',
                'shadow-[0_22px_70px_rgba(0,0,0,0.35)]',
              )}
            >
              <div aria-hidden className="absolute inset-0 pointer-events-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]" />

              <div className="relative p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {logo}
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white/65">FARMVAULT ONBOARDING</p>
                      <p className="mt-1 text-sm font-medium text-white/95">{rightTitle}</p>
                    </div>
                  </div>
                </div>

                {rightSubtitle && (
                  <p className="mt-4 text-sm leading-relaxed text-white/70">{rightSubtitle}</p>
                )}

                <StepIndicator step={step} className="mt-6" />

                <div className="mt-7">{children}</div>
              </div>
            </div>
          </div>
        </div>

        {belowPanel && (
          <div className="mt-6 w-full">
            <div className="max-w-4xl">{belowPanel}</div>
          </div>
        )}

        {/* Bottom helper */}
        <div className="mt-10">
          <p className="text-xs text-white/60">Calm setup. Clear steps. Your season, organized.</p>
        </div>
      </div>
    </div>
  );
}

