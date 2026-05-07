import React from 'react';
import { BannerShell, ZoneLogo, ZoneTopRight, ZoneHero, ZoneMascot, ZoneFooter, LeafRule } from './BannerShell';
import { FarmVaultLogo, MascotSlot, MetricCard, CTA, Pill } from './BannerPrimitives';

export interface BannerVariantProps {
  name?: string;
  farmName?: string;
  messageText?: string;
  onCTA?: () => void;
}

// ============================================================
// Variant 1 — GOOD MORNING
// ============================================================
export function V_GoodMorning({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <BannerShell sceneTint="morning" sceneMood="Sunrise · maize fields · barn" sceneTime="06:24">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight>
        <Pill tone="cream" icon="☀">{ dateLabel}</Pill>
      </ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ MORNING BRIEFING</div>
          <h1 className="fv-display" style={{ fontSize: 96, color: 'var(--fv-ink)', margin: 0 }}>
            Good morning,<br/>
            <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0, textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
          {messageText || 'A new day on the farm begins. Open FarmVault to check your tasks, log progress, and keep your season on track.'}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Pill tone="forest" icon="✓">Farm ready</Pill>
          <Pill tone="gold" icon="◐">New day</Pill>
        </div>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Standing wave, hand at chest height" expression="Warm smile, eyes engaged" lighting="Backlit golden hour, soft rim" id="mascot-morning-wave" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>Open My Farm Dashboard</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 260, textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
            Your farming companion is always with you.
          </span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 2 — GOOD AFTERNOON
// ============================================================
export function V_GoodAfternoon({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="afternoon" sceneMood="Midday · open fields · clear sky" sceneTime="13:48">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="◯">Halfway through the day</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ MIDDAY CHECK-IN</div>
          <h1 className="fv-display" style={{ fontSize: 96, color: 'var(--fv-ink)', margin: 0 }}>
            Afternoon,<br/>
            <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'Your farm is running through the day. Check in on your team, review pending entries, and keep the season moving.'}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Pill tone="forest" icon="◐">Midday check</Pill>
        </div>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Reviewing tablet, slight lean forward" expression="Focused, light smile" lighting="Overhead sun, soft shadow" id="mascot-afternoon-tablet" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>Review Today's Activity</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 260 }}>The day's still young — keep moving.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 3 — GOOD EVENING
// ============================================================
export function V_GoodEvening({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="evening" sceneMood="Dusk · long shadows · barn glow" sceneTime="18:42">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="◑">End of the working day</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ EVENING WRAP</div>
          <h1 className="fv-display" style={{ fontSize: 96, color: 'var(--fv-ink)', margin: 0 }}>
            Good evening,<br/>
            <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'You\'ve made it through another farming day. Take a quick look at completed operations and what tomorrow needs from you.'}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Pill tone="forest" icon="✓">Day done</Pill>
          <Pill tone="gold" icon="◐">Tomorrow ready</Pill>
        </div>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Hands on hips, surveying field" expression="Calm, satisfied" lighting="Warm dusk, low sun rim" id="mascot-evening-survey" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>Review Today's Summary</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>Rest well — tomorrow's growth starts today.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 4 — GOOD NIGHT
// ============================================================
export function V_GoodNight({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="night" sceneMood="Starlit field · barn lamp" sceneTime="21:15">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="☾">Day closed · auto-saved</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ DAY COMPLETE</div>
          <h1 className="fv-display" style={{ fontSize: 96, color: 'var(--fv-ink)', margin: 0 }}>
            Rest well,<br/>
            <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'Today\'s records are saved. Your farm is quiet, organized, and ready for tomorrow\'s first light.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Pill tone="forest" icon="✓">All entries synced</Pill>
          <Pill tone="gold" icon="◐">Sunrise tasks queued</Pill>
        </div>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Closing barn door, lantern in hand" expression="Soft smile, eyes down" lighting="Lantern + moonlight" id="mascot-night-lantern" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" variant="ghost" onClick={onCTA}>Plan Tomorrow</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>FarmVault keeps watch overnight.</span>
        </div>
      </ZoneFooter>
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

export function V_WeeklySummary({ name = 'Farmer', messageText, weekLabel, revenue, expenses, profit, activeCrops, onCTA }: WeeklySummaryVariantProps) {
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
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ YOUR WEEK ON THE FARM</div>
          <h1 className="fv-display" style={{ fontSize: 84, color: 'var(--fv-ink)', margin: 0 }}>
            Here's your<br/>
            <span style={{ color: 'var(--fv-vault)' }}>farm summary.</span>
          </h1>
        </div>
        <LeafRule />
        {messageText && (
          <p style={{ fontSize: 20, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>{messageText}</p>
        )}
        {(revenue || expenses || profit || activeCrops) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 560 }}>
            {revenue && <MetricCard label="Total Revenue" value={revenue} unit="KES" icon="$" accent="var(--fv-positive)" />}
            {expenses && <MetricCard label="Total Expenses" value={expenses} unit="KES" icon="◇" accent="var(--fv-harvest-deep)" />}
            {profit && <MetricCard label="Net Profit" value={profit} unit="KES" deltaDir="up" icon="◐" accent="var(--fv-vault)" />}
            {activeCrops && <MetricCard label="Active Crops" value={activeCrops} footnote="tracked" icon="✿" accent="var(--fv-leaf)" />}
          </div>
        )}
        {!messageText && !revenue && (
          <p style={{ fontSize: 20, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
            Your records are getting more valuable every week. Open FarmVault to see how this week shaped up.
          </p>
        )}
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Holding ledger book, pointing at page" expression="Proud, pleased" lighting="Soft morning, warm fill" id="mascot-summary-ledger" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>View Full Farm Summary</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>Your records are getting more valuable every week.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 6 — INACTIVE USER (gentle nudge)
// ============================================================
export function V_Inactive({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="overcast" sceneMood="Cool overcast · quiet field" sceneTime="—">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="alert" icon="◐">We've missed you</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ A QUIET CHECK-IN</div>
          <h1 className="fv-display" style={{ fontSize: 92, color: 'var(--fv-ink)', margin: 0 }}>
            It's been<br/>
            <span style={{ color: 'var(--fv-vault)' }}>quiet here, {name}.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'Your crops, records, and ongoing activities are still waiting inside FarmVault. A short check-in today keeps your season on track.'}
        </p>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Leaning on fence, looking toward viewer" expression="Patient, hopeful" lighting="Soft overcast, gentle wrap" id="mascot-inactive-fence" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>Resume Farm Operations</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>Your farm still needs you.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 7 — WE MISS YOU (deeper re-engagement)
// ============================================================
export function V_WeMissYou({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="evening" sceneMood="Sunset · still farm" sceneTime="—">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="alert" icon="◐">30 days inactive</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ COME BACK TO YOUR FARM</div>
          <h1 className="fv-display" style={{ fontSize: 96, color: 'var(--fv-ink)', margin: 0 }}>
            We miss you,<br/>
            <span style={{ color: 'var(--fv-vault)' }}>{name}.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'Your farm is always counting on you. Come back and let\'s keep growing together — your records, your team, and your season are waiting.'}
        </p>
        <div style={{
          background: 'var(--fv-cream)', border: '1px solid var(--fv-line)',
          borderRadius: 'var(--fv-r-md)', padding: 18,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          maxWidth: 560, boxShadow: 'var(--fv-shadow-card)',
        }}>
          <div className="fv-eyebrow" style={{ gridColumn: '1 / 3' }}>What's waiting for you</div>
          {[
            ['◐', 'Real-time insights for better decisions'],
            ['◇', 'Organized tasks and schedules'],
            ['$', 'Higher profits and savings'],
            ['☁', 'Timely weather and advisory'],
          ].map(([ic, txt], i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: 'oklch(0.32 0.06 145 / 0.1)',
                color: 'var(--fv-vault)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>{ic}</div>
              <span style={{ fontSize: 13, color: 'var(--fv-ink-soft)', lineHeight: 1.4 }}>{txt}</span>
            </div>
          ))}
        </div>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Holding letter / parchment toward viewer" expression="Hopeful, slightly wistful" lighting="Sunset wash, warm rim" id="mascot-missyou-letter" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>Log In to FarmVault</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>Your farm. Your data. Your growth.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 8 — PENDING TASKS
// ============================================================
export function V_PendingTasks({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="afternoon" sceneMood="Mid-day · maize rows · tractor" sceneTime="14:02">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight>
        <Pill tone="alert" icon="●">Action needed</Pill>
      </ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ IMPORTANT UPDATE</div>
          <h1 className="fv-display" style={{ fontSize: 92, color: 'var(--fv-ink)', margin: 0 }}>
            Tasks need<br/>
            <span style={{ color: 'oklch(0.55 0.16 50)' }}>your review.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'Some farm activities are pending your attention. Open FarmVault to review and keep your season moving forward.'}
        </p>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Pointing toward content area" expression="Engaged, eyebrows up" lighting="Bright daylight, soft shadow" id="mascot-tasks-point" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>View Pending Tasks</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>Timely action keeps the season moving.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 9 — HARVEST REMINDER
// ============================================================
export function V_HarvestReminder({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="morning" sceneMood="Maize ready · golden tassels" sceneTime="07:48">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="gold" icon="◐">Harvest window approaching</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ CROP STAGE UPDATE</div>
          <h1 className="fv-display" style={{ fontSize: 88, color: 'var(--fv-ink)', margin: 0 }}>
            Your crop is<br/>
            <span style={{ color: 'oklch(0.58 0.14 70)' }}>nearly ready.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 22, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'Your crop is reaching peak maturity. Plan your harvest crew, confirm storage, and log the cut to keep your records clean.'}
        </p>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Holding maize cob, inspecting kernel" expression="Pleased, focused" lighting="Morning warm, ground bounce" id="mascot-harvest-cob" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" variant="gold" onClick={onCTA}>Plan This Harvest</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>A good harvest is a logged harvest.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 10 — REVENUE MILESTONE
// ============================================================
export function V_RevenueMilestone({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="morning" sceneMood="Open field, ascending light" sceneTime="08:30">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="gold" icon="★">Milestone reached</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ FINANCIAL MILESTONE</div>
          <h1 className="fv-display" style={{ fontSize: 84, color: 'var(--fv-ink)', margin: 0 }}>
            You've hit a<br/>
            <span style={{ color: 'var(--fv-vault)' }}>new milestone</span><br/>
            <span style={{ color: 'var(--fv-ink-soft)', fontSize: 60 }}>this season.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 20, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 540, margin: 0 }}>
          {messageText || `That's a real number — earned through real records, real seasons, and real decisions. Your farm story is paying off, ${name}.`}
        </p>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Arms loosely raised, celebratory" expression="Genuine grin" lighting="Bright morning, sun flare" id="mascot-milestone-celebrate" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" variant="gold" onClick={onCTA}>View Financial Report</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>Built record by record. Season by season.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 11 — TRIAL EXPIRING
// ============================================================
export function V_TrialExpiring({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="evening" sceneMood="Late afternoon, soft light" sceneTime="16:50">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="gold" icon="◐">Trial ending soon</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ KEEP YOUR FARM CONNECTED</div>
          <h1 className="fv-display" style={{ fontSize: 88, color: 'var(--fv-ink)', margin: 0 }}>
            Don't lose<br/>
            <span style={{ color: 'var(--fv-vault)' }}>your records, {name}.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 21, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || 'You\'ve logged a real season. Upgrade to Pro to keep your history, advisory, and team access flowing.'}
        </p>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Hand extended, friendly handshake offer" expression="Reassuring smile" lighting="Soft late afternoon" id="mascot-trial-handshake" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <CTA size="lg" onClick={onCTA}>Upgrade to Pro</CTA>
          </div>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 240 }}>Your records stay yours.</span>
        </div>
      </ZoneFooter>
    </BannerShell>
  );
}

// ============================================================
// Variant 12 — SETUP INCOMPLETE / NEW USER
// ============================================================
export function V_SetupIncomplete({ name = 'Farmer', messageText, onCTA }: BannerVariantProps) {
  return (
    <BannerShell sceneTint="morning" sceneMood="Open field · fresh furrows" sceneTime="08:00">
      <ZoneLogo><FarmVaultLogo /></ZoneLogo>
      <ZoneTopRight><Pill tone="cream" icon="◑">Setup in progress</Pill></ZoneTopRight>
      <ZoneHero>
        <div>
          <div className="fv-eyebrow" style={{ marginBottom: 18 }}>◇ ALMOST READY</div>
          <h1 className="fv-display" style={{ fontSize: 92, color: 'var(--fv-ink)', margin: 0 }}>
            Let's finish<br/>
            <span style={{ color: 'var(--fv-vault)' }}>setting up your farm.</span>
          </h1>
        </div>
        <LeafRule />
        <p style={{ fontSize: 21, lineHeight: 1.45, color: 'var(--fv-ink-soft)', maxWidth: 560, margin: 0 }}>
          {messageText || `Welcome, ${name}. A few more steps and FarmVault knows your fields, your crops, and your team — ready to grow with you.`}
        </p>
      </ZoneHero>
      <ZoneMascot>
        <MascotSlot pose="Holding clipboard, gesturing welcoming" expression="Bright, encouraging" lighting="Fresh morning, soft fill" id="mascot-onboard-clipboard" />
      </ZoneMascot>
      <ZoneFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <CTA size="lg" onClick={onCTA}>Continue Farm Setup</CTA>
          <span style={{ fontSize: 13, color: 'var(--fv-mute)', maxWidth: 280 }}>~2 minutes left.</span>
        </div>
      </ZoneFooter>
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
