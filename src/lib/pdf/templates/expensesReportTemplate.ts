export const expensesReportTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FarmVault — Expenses Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600;700&display=swap');

  :root {
    --primary:    #1b6b50;
    --primary-lt: #e8f5f0;
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

  /* ── WATERMARK ── */
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
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

  /* ── NOTEBOOK LINES ── */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: repeating-linear-gradient(
      transparent,
      transparent 23px,
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
    padding: 0;
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
    letter-spacing: 0.3px;
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

  /* ── ACCENT STRIPE ── */
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

  /* ── CHART PLACEHOLDER ── */
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

  .chart-placeholder span {
    margin-top: 30px;
  }

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

  thead tr {
    background: var(--primary);
    color: #fff;
  }

  thead th {
    padding: 10px 12px;
    font-weight: 600;
    font-size: 9.5px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  thead th:last-child { text-align: right; }

  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }

  tbody tr:nth-child(even) { background: var(--row-alt); }
  tbody tr:last-child { border-bottom: none; }

  tbody td {
    padding: 9px 12px;
    color: var(--text);
    vertical-align: middle;
  }

  tbody td:last-child {
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

  /* ── TABLE FOOTER ROW ── */
  tfoot tr {
    background: var(--primary-lt);
    border-top: 2px solid var(--primary);
  }

  tfoot td {
    padding: 10px 12px;
    font-weight: 700;
    font-size: 10.5px;
    color: var(--primary);
  }

  tfoot td:last-child {
    text-align: right;
    color: var(--primary);
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

  .footer-brand::before {
    content: '⬡';
    font-size: 12px;
    color: var(--accent);
  }

  .page-number {
    font-weight: 600;
    color: var(--muted);
  }

  /* ── PAGE BREAK ── */
  .page-break {
    page-break-before: always;
  }

  /* ── CATEGORY BREAKDOWN ── */
  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }

  .breakdown-item {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .breakdown-label { font-size: 10px; color: var(--muted); font-weight: 500; }
  .breakdown-value { font-size: 12px; font-weight: 700; color: var(--primary); }

  @media print {
    body::before { display: block; }
    .watermark { display: block; }
    .report-header, table, .stat-card { -webkit-print-color-adjust: exact; }
  }
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
      <div class="stat-label">Total Expenses</div>
      <div class="stat-value">{{total_expenses}}</div>
      <div class="stat-sub">Across all categories</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Transactions</div>
      <div class="stat-value">{{transactions}}</div>
      <div class="stat-sub">Recorded entries</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg. per Entry</div>
      <div class="stat-value">{{avg_expense}}</div>
      <div class="stat-sub">Per transaction</div>
    </div>
    <div class="stat-card accent">
      <div class="stat-label">Top Category</div>
      <div class="stat-value" style="font-size:14px;margin-top:4px;">{{top_category}}</div>
      <div class="stat-sub">{{top_category_amount}}</div>
    </div>
  </div>

  <!-- CHART -->
  <div class="section-title">Expenses by Category</div>
  <div class="chart-placeholder">
    <canvas id="reportChart" width="760" height="140"></canvas>
  </div>

  <!-- CATEGORY BREAKDOWN -->
  <div class="section-title">Category Summary</div>
  <div class="breakdown-grid">
    {{#each totals.category_summary}}
    <div class="breakdown-item">
      <span class="breakdown-label">{{label}}</span>
      <span class="breakdown-value">{{value}}</span>
    </div>
    {{/each}}
  </div>

  <!-- TABLE -->
  <div class="table-section">
    <div class="section-title">Expense Entries</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Category</th>
          <th>Item</th>
          <th>Supplier</th>
          <th>Crop</th>
          <th>Notes</th>
          <th>Amount (KES)</th>
        </tr>
      </thead>
      <tbody>
        {{#each rows}}
        <tr>
          <td>{{date}}</td>
          <td>{{category}}</td>
          <td>{{item}}</td>
          <td>{{supplier}}</td>
          <td>{{crop}}</td>
          <td>{{notes}}</td>
          <td>{{amount}}</td>
        </tr>
        {{/each}}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="6"><strong>TOTAL — {{totals.transactions}} transactions</strong></td>
          <td><strong>{{totals.total_amount}}</strong></td>
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
window.__FV_REPORT__ = {{{report_payload_json}}};

// Draw a simple pie chart for "Expenses by Category"
(function () {
  try {
    var payload = window.__FV_REPORT__ || {};
    var chart = payload.chart;
    if (!chart || chart.type !== 'pie') return;
    var canvas = document.getElementById('reportChart');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var labels = chart.labels || [];
    var values = chart.values || [];
    if (!values.length) return;

    var total = values.reduce(function (s, v) { return s + (Number(v) || 0); }, 0);
    if (!total) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Pie settings
    var cx = 120;
    var cy = canvas.height / 2;
    var r = Math.min(54, (canvas.height / 2) - 10);

    var colors = chart.colors || ['#1b6b50', '#c9983e', '#6b7280', '#3b82f6', '#7c3aed', '#ef4444'];
    var start = -Math.PI / 2;

    for (var i = 0; i < values.length; i++) {
      var v = Number(values[i]) || 0;
      var ang = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.85;
      ctx.fill();
      start += ang;
    }
    ctx.globalAlpha = 1;

    // Legend (right side)
    ctx.font = '12px DM Sans, Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    var x0 = 220;
    var y0 = 22;
    for (var j = 0; j < labels.length && j < values.length && j < 6; j++) {
      var lv = Number(values[j]) || 0;
      var pct = total ? Math.round((lv / total) * 1000) / 10 : 0;
      ctx.fillStyle = colors[j % colors.length];
      ctx.fillRect(x0, y0 + j * 20, 10, 10);
      ctx.fillStyle = '#1a1f2e';
      ctx.fillText(String(labels[j]), x0 + 16, y0 + 9 + j * 20);
      ctx.fillStyle = '#6b7280';
      ctx.fillText(pct + '%', x0 + 220, y0 + 9 + j * 20);
    }
  } catch (e) {
    // ignore
  }
})();

function exportPDF() {
window.print()
}
</script>
</body>
</html>`;

