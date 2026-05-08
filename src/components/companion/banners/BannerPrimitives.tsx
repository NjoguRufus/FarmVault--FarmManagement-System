import React from 'react';

// ============================================================
// SCENE BACKGROUND SLOT — gradient placeholder for farm scenes
// ============================================================
export type SceneTint = 'morning' | 'afternoon' | 'evening' | 'night' | 'overcast';

const SCENE_TINTS: Record<SceneTint, [string, string, string]> = {
  morning:   ['oklch(0.92 0.04 80)', 'oklch(0.82 0.07 70)', 'oklch(0.62 0.09 60)'],
  afternoon: ['oklch(0.88 0.05 90)', 'oklch(0.78 0.08 95)', 'oklch(0.58 0.10 110)'],
  evening:   ['oklch(0.72 0.10 50)', 'oklch(0.52 0.12 40)', 'oklch(0.32 0.08 30)'],
  night:     ['oklch(0.32 0.05 250)', 'oklch(0.22 0.06 260)', 'oklch(0.14 0.04 250)'],
  overcast:  ['oklch(0.84 0.02 230)', 'oklch(0.72 0.025 220)', 'oklch(0.52 0.03 210)'],
};

interface SceneSlotProps {
  mood?: string;
  time?: string;
  tint?: SceneTint;
}

