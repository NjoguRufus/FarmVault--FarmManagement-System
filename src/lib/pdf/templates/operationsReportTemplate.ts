export const operationsReportTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FarmVault — Operations Report</title>
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

  @page { size: A4; margin: 18mm 16mm; }
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
    color: rgba(27,107,80,0.035);
    letter-spacing: 8px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
    user-select: none;
  }

  body::before {
    content: '';
    position: fixed; inset: 0;
    background-image: repeating-linear-gradient(
      transparent, transparent 23px,
      rgba(27,107,80,0.04) 24px
    );
    pointer-events: none; z-index: 0;
  }

  .page-wrap { position: relative; z-index: 1; max-width: 794px; margin: 0 auto; }

  /* ── HEADER ── */
  .report-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 0 16px;
    border-bottom: 2.5px solid var(--primary);
    margin-bottom: 22px;
  }

  .header-left .company-name {
    font-family: 'DM Serif Display', serif;
    font-size: 17px; color: var(--primary); letter-spacing: 0.4px;
  }

  .header-left .company-sub { font-size: 9.5px; color: var(--muted); margin-top: 2px; letter-spacing: 0.3px; }
  .header-center { text-align: center; flex: 1; padding: 0 16px; }
  .header-center .report-title { font-family: 'DM Serif Display', serif; font-size: 18px; color: var(--text); }
  .header-center .report-period { font-size: 10px; color: var(--muted); margin-top: 3px; font-weight: 500; }
  .header-center .report-generated { font-size: 9px; color: #aab0bc; margin-top: 2px; }

  .logo-placeholder {
    width: 120px; height: 48px;
    border: 1.5px dashed #c8d0da; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 9.5px; color: #b0b8c4; font-weight: 600; letter-spacing: 1px; flex-shrink: 0;
  }

  .accent-stripe {
    height: 3px;
    background: linear-gradient(90deg, var(--primary) 60%, var(--accent) 100%);
    border-radius: 99px; margin-bottom: 24px;
  }

  /* ── STAT CARDS ── */
  .stat-cards {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;
  }

  .stat-card {
    background: var(--white); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px 16px 12px;
    box-shadow: var(--shadow); position: relative; overflow: hidden;
  }

  .stat-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--primary); border-radius: var(--radius) var(--radius) 0 0;
  }

  .stat-card.accent::before { background: var(--accent); }

  .stat-label {
    font-size: 9px; color: var(--muted); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;
  }

  .stat-value { font-family: 'DM Serif Display', serif; font-size: 22px; color: var(--primary); line-height: 1; }
  .stat-card.accent .stat-value { color: var(--accent); }
  .stat-sub { font-size: 9px; color: var(--muted); margin-top: 4px; }

  /* ── SECTION TITLE ── */
  .section-title {
    font-family: 'DM Serif Display', serif;
    font-size: 13px; color: var(--primary); margin-bottom: 10px;
    display: flex; align-items: center; gap: 8px;
  }

  .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  /* ── CHART PLACEHOLDER ── */
  .chart-placeholder {
    width: 100%; height: 140px;
    border: 1.5px dashed #d0dbd7; border-radius: var(--radius);
    background: linear-gradient(135deg, var(--primary-lt) 0%, #f0f9f5 100%);
    display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: 10px; font-weight: 500; letter-spacing: 0.5px;
    margin-bottom: 24px; position: relative;
  }

  .chart-placeholder::before { content: '▦'; font-size: 22px; position: absolute; opacity: 0.2; color: var(--primary); }
  .chart-placeholder span { margin-top: 30px; }

  /* ── ACTIVITY TYPES ── */
  .activity-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px;
  }

  .activity-card {
    background: var(--white); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px 16px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  }

  .activity-card-icon {
    font-size: 18px; margin-bottom: 6px; display: block;
  }

  .activity-card-name { font-weight: 700; font-size: 11px; margin-bottom: 4px; }

  .activity-card-stats { font-size: 9.5px; color: var(--muted); line-height: 1.7; }
  .activity-card-stats strong { color: var(--text); }

  /* ── WORKER UTILIZATION ── */
  .worker-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 24px;
  }

  .worker-item {
    background: var(--white); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px;
  }

  .worker-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 6px;
  }

  .worker-name { font-weight: 600; font-size: 10.5px; color: var(--text); }
  .worker-count { font-size: 10px; font-weight: 700; color: var(--primary); }

  .progress-bar-track {
    height: 5px; background: var(--primary-md); border-radius: 99px; overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--accent));
    border-radius: 99px;
  }

  .worker-sub { font-size: 8.5px; color: var(--muted); margin-top: 4px; }

  /* ── TABLE ── */
  .table-section { margin-bottom: 24px; }

  table {
    width: 100%;
    border-collapse: separate; border-spacing: 0;
    font-size: 10.5px; border-radius: var(--radius); overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  }

  thead tr { background: var(--primary); color: #fff; }
  thead th {
    padding: 10px 12px; font-weight: 600; font-size: 9.5px;
    letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap;
  }
  thead th.right { text-align: right; }

  tbody tr { border-bottom: 1px solid var(--border); }
  tbody tr:nth-child(even) { background: var(--row-alt); }
  tbody tr:last-child { border-bottom: none; }
  tbody td { padding: 9px 12px; color: var(--text); vertical-align: middle; }
  tbody td.right { text-align: right; font-weight: 600; color: var(--primary); }

  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 99px;
    font-size: 8.5px; font-weight: 600; letter-spacing: 0.3px;
  }

  .badge-green   { background: var(--primary-lt); color: var(--primary); }
  .badge-gold    { background: var(--accent-lt);  color: var(--accent);  }
  .badge-gray    { background: #f0f2f5; color: #6b7280; }
  .badge-blue    { background: #e8f0fe; color: #2563eb; }
  .badge-purple  { background: #f3e8ff; color: #7c3aed; }
  .badge-red     { background: #fee2e2; color: #b91c1c; }

  tfoot tr { background: var(--primary-lt); border-top: 2px solid var(--primary); }
  tfoot td { padding: 10px 12px; font-weight: 700; font-size: 10.5px; color: var(--primary); }
  tfoot td.right { text-align: right; }

  /* ── SUPERVISOR TABLE ── */
  .supervisor-table {
    margin-bottom: 24px;
  }

  .sup-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
  }

  .sup-card {
    background: var(--white); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px 16px;
    display: flex; justify-content: space-between; align-items: flex-start;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  }

  .sup-name { font-weight: 700; font-size: 11px; margin-bottom: 3px; }
  .sup-meta { font-size: 9px; color: var(--muted); line-height: 1.6; }
  .sup-ops { font-family: 'DM Serif Display', serif; font-size: 18px; color: var(--primary); text-align: right; }
  .sup-ops-label { font-size: 9px; color: var(--muted); text-align: right; }

  /* ── NOTES BOX ── */
  .notes-box {
    background: var(--accent-lt); border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 24px;
    font-size: 10px; color: #7a5b2a; line-height: 1.6;
  }

  .notes-box strong {
    color: var(--accent); font-weight: 700; display: block;
    margin-bottom: 4px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px;
  }

  /* ── FOOTER ── */
  .report-footer {
    border-top: 1px solid var(--border); padding: 12px 0 0;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 9px; color: #a0a8b4; margin-top: 8px;
  }

  .footer-brand { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--primary); letter-spacing: 0.3px; }
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
      <div class="stat-label">Total Activities</div>
      <div class="stat-value">{{total_activities}}</div>
      <div class="stat-sub">Logged operations</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Worker-Days</div>
      <div class="stat-value">{{worker_days}}</div>
      <div class="stat-sub">Aggregate labour days</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ops Cost</div>
      <div class="stat-value">{{operations_cost}}</div>
      <div class="stat-sub">Total operational cost</div>
    </div>
    <div class="stat-card accent">
      <div class="stat-label">Top Activity</div>
      <div class="stat-value" style="font-size:13px; margin-top:4px;">{{top_activity}}</div>
      <div class="stat-sub">{{totals.top_activity_sub}}</div>
    </div>
  </div>

  <!-- ACTIVITY TYPES -->
  <div class="section-title">Activity Breakdown</div>
  <div class="activity-grid">
    {{#each totals.activity_breakdown}}
    <div class="activity-card">
      <span class="activity-card-icon">{{icon}}</span>
      <div class="activity-card-name">{{name}}</div>
      <div class="activity-card-stats">
        Events: <strong>{{events}}</strong><br>
        Workers: <strong>{{workers}}</strong><br>
        Cost: <strong>{{cost}}</strong>
      </div>
    </div>
    {{/each}}
  </div>

  <!-- CHART PLACEHOLDER -->
  <div class="section-title">Operations Timeline</div>
  <div class="chart-placeholder">
    <canvas id="reportChart" width="760" height="140"></canvas>
  </div>

  <!-- WORKER UTILIZATION -->
  <div class="section-title">Worker Utilization by Block</div>
  <div class="worker-grid">
    {{#each totals.worker_utilization}}
    <div class="worker-item">
      <div class="worker-head">
        <span class="worker-name">{{label}}</span>
        <span class="worker-count">{{value}}</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:{{width}}"></div></div>
      <div class="worker-sub">{{sub}}</div>
    </div>
    {{/each}}
  </div>

  <!-- TABLE -->
  <div class="table-section">
    <div class="section-title">Operations Log</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Activity</th>
          <th>Crop</th>
          <th>Block</th>
          <th>Supervisor</th>
          <th class="right">Workers</th>
          <th class="right">Cost (KES)</th>
        </tr>
      </thead>
      <tbody>
        {{#each rows}}
        <tr>
          <td>{{date}}</td>
          <td>{{activity}}</td>
          <td>{{crop}}</td>
          <td>{{block}}</td>
          <td>{{supervisor}}</td>
          <td class="right">{{workers}}</td>
          <td class="right">{{cost}}</td>
        </tr>
        {{/each}}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5"><strong>TOTAL — {{totals.total_activities}} operations</strong></td>
          <td class="right"><strong>{{totals.worker_days}}</strong></td>
          <td class="right"><strong>{{totals.operations_cost_total}}</strong></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- SUPERVISOR SUMMARY -->
  <div class="section-title">Supervisor Summary</div>
  <div class="sup-grid">
    {{#each totals.supervisor_summary}}
    <div class="sup-card">
      <div>
        <div class="sup-name">{{name}}</div>
        <div class="sup-meta">{{meta}}</div>
      </div>
      <div>
        <div class="sup-ops">{{ops}}</div>
        <div class="sup-ops-label">Operations</div>
      </div>
    </div>
    {{/each}}
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

