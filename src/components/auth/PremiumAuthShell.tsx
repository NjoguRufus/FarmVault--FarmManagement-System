import React from 'react';
import { cn } from '@/lib/utils';

export function PremiumAuthShell({
  title,
  subtitle,
  eyebrow = 'FARMVAULT',
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  // Keep consistent with premium onboarding: cinematic farm hero, dark overlay, subtle vignette + grain.
  const backgroundUrl =
    "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=2400&q=80";

  return (
    <div className={cn('w-full min-h-screen relative overflow-x-hidden', className)}>
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

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-4 py-8 sm:justify-between sm:gap-0 sm:px-8 sm:py-14">
        {/* Top brand area */}
        <div className="w-full min-w-0 max-w-2xl break-words">
          <p className="text-[11px] uppercase tracking-[0.26em] text-white/65">{eyebrow}</p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.12] tracking-tight text-white sm:mt-4 sm:text-5xl sm:leading-[1.08]">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-3 max-w-xl sm:mt-4">
              <p className="inline-block rounded-lg bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:rounded-xl sm:text-base">
                {subtitle}
              </p>
            </div>
          )}
        </div>

        {/* Floating auth panel */}
        <div className="w-full">
          <div className="mx-auto w-full max-w-sm box-border sm:max-w-lg">
            <div
              className={cn(
                // Avoid clipping Clerk buttons/inputs on small screens (some elements animate/shadow outside bounds).
                'relative overflow-hidden rounded-[20px] sm:rounded-[24px]',
                'border border-white/18',
                'bg-white/18 backdrop-blur-xl',
                'shadow-[0_22px_70px_rgba(0,0,0,0.35)]',
                // Card padding rules (mobile-first)
                'box-border px-5 py-6 sm:px-8 sm:py-8',
              )}
            >
              <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]" />
              {/* Inner form stack: single constrained column */}
              <div className="w-full min-w-0 max-w-full overflow-hidden box-border flex flex-col gap-4 [&_*]:box-border [&_*]:max-w-full [&_*]:min-w-0">
                {children}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom helper */}
        <div className="mt-2 sm:mt-10">
          {footer ?? <p className="text-xs text-white/60">Trustworthy, calm entry—built for modern farms.</p>}
        </div>
      </div>
    </div>
  );
}