export function SceneSlot({ mood = 'Golden hour, barn + windmill', time = '06:30', tint = 'morning' }: SceneSlotProps) {
  const [a, b, c] = SCENE_TINTS[tint] ?? SCENE_TINTS.morning;
  return (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${a} 0%, ${b} 50%, ${c} 100%)`, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '68%', height: '32%',
        background: 'linear-gradient(180deg, oklch(0.42 0.08 145 / 0.4) 0%, oklch(0.28 0.06 145 / 0.7) 100%)',
      }} />
      <div style={{
        position: 'absolute', right: '14%', top: '22%', width: 90, height: 90,
        borderRadius: '50%',
        background: tint === 'night'
          ? 'radial-gradient(circle, oklch(0.92 0.02 240) 0%, oklch(0.72 0.03 240 / 0.6) 60%, transparent 70%)'
          : 'radial-gradient(circle, oklch(0.95 0.08 85) 0%, oklch(0.85 0.12 75 / 0.7) 50%, transparent 70%)',
        filter: 'blur(2px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(45deg, transparent 0 60px, rgba(255,255,255,0.03) 60px 61px)',
      }} />
    </div>
  );
}

// ============================================================
// MASCOT PLACEHOLDER — labeled production dropzone per design spec
// ============================================================
interface MascotSlotProps {
  pose?: string;
  expression?: string;
  lighting?: string;
  id?: string;
}

export function MascotSlot({
  pose = 'Wave / Greeting',
  expression = 'Warm smile',
  lighting = 'Golden hour',
  id = 'mascot-default',
}: MascotSlotProps) {
  const stripeColor = 'rgba(20, 40, 25, 0.06)';
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      borderRadius: 'var(--fv-r-lg)', overflow: 'hidden',
      background: `
        linear-gradient(180deg, oklch(0.94 0.03 80) 0%, oklch(0.88 0.05 75) 50%, oklch(0.78 0.07 70) 100%),
        repeating-linear-gradient(135deg, transparent 0 18px, ${stripeColor} 18px 19px)
      `,
      backgroundBlendMode: 'multiply',
      border: '1px dashed oklch(0.45 0.06 145 / 0.35)',
    }}>
      <div style={{
        position: 'absolute', right: '8%', bottom: 0, width: '78%', height: '92%',
        background: `
          radial-gradient(ellipse 45% 28% at 50% 18%, oklch(0.32 0.06 145 / 0.32), transparent 70%),
          radial-gradient(ellipse 55% 60% at 50% 65%, oklch(0.32 0.06 145 / 0.22), transparent 75%)
        `,
        filter: 'blur(2px)',
      }} />
      <div style={{
        position: 'absolute', right: '18%', top: '12%', width: '60%', height: '8%',
        background: 'oklch(0.32 0.06 145 / 0.28)', borderRadius: '999px', filter: 'blur(1px)',
      }} />
      <div style={{
        position: 'absolute', left: 18, top: 18,
        display: 'flex', flexDirection: 'column', gap: 6,
        background: 'oklch(0.99 0.008 85 / 0.85)', backdropFilter: 'blur(8px)',
        padding: '10px 12px', borderRadius: 10, border: '1px solid var(--fv-line)',
        fontFamily: 'var(--fv-mono)', fontSize: 10, lineHeight: 1.5,
        color: 'var(--fv-ink-soft)', maxWidth: 220,
      }}>
        <div style={{ color: 'var(--fv-vault)', fontWeight: 600, letterSpacing: '0.08em' }}>◇ MASCOT RENDER</div>
        <div><span style={{ color: 'var(--fv-mute)' }}>pose:</span> {pose}</div>
        <div><span style={{ color: 'var(--fv-mute)' }}>face:</span> {expression}</div>
        <div><span style={{ color: 'var(--fv-mute)' }}>light:</span> {lighting}</div>
        <div style={{ color: 'var(--fv-mute)', marginTop: 2, fontSize: 9 }}>id: {id}</div>
      </div>
    </div>
  );
}

// ============================================================
// LOGO LOCKUP
// ============================================================
interface FarmVaultLogoProps {
  scale?: number;
  mono?: boolean;
}

export function FarmVaultLogo({ scale = 1, mono = false }: FarmVaultLogoProps) {
  const ink = mono ? 'oklch(0.97 0.015 85)' : 'var(--fv-ink)';
  const accent = mono ? 'oklch(0.85 0.12 80)' : 'var(--fv-harvest-deep)';
  const shieldFill = mono ? 'oklch(0.97 0.015 85 / 0.12)' : 'var(--fv-forest)';
  const shieldStroke = mono ? 'oklch(0.97 0.015 85 / 0.4)' : 'var(--fv-forest-deep)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 * scale }}>
      <svg width={42 * scale} height={48 * scale} viewBox="0 0 42 48" fill="none">
        <path d="M21 1 L40 7 V24 C40 36 32 44 21 47 C10 44 2 36 2 24 V7 Z"
              fill={shieldFill} stroke={shieldStroke} strokeWidth="1.5"/>
        <circle cx="21" cy="24" r="9" fill="none" stroke={accent} strokeWidth="2"/>
        <circle cx="21" cy="24" r="2.5" fill={accent}/>
        <path d="M21 15 V11 M21 37 V33 M30 24 H34 M8 24 H12 M27.5 17.5 L30 15 M14.5 30.5 L12 33 M27.5 30.5 L30 33 M14.5 17.5 L12 15"
              stroke={accent} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
      <div style={{
        fontFamily: 'var(--fv-display)', fontWeight: 700,
        fontSize: 26 * scale, letterSpacing: '-0.02em',
        color: ink, lineHeight: 1,
      }}>
        Farm<span style={{ color: accent }}>Vault</span>
      </div>
    </div>
  );
}

// ============================================================
// METRIC CARD
// ============================================================
export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDir?: 'up' | 'down' | 'flat';
  icon?: string;
  accent?: string;
  footnote?: string;
}

export function MetricCard({ label, value, unit, delta, deltaDir = 'up', icon, accent = 'var(--fv-vault)', footnote }: MetricCardProps) {
  const arrow = deltaDir === 'up' ? '↑' : deltaDir === 'down' ? '↓' : '→';
  const deltaColor = deltaDir === 'up' ? 'var(--fv-positive)' : deltaDir === 'down' ? 'var(--fv-alert)' : 'var(--fv-mute)';
  return (
    <div style={{
      background: 'var(--fv-cream)', border: '1px solid var(--fv-line)',
      borderRadius: 'var(--fv-r-md)', padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: 'var(--fv-shadow-card)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="fv-eyebrow" style={{ fontSize: 10 }}>{label}</span>
        {icon && (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: accent, opacity: 0.12, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1, color: accent, fontSize: 14, fontWeight: 700 }}>{icon}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        {unit && <span style={{ fontSize: 13, color: 'var(--fv-mute)', fontWeight: 600 }}>{unit}</span>}
        <span className="fv-display" style={{ fontSize: 26, color: 'var(--fv-ink)' }}>{value}</span>
      </div>
      {(delta || footnote) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          {delta && <span style={{ color: deltaColor, fontWeight: 600 }}>{arrow} {delta}</span>}
          {footnote && <span style={{ color: 'var(--fv-mute)' }}>{footnote}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CTA BUTTON
// ============================================================
export type CTAVariant = 'primary' | 'gold' | 'ghost';

interface CTAProps {
  children: React.ReactNode;
  variant?: CTAVariant;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const CTA_SIZES = {
  sm: { pad: '10px 16px', fs: 13 },
  md: { pad: '14px 22px', fs: 14 },
  lg: { pad: '18px 28px', fs: 16 },
};

const CTA_STYLES: Record<CTAVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(180deg, var(--fv-vault) 0%, var(--fv-forest) 100%)',
    color: 'var(--fv-cream)',
    boxShadow: 'var(--fv-shadow-cta)',
    border: '1px solid var(--fv-forest-deep)',
  },
  gold: {
    background: 'linear-gradient(180deg, var(--fv-harvest) 0%, var(--fv-harvest-deep) 100%)',
    color: 'var(--fv-forest-deep)',
    boxShadow: '0 8px 22px -8px oklch(0.66 0.15 70 / 0.55)',
    border: '1px solid oklch(0.55 0.12 65)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--fv-forest-deep)',
    border: '1px solid var(--fv-forest-mid)',
  },
};

export function CTA({ children, variant = 'primary', size = 'md', onClick }: CTAProps) {
  const s = CTA_SIZES[size];
  return (
    <button type="button" onClick={onClick} style={{
      ...CTA_STYLES[variant],
      padding: s.pad, fontSize: s.fs, fontFamily: 'var(--fv-body)',
      fontWeight: 600, borderRadius: 999, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 10,
      letterSpacing: '-0.005em', transition: 'transform .15s ease',
    }}>
      {children}
      <span style={{ fontSize: s.fs * 1.1, lineHeight: 0 }}>→</span>
    </button>
  );
}

// ============================================================
// PILL / BADGE
// ============================================================
export type PillTone = 'neutral' | 'forest' | 'gold' | 'alert' | 'cream';

interface PillProps {
  children: React.ReactNode;
  tone?: PillTone;
  icon?: React.ReactNode;
}

const PILL_TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'oklch(0.97 0.015 85)', fg: 'var(--fv-ink-soft)', bd: 'var(--fv-line)' },
  forest:  { bg: 'oklch(0.32 0.06 145 / 0.08)', fg: 'var(--fv-forest-deep)', bd: 'oklch(0.32 0.06 145 / 0.18)' },
  gold:    { bg: 'oklch(0.78 0.14 80 / 0.15)', fg: 'oklch(0.45 0.12 70)', bd: 'oklch(0.78 0.14 80 / 0.4)' },
  alert:   { bg: 'oklch(0.68 0.16 40 / 0.12)', fg: 'oklch(0.48 0.16 40)', bd: 'oklch(0.68 0.16 40 / 0.3)' },
  cream:   { bg: 'var(--fv-cream)', fg: 'var(--fv-forest-deep)', bd: 'var(--fv-line)' },
};

export function Pill({ children, tone = 'neutral', icon }: PillProps) {
  const t = PILL_TONES[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 999,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontSize: 12, fontWeight: 500, lineHeight: 1,
    }}>
      {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      {children}
    </span>
  );
}
