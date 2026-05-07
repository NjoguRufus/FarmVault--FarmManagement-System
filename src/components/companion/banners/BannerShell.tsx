import React from 'react';
import { SceneSlot, type SceneTint } from './BannerPrimitives';

// ============================================================
// MASTER BANNER SHELL — fixed 1600×900 design canvas
// Scale to container via ScaleBannerWrapper in SmartFarmBanner
// ============================================================

interface BannerShellProps {
  children: React.ReactNode;
  sceneTint?: SceneTint;
  sceneMood?: string;
  sceneTime?: string;
}

export function BannerShell({ children, sceneTint = 'morning', sceneMood = 'Golden hour, barn + windmill', sceneTime = '06:30' }: BannerShellProps) {
  return (
    <div className="fv-banner" style={{
      width: 1600, height: 900,
      position: 'relative', overflow: 'hidden',
      background: 'var(--fv-parchment)', isolation: 'isolate',
    }}>
      {/* RIGHT half: scene */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: '62%', height: '100%' }}>
        <SceneSlot tint={sceneTint} mood={sceneMood} time={sceneTime} />
      </div>

      {/* Parchment fade over scene */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: '62%', height: '100%',
        background: 'linear-gradient(90deg, var(--fv-parchment) 0%, var(--fv-parchment) 55%, var(--fv-parchment-warm) 80%, transparent 100%)',
        zIndex: 1,
      }} />

      {/* Subtle paper grain */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: '55%', height: '100%',
        backgroundImage: 'radial-gradient(oklch(0.32 0.06 145 / 0.04) 1px, transparent 1px)',
        backgroundSize: '3px 3px', opacity: 0.5, zIndex: 1,
      }} />

      {/* Content layer */}
      <div style={{
        position: 'relative', zIndex: 2, height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto 1fr auto',
        padding: '56px 64px', gap: 0,
      }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// LAYOUT ZONES
// ============================================================

export function ZoneLogo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '1 / 2', gridRow: '1 / 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {children}
    </div>
  );
}

export function ZoneTopRight({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '2 / 3', gridRow: '1 / 2', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 12 }}>
      {children}
    </div>
  );
}

export function ZoneHero({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '1 / 2', gridRow: '2 / 3', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 40, gap: 28, minWidth: 0 }}>
      {children}
    </div>
  );
}

export function ZoneMascot({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '2 / 3', gridRow: '1 / 4', position: 'relative', marginRight: -64, marginTop: -56, marginBottom: -56 }}>
      <div style={{ position: 'absolute', inset: 0, padding: '56px 0 56px 40px' }}>
        {children}
      </div>
    </div>
  );
}

export function ZoneFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '1 / 2', gridRow: '3 / 4', display: 'flex', flexDirection: 'column', gap: 18, paddingRight: 40 }}>
      {children}
    </div>
  );
}

// ============================================================
// LEAF RULE — decorative separator
// ============================================================
export function LeafRule() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 60, height: 2, background: 'var(--fv-vault)', borderRadius: 2 }} />
      <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
        <path d="M2 7 C 2 3, 6 1, 9 1 C 12 1, 16 3, 16 7 C 13 7, 9 9, 9 13 C 9 9, 5 7, 2 7 Z" fill="var(--fv-leaf)" />
      </svg>
      <div style={{ width: 60, height: 2, background: 'var(--fv-vault)', borderRadius: 2, opacity: 0.4 }} />
    </div>
  );
}
