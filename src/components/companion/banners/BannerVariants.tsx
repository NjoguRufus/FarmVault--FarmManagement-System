import React from 'react';
import { BannerShell, ZoneLogo, ZoneTopRight, ZoneHero, ZoneMascot } from './BannerShell';
import { FarmVaultLogo, MetricCard, Pill } from './BannerPrimitives';

const MASCOT_SRC = 'https://app.farmvault.africa/mascot/mascot%201.png';

function MascotImg() {
  return (
    <img
      src={MASCOT_SRC}
      alt="FarmVault Companion"
      style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom center' }}
    />
  );
}

export interface BannerVariantProps {
  name?: string;
  farmName?: string;
  messageText?: string;
  onCTA?: () => void;
}

// ============================================================
// Variant 1 — GOOD MORNING
// ============================================================
export function V_GoodMorning({ name = 'Farmer' }: BannerVariantProps) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <BannerShell sceneTint="morning" sceneMood="Sunrise · maize fields · barn" sceneTime="06:24">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight>
        <Pill tone="cream" icon="☀">{dateLabel}</Pill>
      </ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 76, color: 'var(--fv-ink)', margin: 0 }}>
          Good morning,<br/>
          <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 2 — GOOD AFTERNOON
// ============================================================
export function V_GoodAfternoon({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="afternoon" sceneMood="Midday · open fields · clear sky" sceneTime="13:48">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="◯">Halfway through the day</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 76, color: 'var(--fv-ink)', margin: 0 }}>
          Afternoon,<br/>
          <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 3 — GOOD EVENING
// ============================================================
export function V_GoodEvening({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="evening" sceneMood="Dusk · long shadows · barn glow" sceneTime="18:42">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="◑">End of the working day</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 76, color: 'var(--fv-ink)', margin: 0 }}>
          Good evening,<br/>
          <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 4 — GOOD NIGHT
// ============================================================
export function V_GoodNight({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="night" sceneMood="Starlit field · barn lamp" sceneTime="21:15">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="☾">Day closed · auto-saved</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 76, color: 'var(--fv-ink)', margin: 0 }}>
          Rest well,<br/>
          <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 5 — WEEKLY SUMMARY
// ============================================================
export interface WeeklySummaryVariantProps extends BannerVariantProps {
  weekLabel?: string;
  revenue?: string;
  expenses?: string;
  profit?: string;
  activeCrops?: number;
}

