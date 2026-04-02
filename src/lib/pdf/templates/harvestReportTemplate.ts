export const harvestReportTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FarmVault — Harvest Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600;700&display=swap');

  :root {
    --primary:    #1b6b50;
    --primary-lt: #e8f5f0;
    --primary-md: #cce9de;
    --accent:     #c9983e;
    --accent-lt:  #fdf6e9;
    --text:       #1a1f2e;
    --muted:      #6b7280;
    --border:     #e5e9ee;
    --white:      #ffffff;
    --row-alt:    #f7faf9;
    --shadow:     0 4px 16px rgba(0,0,0,0.06);
    --radius:     12px;
  }

  @page {
    size: A4;
    margin: 18mm 16mm;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', 'Segoe UI', sans-serif;
    font-size: 11px;
    color: var(--text);
    background: #fff;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .watermark {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-family: 'DM Serif Display', serif;
    font-size: 96px;
    font-weight: 700;
    color: rgba(27, 107, 80, 0.035);
    letter-spacing: 8px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
    user-select: none;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: repeating-linear-gradient(
      transparent, transparent 23px,
      rgba(27,107,80,0.04) 24px
    );
    pointer-events: none;
    z-index: 0;
  }

  .page-wrap {
    position: relative;
    z-index: 1;
    max-width: 794px;
    margin: 0 auto;
  }

  /* ── HEADER ── */
  .report-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 0 16px;
    border-bottom: 2.5px solid var(--primary);
    margin-bottom: 22px;
  }

  .header-left .company-name {
    font-family: 'DM Serif Display', serif;
    font-size: 17px;
    color: var(--primary);
    letter-spacing: 0.4px;
  }

  .header-left .company-sub {
    font-size: 9.5px;
    color: var(--muted);
    margin-top: 2px;
    letter-spacing: 0.3px;
  }

  .header-center {
    text-align: center;
    flex: 1;
    padding: 0 16px;
  }

  .header-center .report-title {
    font-family: 'DM Serif Display', serif;
    font-size: 18px;
    color: var(--text);
  }

  .header-center .report-period {
    font-size: 10px;
    color: var(--muted);
    margin-top: 3px;
    font-weight: 500;
  }

  .header-center .report-generated {
    font-size: 9px;
    color: #aab0bc;
    margin-top: 2px;
  }

  .logo-placeholder {
    width: 120px;
    height: 48px;
    border: 1.5px dashed #c8d0da;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9.5px;
    color: #b0b8c4;
    font-weight: 600;
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .accent-stripe {
    height: 3px;
    background: linear-gradient(90deg, var(--primary) 60%, var(--accent) 100%);
    border-radius: 99px;
    margin-bottom: 24px;
  }

  /* ── STAT CARDS ── */
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px 12px;
    box-shadow: var(--shadow);
    position: relative;
    overflow: hidden;
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--primary);
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .stat-card.accent::before { background: var(--accent); }
  .stat-card.highlight { background: var(--primary); }
  .stat-card.highlight .stat-value,
  .stat-card.highlight .stat-label,
  .stat-card.highlight .stat-sub { color: #fff; }
  .stat-card.highlight::before { background: var(--accent); }

  .stat-label {
    font-size: 9px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 6px;
  }

  .stat-value {
    font-family: 'DM Serif Display', serif;
    font-size: 22px;
    color: var(--primary);
    line-height: 1;
  }

  .stat-card.accent .stat-value { color: var(--accent); }

  .stat-sub {
    font-size: 9px;
    color: var(--muted);
    margin-top: 4px;
  }

  /* ── CROP SUMMARY STRIPS ── */
  .crop-strips {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }

  .crop-strip {
    border-radius: 10px;
    padding: 12px 16px;
    border-left: 4px solid var(--primary);
    background: var(--primary-lt);
  }

  .crop-strip.gold { border-left-color: var(--accent); background: var(--accent-lt); }

  .crop-strip-name {
    font-weight: 700;
    font-size: 11px;
    color: var(--primary);
    margin-bottom: 4px;
  }

  .crop-strip.gold .crop-strip-name { color: var(--accent); }

  .crop-strip-stats {
    font-size: 9.5px;
    color: var(--muted);
    line-height: 1.7;
  }

  .crop-strip-stats strong { color: var(--text); }

  /* ── SECTION TITLE ── */
  .section-title {
    font-family: 'DM Serif Display', serif;
    font-size: 13px;
    color: var(--primary);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  /* ── CHART PLACEHOLDER ── */
  .chart-placeholder {
    width: 100%;
    height: 140px;
    border: 1.5px dashed #d0dbd7;
    border-radius: var(--radius);
    background: linear-gradient(135deg, var(--primary-lt) 0%, #f0f9f5 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.5px;
    margin-bottom: 24px;
    position: relative;
  }

  .chart-placeholder::before {
    content: '▦';
    font-size: 22px;
    position: absolute;
    opacity: 0.2;
    color: var(--primary);
  }

  .chart-placeholder span { margin-top: 30px; }

  /* ── TABLE ── */
  .table-section { margin-bottom: 24px; }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 10.5px;
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  }

  thead tr { background: var(--primary); color: #fff; }

  thead th {
    padding: 10px 12px;
    font-weight: 600;
    font-size: 9.5px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  thead th.right { text-align: right; }

  tbody tr { border-bottom: 1px solid var(--border); }
  tbody tr:nth-child(even) { background: var(--row-alt); }
  tbody tr:last-child { border-bottom: none; }

  tbody td {
    padding: 9px 12px;
    color: var(--text);
    vertical-align: middle;
  }

  tbody td.right {
    text-align: right;
    font-weight: 600;
    color: var(--primary);
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .badge-green { background: var(--primary-lt); color: var(--primary); }
  .badge-gold  { background: var(--accent-lt);  color: var(--accent);  }
  .badge-gray  { background: #f0f2f5; color: #6b7280; }
  .badge-blue  { background: #e8f0fe; color: #2563eb; }

  tfoot tr { background: var(--primary-lt); border-top: 2px solid var(--primary); }
  tfoot td {
    padding: 10px 12px;
    font-weight: 700;
    font-size: 10.5px;
    color: var(--primary);
  }
  tfoot td.right { text-align: right; }

  /* ── PROGRESS BARS ── */
  .block-progress {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 24px;
  }

  .progress-item {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
  }

  .progress-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--text);
  }

  .progress-head span { color: var(--primary); }

  .progress-bar-track {
    height: 6px;
    background: var(--primary-md);
    border-radius: 99px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--accent));
    border-radius: 99px;
  }

  /* ── NOTES BOX ── */
  .notes-box {
    background: var(--accent-lt);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 12px 16px;
    margin-bottom: 24px;
    font-size: 10px;
    color: #7a5b2a;
    line-height: 1.6;
  }

  .notes-box strong {
    color: var(--accent);
    font-weight: 700;
    display: block;
    margin-bottom: 4px;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ── FOOTER ── */
  .report-footer {
    border-top: 1px solid var(--border);
    padding: 12px 0 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    color: #a0a8b4;
    margin-top: 8px;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--primary);
    letter-spacing: 0.3px;
  }

  .footer-brand::before { content: '⬡'; font-size: 12px; color: var(--accent); }
  .page-number { font-weight: 600; color: var(--muted); }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<div class="watermark">FarmVault</div>

<div class="page-wrap">

  <!-- HEADER -->
  <header class="report-header">
    <div class="header-left">
      <div class="company-name">{{company_name}}</div>
      <div class="company-sub">{{company_location}} &nbsp;·&nbsp; {{company_website}}</div>
    </div>
    <div class="header-center">
      <div class="report-title">{{report_title}}</div>
      <div class="report-period">{{date_range}}</div>
      <div class="report-generated">Generated: {{generated_at}}</div>
    </div>
    <img src="{{logo_url}}" class="logo-img logo-placeholder" />
  </header>

  <div class="accent-stripe"></div>

  <!-- STAT CARDS -->
  <div class="stat-cards">
    <div class="stat-card">
      <div class="stat-label">Total Yield</div>
      <div class="stat-value">{{total_yield}}</div>
      <div class="stat-sub">All crops · all blocks</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Harvest Days</div>
      <div class="stat-value">{{harvest_days}}</div>
      <div class="stat-sub">Active collection days</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg. Daily Yield</div>
      <div class="stat-value">{{avg_daily_yield}}</div>
      <div class="stat-sub">Per harvest day</div>
    </div>
    <div class="stat-card accent">
      <div class="stat-label">Grade A Ratio</div>
      <div class="stat-value">{{grade_a_ratio}}</div>
      <div class="stat-sub">{{totals.grade_a_sub}}</div>
    </div>
  </div>

  <!-- CROP STRIPS -->
  <div class="section-title">Crop Breakdown</div>
  <div class="crop-strips">
    {{#each totals.crop_breakdown}}
    <div class="crop-strip {{strip_class}}">
      <div class="crop-strip-name">{{name}}</div>
      <div class="crop-strip-stats">
        Total yield: <strong>{{total_yield}}</strong><br>
        Blocks: <strong>{{blocks}}</strong> &nbsp;·&nbsp; Pickers: <strong>{{pickers}}</strong><br>
        Grade A: <strong>{{grade_a}}</strong>
      </div>
    </div>
    {{/each}}
  </div>

  <!-- CHART PLACEHOLDER -->
  <div class="section-title">Yield Over Time</div>
  <div class="chart-placeholder">
    <canvas id="reportChart" width="760" height="140"></canvas>
  </div>

  <!-- BLOCK PROGRESS -->
  <div class="section-title">Block Performance</div>
  <div class="block-progress">
    {{#each totals.block_performance}}
    <div class="progress-item">
      <div class="progress-head">{{label}} <span>{{value}}</span></div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:{{width}}"></div></div>
    </div>
    {{/each}}
  </div>

  <!-- TABLE -->
  <div class="table-section">
    <div class="section-title">Harvest Collection Entries</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Crop</th>
          <th>Block</th>
          <th>Collected by</th>
          <th>Grade</th>
          <th>Units</th>
          <th class="right">Yield (kg)</th>
        </tr>
      </thead>
      <tbody>
        {{#each rows}}
        <tr>
          <td>{{date}}</td>
          <td>{{crop}}</td>
          <td>{{block}}</td>
          <td>{{collected_by}}</td>
          <td>{{grade}}</td>
          <td>{{units}}</td>
          <td class="right">{{yield_kg}}</td>
        </tr>
        {{/each}}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="6"><strong>{{totals.table_footer_label}}</strong></td>
          <td class="right"><strong>{{totals.total_yield_kg}}</strong></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- NOTES -->
  <div class="notes-box">
    <strong>Report Notes</strong>
    {{totals.notes}}
  </div>

  <!-- FOOTER -->
  <footer class="report-footer">
    <div class="footer-brand">Generated by FarmVault</div>
    <div>{{company_website}} &nbsp;·&nbsp; {{company_email}} &nbsp;·&nbsp; {{company_phone}}</div>
    <div class="page-number">Page 1 of 1</div>
  </footer>

</div>
<script>
function exportPDF() {
window.print()
}
</script>
</body>
</html>`;

