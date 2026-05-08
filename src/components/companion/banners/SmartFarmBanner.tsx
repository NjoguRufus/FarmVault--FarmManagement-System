import React, { useLayoutEffect, useRef, useState, useCallback } from 'react';
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
  onSessionDismiss?: () => void;
}

export function SmartFarmBanner({ companyId, clerkUserId, userName = 'Farmer', farmName = '', onSessionDismiss }: SmartFarmBannerProps) {
  const navigate = useNavigate();
  const { latestVisible, dismiss, dismissing } = useFarmerSmartInbox(companyId, clerkUserId);

  // Scale-to-fit state
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [sessionHidden, setSessionHidden] = useState(false);

  const handleDismiss = useCallback(() => {
    if (latestVisible) {
      void dismiss(latestVisible.id);
    } else {
      setSessionHidden(true);
      onSessionDismiss?.();
    }
  }, [latestVisible, dismiss, onSessionDismiss]);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = (w: number) => setScale(w / 1600);
    update(el.getBoundingClientRect().width);
    const obs = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (sessionHidden) return null;

  const hour = new Date().getHours();

  // First name heuristic: take word before first space or comma
  const firstName = userName.split(/[\s,]/)[0] || userName;

  // Resolve variant: inbox message wins; fall back to time-of-day greeting
  const variantKey: BannerVariantKey = latestVisible
    ? resolveVariantKey(latestVisible.slot, hour)
    : hour >= 5 && hour < 12 ? 'morning'
    : hour >= 12 && hour < 17 ? 'afternoon'
    : hour >= 17 && hour < 21 ? 'evening'
    : 'night';

  const ctaRoute = ctaRouteFor(variantKey);

  const variantProps = {
    name: firstName,
    farmName,
    messageText: latestVisible?.body || undefined,
    onCTA: () => navigate(ctaRoute),
  };

  const outerHeight = scale !== null ? Math.round(500 * scale) : 0;

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
      {/* 1600×500 inner canvas, scaled to fit container */}
      {scale !== null && (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 1600, height: 500 }}>
          {renderBannerVariant(variantKey, variantProps)}
        </div>
      )}

      {/* Dismiss button — always visible */}
      <button
        type="button"
        onClick={handleDismiss}
        disabled={dismissing}
        aria-label="Dismiss banner"
        style={{
          position: 'absolute',
          top: Math.round(14 * (scale ?? 1)),
          right: Math.round(14 * (scale ?? 1)),
          width: Math.round(48 * (scale ?? 1)),
          height: Math.round(48 * (scale ?? 1)),
          borderRadius: '50%',
          background: 'oklch(0.14 0.02 145 / 0.72)',
          backdropFilter: 'blur(10px)',
          border: '1.5px solid oklch(0.97 0.015 85 / 0.35)',
          color: 'oklch(0.97 0.015 85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: dismissing ? 'not-allowed' : 'pointer',
          opacity: dismissing ? 0.5 : 1,
          zIndex: 10,
          transition: 'opacity 0.15s ease, background 0.15s ease',
        }}
      >
        <X style={{ width: Math.round(22 * (scale ?? 1)), height: Math.round(22 * (scale ?? 1)), strokeWidth: 2.5 }} />
      </button>
    </div>
  );
}