export function V_WeeklySummary({ name = 'Farmer', weekLabel, revenue, expenses, profit, activeCrops }: WeeklySummaryVariantProps) {
  const now = new Date();
  const weekNum = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7);
  const defaultWeekLabel = `Week ${weekNum} · ${now.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}`;
  return (
    <BannerShell sceneTint="morning" sceneMood="Wide farm panorama" sceneTime="Mon 07:00">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight>
        <Pill tone="cream" icon="◧">{weekLabel || defaultWeekLabel}</Pill>
      </ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 64, color: 'var(--fv-ink)', margin: 0 }}>
          Here's your<br/>
          <span style={{ color: 'var(--fv-vault)' }}>farm summary.</span>
        </h1>
        {(revenue || expenses || profit || activeCrops) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 560 }}>
            {revenue && <MetricCard label="Total Revenue" value={revenue} unit="KES" icon="$" accent="var(--fv-positive)" />}
            {expenses && <MetricCard label="Total Expenses" value={expenses} unit="KES" icon="◇" accent="var(--fv-harvest-deep)" />}
            {profit && <MetricCard label="Net Profit" value={profit} unit="KES" deltaDir="up" icon="◐" accent="var(--fv-vault)" />}
            {activeCrops && <MetricCard label="Active Crops" value={activeCrops} footnote="tracked" icon="✿" accent="var(--fv-leaf)" />}
          </div>
        )}
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 6 — INACTIVE USER (gentle nudge)
// ============================================================
export function V_Inactive({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="overcast" sceneMood="Cool overcast · quiet field" sceneTime="—">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="alert" icon="◐">We've missed you</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 72, color: 'var(--fv-ink)', margin: 0 }}>
          It's been<br/>
          <span style={{ color: 'var(--fv-vault)' }}>quiet here, {name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 7 — WE MISS YOU (deeper re-engagement)
// ============================================================
export function V_WeMissYou({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="evening" sceneMood="Sunset · still farm" sceneTime="—">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="alert" icon="◐">30 days inactive</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 76, color: 'var(--fv-ink)', margin: 0 }}>
          We miss you,<br/>
          <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 8 — PENDING TASKS
// ============================================================
export function V_PendingTasks({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="afternoon" sceneMood="Mid-day · maize rows · tractor" sceneTime="14:02">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight>
        <Pill tone="alert" icon="●">Action needed</Pill>
      </ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 72, color: 'var(--fv-ink)', margin: 0 }}>
          Tasks need<br/>
          <span style={{ color: 'oklch(0.55 0.16 50)' }}>your review.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 9 — HARVEST REMINDER
// ============================================================
export function V_HarvestReminder({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="morning" sceneMood="Maize ready · golden tassels" sceneTime="07:48">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="gold" icon="◐">Harvest window approaching</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 70, color: 'var(--fv-ink)', margin: 0 }}>
          Your crop is<br/>
          <span style={{ color: 'oklch(0.58 0.14 70)' }}>nearly ready.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 10 — REVENUE MILESTONE
// ============================================================
export function V_RevenueMilestone({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="morning" sceneMood="Open field, ascending light" sceneTime="08:30">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="gold" icon="★">Milestone reached</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 64, color: 'var(--fv-ink)', margin: 0 }}>
          You've hit a<br/>
          <span style={{ color: 'var(--fv-vault)' }}>new milestone</span><br/>
          <span style={{ color: 'var(--fv-ink-soft)', fontSize: 46 }}>this season, {name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 11 — TRIAL EXPIRING
// ============================================================
export function V_TrialExpiring({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="evening" sceneMood="Late afternoon, soft light" sceneTime="16:50">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="gold" icon="◐">Trial ending soon</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 70, color: 'var(--fv-ink)', margin: 0 }}>
          Don't lose<br/>
          <span style={{ color: 'var(--fv-vault)' }}>your records, {name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// Variant 12 — SETUP INCOMPLETE / NEW USER
// ============================================================
export function V_SetupIncomplete({ name = 'Farmer' }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="morning" sceneMood="Open field · fresh furrows" sceneTime="08:00">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="◑">Setup in progress</Pill></ZoneTopRight>
      <ZoneHero>
        <h1 className="fv-display" style={{ fontSize: 72, color: 'var(--fv-ink)', margin: 0 }}>
          Let's finish<br/>
          <span style={{ color: 'var(--fv-vault)' }}>setting up, {name}.</span>
        </h1>
      </ZoneHero>
      <ZoneMascot><MascotImg /></ZoneMascot>
    </BannerShell>
  );
}

// ============================================================
// VARIANT KEY + RENDER HELPER
// ============================================================
export type BannerVariantKey =
  | 'morning' | 'afternoon' | 'evening' | 'night'
  | 'weekly' | 'inactive' | 'missyou' | 'tasks'
  | 'harvest' | 'milestone' | 'trial' | 'setup';

export function renderBannerVariant(key: BannerVariantKey, props: BannerVariantProps & WeeklySummaryVariantProps) {
  switch (key) {
    case 'morning':   return <V_GoodMorning {...props} />;
    case 'afternoon': return <V_GoodAfternoon {...props} />;
    case 'evening':   return <V_GoodEvening {...props} />;
    case 'night':     return <V_GoodNight {...props} />;
    case 'weekly':    return <V_WeeklySummary {...props} />;
    case 'inactive':  return <V_Inactive {...props} />;
    case 'missyou':   return <V_WeMissYou {...props} />;
    case 'tasks':     return <V_PendingTasks {...props} />;
    case 'harvest':   return <V_HarvestReminder {...props} />;
    case 'milestone': return <V_RevenueMilestone {...props} />;
    case 'trial':     return <V_TrialExpiring {...props} />;
    case 'setup':     return <V_SetupIncomplete {...props} />;
    default:          return <V_GoodMorning {...props} />;
  }
}
