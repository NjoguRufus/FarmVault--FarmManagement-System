import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFarmerSmartInbox } from '@/hooks/useFarmerSmartInbox';
import { renderBannerVariant, type BannerVariantKey } from './BannerVariants';
import './banner-tokens.css';

// Derive banner variant key from inbox slot + current hour
function resolveVariantKey(slot: 'morning' | 'evening' | 'weekly', hour: number): BannerVariantKey {
  if (slot === 'weekly') return 'weekly';
  if (slot === 'evening') {
    if (hour >= 21 || hour < 5) return 'night';
    return 'evening';
  }
  // morning slot: visual variant follows current time of day
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// CTA route by variant
function ctaRouteFor(key: BannerVariantKey): string {
  switch (key) {
    case 'weekly':    return '/reports';
    case 'tasks':     return '/operations';
    case 'harvest':   return '/operations';
    case 'milestone': return '/reports';
    case 'trial':     return '/billing';
    case 'setup':     return '/settings';
    default:          return '/home';
  }
}

interface SmartFarmBannerProps {
  companyId: string | null;
  clerkUserId: string | null;
  userName?: string;
  farmName?: string;
}

export function SmartFarmBanner({ companyId, clerkUserId, userName = 'Farmer', farmName = '' }: SmartFarmBannerProps) {
  const navigate = useNavigate();
  const { latestVisible, dismiss, dismissing } = useFarmerSmartInbox(companyId, clerkUserId);

  // Scale-to-fit state
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = (w: number) => setScale(w / 1600);
    update(el.getBoundingClientRect().width);
    const obs = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (!latestVisible) return null;

  const hour = new Date().getHours();
  const variantKey = resolveVariantKey(latestVisible.slot, hour);
  const ctaRoute = ctaRouteFor(variantKey);

  // First name heuristic: take word before first space or comma
  const firstName = userName.split(/[\s,]/)[0] || userName;

  const variantProps = {
    name: firstName,
    farmName,
    messageText: latestVisible.body || undefined,
    onCTA: () => navigate(ctaRoute),
  };

  const outerHeight = scale !== null ? Math.round(900 * scale) : 0;

  return (
    <div
      ref={outerRef}
      className="fv-banner-root"
      style={{
        width: '100%',
        height: outerHeight,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 12,
        boxShadow: '0 4px 32px -8px rgba(20,40,25,0.18)',
        // Hide until scale is computed to prevent layout flash
        visibility: scale !== null ? 'visible' : 'hidden',
      }}
    >
      {/* 1600×900 inner canvas, scaled to fit container */}
      {scale !== null && (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 1600, height: 900 }}>
          {renderBannerVariant(variantKey, variantProps)}
        </div>
      )}

      {/* Dismiss button — positioned relative to the outer container */}
      <button
        type="button"
        onClick={() => void dismiss(latestVisible.id)}
        disabled={dismissing}
        aria-label="Dismiss message"
        style={{
          position: 'absolute',
          top: Math.round(16 * (scale ?? 1)),
          right: Math.round(16 * (scale ?? 1)),
          width: Math.round(36 * (scale ?? 1)),
          height: Math.round(36 * (scale ?? 1)),
          borderRadius: '50%',
          background: 'oklch(0.18 0.02 145 / 0.55)',
          backdropFilter: 'blur(8px)',
          border: '1px solid oklch(0.97 0.015 85 / 0.2)',
          color: 'oklch(0.97 0.015 85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: dismissing ? 'not-allowed' : 'pointer',
          opacity: dismissing ? 0.5 : 1,
          zIndex: 10,
          transition: 'opacity 0.15s ease',
        }}
      >
        <X style={{ width: Math.round(16 * (scale ?? 1)), height: Math.round(16 * (scale ?? 1)) }} />
      </button>
    </div>
  );
}
