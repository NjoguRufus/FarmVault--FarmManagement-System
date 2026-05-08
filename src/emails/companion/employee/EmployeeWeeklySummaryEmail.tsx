import { EmailShell, BannerPanel, EmailFooter } from '../_EmailShared';
import { C, APP_URL, DISPLAY, BODY, MONO } from '../tokens';

export interface EmployeeWeeklyStats {
  operationsLogged: number;
  daysActive:       number;
  streakDays:       number;
  weekStart:        string;
  weekEnd:          string;
  topActivity?:     string | null;
}

export interface EmployeeWeeklySummaryEmailProps {
  displayName?:    string;
  farmName?:       string;
  stats?:          EmployeeWeeklyStats;
  summaryMessage?: string;
}

function StatCard({ value, label, valueColor, fontSize = 28 }: { value: string; label: string; valueColor: string; fontSize?: number }) {
  return (
    <table role="presentation" width="100%" cellSpacing={0} cellPadding={0} border={0}>
      <tbody><tr>
        <td style={{ backgroundColor: C.parchment, borderRadius: 12, padding: '18px 10px', textAlign: 'center', border: `1px solid ${C.line}` }}>
          <p style={{ margin: '0 0 5px 0', fontFamily: DISPLAY, fontSize, fontWeight: 700, color: valueColor, lineHeight: 1.1 }}>{value}</p>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, fontWeight: 600, color: C.mute, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
        </td>
      </tr></tbody>
    </table>
  );
}

export function EmployeeWeeklySummaryEmail({
  displayName    = 'there',
  farmName       = 'the farm',
  stats,
  summaryMessage,
}: EmployeeWeeklySummaryEmailProps) {
  const firstName = (displayName.trim() || 'there').split(/[\s,]/)[0] || 'there';
  const farm      = farmName || 'the farm';
  const s: EmployeeWeeklyStats = stats ?? { operationsLogged: 0, daysActive: 0, streakDays: 0, weekStart: '', weekEnd: '' };
  const hasActivity = s.operationsLogged > 0 || s.daysActive > 0;

  const closingLine = summaryMessage ?? (hasActivity
    ? `Your consistency this week kept ${farm} operations running. Thank you for showing up every day.`
    : `Even quieter weeks are part of farming. Come back next week and keep building your streak.`);

  return (
    <EmailShell
      preheader={hasActivity ? `${firstName}, you logged ${s.operationsLogged} activities this week — great work!` : `${firstName}, here is your FarmVault week in review.`}
      title="Your FarmVault Weekly Summary"
    >
      <BannerPanel
        headlineL1="Great work"
        headlineL2="this week."
        headlineL2Color={C.leaf}
        subline={`${firstName}, here is a look at your week on ${farm}.`}
      />

      {/* Stats grid */}
      <tr>
        <td style={{ padding: '44px 40px 0', backgroundColor: C.parchment }}>
          <table role="presentation" width="100%" cellSpacing={0} cellPadding={0} border={0}>
            <tbody>
              <tr>
                <td width="50%" valign="top" style={{ padding: '0 5px 10px 0' }}>
                  <StatCard value={String(s.operationsLogged)} label="Activities Logged" valueColor={C.vault} />
                </td>
                <td width="50%" valign="top" style={{ padding: '0 0 10px 5px' }}>
                  <StatCard value={String(s.daysActive)} label="Days Active" valueColor={C.positive} />
                </td>
              </tr>
              {s.streakDays > 1 && (
                <tr>
                  <td width="50%" valign="top" style={{ padding: '0 5px 0 0' }}>
                    <StatCard value={`${s.streakDays} days`} label="Active Streak" valueColor={C.harvestDeep} fontSize={20} />
                  </td>
                  {s.topActivity ? (
                    <td width="50%" valign="top" style={{ padding: '0 0 0 5px' }}>
                      <StatCard value={s.topActivity} label="Top Activity" valueColor={C.inkSoft} fontSize={14} />
                    </td>
                  ) : <td />}
                </tr>
              )}
            </tbody>
          </table>

          {/* Streak badge */}
          {s.streakDays > 2 && (
            <table role="presentation" width="100%" cellSpacing={0} cellPadding={0} border={0} style={{ margin: '16px 0 0' }}>
              <tbody><tr>
                <td style={{ backgroundColor: C.parchment, borderRadius: 12, padding: '14px 18px', border: `1px solid ${C.harvest}` }}>
                  <table role="presentation" width="100%" cellSpacing={0} cellPadding={0} border={0}>
                    <tbody><tr>
                      <td width={28} valign="middle" style={{ fontFamily: BODY, fontSize: 20, lineHeight: 1 }}>🔥</td>
                      <td valign="middle" style={{ paddingLeft: 10, fontFamily: BODY }}>
                        <p style={{ margin: '0 0 2px 0', fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: C.harvestDeep }}>{s.streakDays}-day active streak</p>
                        <p style={{ margin: 0, fontSize: 12, color: C.mute }}>Your consistency this week is something to be proud of.</p>
                      </td>
                    </tr></tbody>
                  </table>
                </td>
              </tr></tbody>
            </table>
          )}
        </td>
      </tr>

      {/* Message + CTA */}
      <tr>
        <td style={{ padding: '28px 40px 48px', backgroundColor: C.parchment, fontFamily: BODY }}>
          <p style={{ margin: '0 0 16px 0', fontFamily: BODY, fontSize: 17, fontWeight: 600, lineHeight: 1.65, color: C.ink }}>
            {closingLine}
          </p>
          <table role="presentation" cellSpacing={0} cellPadding={0} border={0} align="center" style={{ margin: '34px auto 0' }}>
            <tbody><tr>
              <td style={{ borderRadius: 8, backgroundColor: C.forestDeep, boxShadow: '0 6px 20px rgba(30,44,33,0.28)' }}>
                <a href={`${APP_URL}/home`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', padding: '14px 36px', fontFamily: BODY, fontSize: 15, fontWeight: 600, color: C.cream, textDecoration: 'none', borderRadius: 8 }}>
                  Open FarmVault →
                </a>
              </td>
            </tr></tbody>
          </table>
          <p style={{ margin: '24px 0 0 0', fontFamily: BODY, fontSize: 12, color: C.mute, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
            Every task you log builds a stronger farm record.
          </p>
        </td>
      </tr>

      <EmailFooter tagline="Your work. Your streak. Your farm story." />
    </EmailShell>
  );
}
