export const salesReportTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>FarmVault — Sales Report</title>
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
    --paid:       #d1fae5;
    --paid-text:  #065f46;
    --pending:    #fef3c7;
    --pending-text: #92400e;
    --partial:    #e0e7ff;
    --partial-text: #3730a3;
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
    position: fixed;
    inset: 0;
    background-image: repeating-linear-gradient(
      transparent, transparent 23px,
      rgba(27,107,80,0.04) 24px
    );
    pointer-events: none;
    z-index: 0;
  }

  .page-wrap { position: relative; z-index: 1; max-width: 794px; margin: 0 auto; }

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

  .header-center { text-align: center; flex: 1; padding: 0 16px; }
  .header-center .report-title { font-family: 'DM Serif Display', serif; font-size: 18px; color: var(--text); }
  .header-center .report-period { font-size: 10px; color: var(--muted); margin-top: 3px; font-weight: 500; }
  .header-center .report-generated { font-size: 9px; color: #aab0bc; margin-top: 2px; }

  .logo-placeholder {
    width: 120px; height: 48px;
    border: 1.5px dashed #c8d0da;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 9.5px; color: #b0b8c4; font-weight: 600; letter-spacing: 1px;
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
    position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--primary);
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .stat-card.accent::before { background: var(--accent); }
  .stat-card.hero { background: var(--primary); border-color: var(--primary); }
  .stat-card.hero::before { background: var(--accent); }
  .stat-card.hero .stat-label { color: rgba(255,255,255,0.7); }
  .stat-card.hero .stat-value { color: #fff; font-size: 20px; }
  .stat-card.hero .stat-sub   { color: rgba(255,255,255,0.6); }

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
    border: 1.5px dashed #d0dbd7;
    border-radius: var(--radius);
    background: linear-gradient(135deg, var(--primary-lt) 0%, #f0f9f5 100%);
    display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: 10px; font-weight: 500; letter-spacing: 0.5px;
    margin-bottom: 24px; position: relative;
  }

  .chart-placeholder::before { content: '▦'; font-size: 22px; position: absolute; opacity: 0.2; color: var(--primary); }
  .chart-placeholder span { margin-top: 30px; }

  /* ── BUYER SUMMARY ── */
  .buyer-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }

  .buyer-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }

  .buyer-name { font-weight: 700; font-size: 11px; margin-bottom: 3px; }
  .buyer-meta { font-size: 9px; color: var(--muted); }
  .buyer-total { font-family: 'DM Serif Display', serif; font-size: 16px; color: var(--primary); text-align: right; }
  .buyer-total-sub { font-size: 9px; color: var(--muted); text-align: right; margin-top: 2px; }

  /* ── TABLE ── */
  .table-section { margin-bottom: 24px; }

  table {
    width: 100%;
    border-collapse: separate; border-spacing: 0;
    font-size: 10.5px;
    border-radius: var(--radius); overflow: hidden;
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
  tbody td.total-col { text-align: right; font-weight: 700; color: var(--primary); font-size: 11px; }

  .badge {
    display: inline-block;
    padding: 2px 8px; border-radius: 99px; font-size: 8.5px; font-weight: 600; letter-spacing: 0.3px;
  }

  .badge-paid    { background: var(--paid);    color: var(--paid-text); }
  .badge-pending { background: var(--pending); color: var(--pending-text); }
  .badge-partial { background: var(--partial); color: var(--partial-text); }
  .badge-green   { background: var(--primary-lt); color: var(--primary); }
  .badge-gold    { background: var(--accent-lt);  color: var(--accent);  }

  tfoot tr { background: var(--primary); }
  tfoot td {
    padding: 10px 12px; font-weight: 700; font-size: 10.5px; color: #fff;
  }
  tfoot td.right { text-align: right; }

  /* ── PAYMENT STATUS SUMMARY ── */
  .payment-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }

  .payment-card {
    border-radius: 10px;
    padding: 12px 16px;
    text-align: center;
  }

  .payment-card.paid    { background: var(--paid);    border: 1px solid #a7f3d0; }
  .payment-card.pending { background: var(--pending); border: 1px solid #fcd34d; }
  .payment-card.partial { background: var(--partial); border: 1px solid #a5b4fc; }

  .payment-card .p-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
  .payment-card.paid    .p-label { color: var(--paid-text); }
  .payment-card.pending .p-label { color: var(--pending-text); }
  .payment-card.partial .p-label { color: var(--partial-text); }

  .payment-card .p-value { font-family: 'DM Serif Display', serif; font-size: 18px; }
  .payment-card.paid    .p-value { color: var(--paid-text); }
  .payment-card.pending .p-value { color: var(--pending-text); }
  .payment-card.partial .p-value { color: var(--partial-text); }

  .payment-card .p-sub { font-size: 9px; color: var(--muted); margin-top: 3px; }

  /* ── NOTES BOX ── */
  .notes-box {
    background: var(--accent-lt);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 12px 16px; margin-bottom: 24px;
    font-size: 10px; color: #7a5b2a; line-height: 1.6;
  }

  .notes-box strong {
    color: var(--accent); font-weight: 700; display: block;
    margin-bottom: 4px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px;
  }

  /* ── FOOTER ── */
  .report-footer {
    border-top: 1px solid var(--border);
    padding: 12px 0 0;
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
    <div class="stat-card hero">
      <div class="stat-label">Total Revenue</div>
      <div class="stat-value">{{total_revenue}}</div>
      <div class="stat-sub">All crops · all buyers</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Sales Records</div>
      <div class="stat-value">{{sales_records}}</div>
      <div class="stat-sub">Transactions logged</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg. Price / kg</div>
      <div class="stat-value">{{avg_price}}</div>
      <div class="stat-sub">Weighted average</div>
    </div>
    <div class="stat-card accent">
      <div class="stat-label">Outstanding</div>
      <div class="stat-value">{{outstanding}}</div>
      <div class="stat-sub">Pending settlement</div>
    </div>
  </div>

  <!-- PAYMENT STATUS -->
  <div class="section-title">Payment Status Overview</div>
  <div class="payment-summary">
    {{#each totals.payment_summary}}
    <div class="payment-card {{status_class}}">
      <div class="p-label">{{label}}</div>
      <div class="p-value">{{value}}</div>
      <div class="p-sub">{{sub}}</div>
    </div>
    {{/each}}
  </div>

  <!-- CHART PLACEHOLDER -->
  <div class="section-title">Revenue Trend</div>
  <div class="chart-placeholder">
    <canvas id="reportChart" width="760" height="140"></canvas>
  </div>

  <!-- BUYER SUMMARY -->
  <div class="section-title">Buyer Summary</div>
  <div class="buyer-grid">
    {{#each totals.buyer_summary}}
    <div class="buyer-card">
      <div>
        <div class="buyer-name">{{name}}</div>
        <div class="buyer-meta">{{meta}}</div>
      </div>
      <div>
        <div class="buyer-total">{{total}}</div>
        <div class="buyer-total-sub">{{status_badge}}</div>
      </div>
    </div>
    {{/each}}
  </div>

  <!-- TABLE -->
  <div class="table-section">
    <div class="section-title">Sales Entries</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Crop</th>
          <th>Buyer</th>
          <th class="right">Qty (kg)</th>
          <th class="right">Price/kg</th>
          <th>Payment</th>
          <th class="right">Total (KES)</th>
        </tr>
      </thead>
      <tbody>
        {{#each rows}}
        <tr>
          <td>{{date}}</td>
          <td>{{crop}}</td>
          <td>{{buyer}}</td>
          <td class="right">{{qty_kg}}</td>
          <td class="right">{{price_per_kg}}</td>
          <td>{{payment}}</td>
          <td class="total-col">{{total}}</td>
        </tr>
        {{/each}}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3"><strong>TOTAL — {{totals.sales_records}} transactions</strong></td>
          <td class="right"><strong>{{totals.total_qty_kg}}</strong></td>
          <td></td>
          <td></td>
          <td class="right"><strong>{{totals.total_revenue}}</strong></td>
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

