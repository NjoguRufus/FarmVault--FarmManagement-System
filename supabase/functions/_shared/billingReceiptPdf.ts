/**
 * FarmVault – Premium A4 Payment Receipt (pdf-lib)
 * Colors: primary #0b3d2e | secondary #0f5b3f | gold #D8B980 | success #16a34a
 *
 * Drop-in replacement — same exported types & function signature.
 */
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  degrees,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceiptLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type BillingReceiptPdfModel = {
  receiptNumber: string;
  issuedAtIso: string;
  statusLabel: string;
  transactionDateIso: string;
  transactionReference: string;
  companyName: string;
  adminName: string;
  email: string;
  phone: string;
  workspaceName: string;
  paymentModeLabel: string;
  currency: string;
  planLabel: string;
  billingPeriod: string;
  lineItems: ReceiptLineItem[];
  subtotal: number;
  vatAmount: number | null;
  discountAmount: number | null;
  totalPaid: number;
  customerSinceIso: string | null;
  planTier: string;
  paymentCycle: string;
  footerTimestampIso: string;
};

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  primary: rgb(0.043, 0.239, 0.180), // #0b3d2e
  secondary: rgb(0.059, 0.357, 0.247), // #0f5b3f
  gold: rgb(0.847, 0.725, 0.502), // #D8B980
  goldLight: rgb(0.996, 0.973, 0.918), // #fef9ea
  success: rgb(0.086, 0.639, 0.290), // #16a34a
  successBg: rgb(0.933, 0.988, 0.949), // #eefbf2
  white: rgb(1, 1, 1),
  offWhite: rgb(0.976, 0.980, 0.980), // #f9fafa
  border: rgb(0.882, 0.898, 0.914), // #e1e5e9
  muted: rgb(0.420, 0.451, 0.502), // #6b7380
  textDark: rgb(0.067, 0.075, 0.094), // #111318
  textMid: rgb(0.216, 0.255, 0.318), // #374151
  dividerGold: rgb(0.847, 0.725, 0.502), // reuse gold for accent lines
  shadowRow: rgb(0.953, 0.961, 0.957), // #f3f5f4 – alternate row
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safe(raw: string): string {
  return raw
    .replace(/\u2192/g, "->").replace(/\u2014/g, "-").replace(/\u2013/g, "-")
    .replace(/\u2212/g, "-").replace(/\u2026/g, "...").replace(/\u00B7/g, " ")
    .replace(/\u2018|\u2019/g, "'").replace(/\u201C|\u201D/g, '"')
    .split("").map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      if (c === 9 || c === 10 || c === 13) return ch;
      if (c >= 0x20 && c <= 0x7e) return ch;
      if (c >= 0xa0 && c <= 0xff) return ch;
      return "?";
    }).join("");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
}

function fmtMoney(n: number, cur: string): string {
  const s = Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${cur} ${n < 0 ? "-" : ""}${s}`;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "..." : s;
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function rect(page: PDFPage, x: number, y: number, w: number, h: number, opts: {
  fill?: Parameters<typeof rgb>[0] extends number ? ReturnType<typeof rgb> : any;
  fillColor?: ReturnType<typeof rgb>;
  borderColor?: ReturnType<typeof rgb>;
  borderWidth?: number;
  opacity?: number;
}) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: opts.fillColor,
    borderColor: opts.borderColor,
    borderWidth: opts.borderWidth,
    opacity: opts.opacity,
  });
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const x2 = x + w;
  const y2 = y + h;
  return [
    `M ${x + rr} ${y}`,
    `L ${x2 - rr} ${y}`,
    `Q ${x2} ${y} ${x2} ${y + rr}`,
    `L ${x2} ${y2 - rr}`,
    `Q ${x2} ${y2} ${x2 - rr} ${y2}`,
    `L ${x + rr} ${y2}`,
    `Q ${x} ${y2} ${x} ${y2 - rr}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    "Z",
  ].join(" ");
}

function roundedRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  opts: {
    fillColor?: ReturnType<typeof rgb>;
    borderColor?: ReturnType<typeof rgb>;
    borderWidth?: number;
    opacity?: number;
  },
) {
  page.drawSvgPath(roundedRectPath(x, y, w, h, r), {
    color: opts.fillColor,
    borderColor: opts.borderColor,
    borderWidth: opts.borderWidth,
    opacity: opts.opacity,
  });
}

function hline(page: PDFPage, x: number, y: number, w: number, color: ReturnType<typeof rgb>, thickness = 0.5) {
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color });
}

function text(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  opts?: { maxWidth?: number; lineHeight?: number },
) {
  page.drawText(s, { x, y, size, font, color });
}

function textRight(
  page: PDFPage,
  s: string,
  rightEdge: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const tw = font.widthOfTextAtSize(s, size);
  page.drawText(s, { x: rightEdge - tw, y, size, font, color });
}

function textCenter(
  page: PDFPage,
  s: string,
  cx: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const tw = font.widthOfTextAtSize(s, size);
  page.drawText(s, { x: cx - tw / 2, y, size, font, color });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildBillingReceiptPdf(
  model: BillingReceiptPdfModel,
): Promise<Uint8Array> {
  // Sanitise all strings
  const m: BillingReceiptPdfModel = {
    ...model,
    receiptNumber: safe(model.receiptNumber),
    statusLabel: safe(model.statusLabel),
    transactionReference: safe(model.transactionReference),
    companyName: safe(model.companyName),
    adminName: safe(model.adminName),
    email: safe(model.email),
    phone: safe(model.phone),
    workspaceName: safe(model.workspaceName),
    paymentModeLabel: safe(model.paymentModeLabel),
    currency: safe(model.currency),
    planLabel: safe(model.planLabel),
    billingPeriod: safe(model.billingPeriod),
    lineItems: model.lineItems.map((r) => ({ ...r, description: safe(r.description) })),
    planTier: safe(model.planTier),
    paymentCycle: safe(model.paymentCycle),
    footerTimestampIso: safe(model.footerTimestampIso),
  };

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const { width: W, height: H } = page.getSize();
  const R = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);

  const MX = 38; // margin x
  const BW = W - MX * 2; // body width

  // ── 1. HEADER ──────────────────────────────────────────────────────────────
  const HDR_H = 120;

  // Main dark band
  rect(page, 0, H - HDR_H, W, HDR_H, { fillColor: C.primary });

  // Subtle secondary overlay at the very top (3 px depth-line)
  rect(page, 0, H - 3, W, 3, { fillColor: C.gold });

  // Gold accent rule below header
  rect(page, 0, H - HDR_H, W, 2.5, { fillColor: C.gold });

  // Fine geometric detail — vertical gold bar left of logo area
  rect(page, MX - 8, H - HDR_H + 18, 2, 68, { fillColor: C.gold, opacity: 0.35 });

  // ── Logo (kept from original code logic) ───────────────────────────────────
  const logoUrl =
    (typeof Deno !== "undefined" && Deno.env.get("FARMVAULT_RECEIPT_LOGO_URL")?.trim()) ??
    "https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png";

  let textColX = MX;
  try {
    const res = await fetch(logoUrl);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
      let img;
      try {
        img = (ct.includes("jpeg") || ct.includes("jpg"))
          ? await doc.embedJpg(bytes)
          : await doc.embedPng(bytes);
      } catch {
        try {
          img = await doc.embedPng(bytes);
        } catch {
          img = await doc.embedJpg(bytes);
        }
      }
      const imgH = 34;
      const imgW = img.width * (imgH / img.height);
      page.drawImage(img, { x: MX, y: H - 56, width: imgW, height: imgH });
      textColX = MX + imgW + 14;
    }
  } catch {
    /* branding optional */
  }

  // Brand name + tagline
  text(page, "FarmVault", textColX, H - 46, B, 22, C.gold);
  text(page, "Agricultural Management Platform", textColX, H - 59, R, 7.5,
    rgb(1, 1, 1)); // white at 60% — approximate with near-white

  // "PAYMENT RECEIPT" label
  text(page, "PAYMENT RECEIPT", MX, H - 88, B, 16, C.white);

  // Thin gold rule under the sub-heading
  hline(page, MX, H - 95, 148, C.gold, 0.8);

  // ── Right block: receipt meta ────────────────────────────────────────────--
  const RX = W - MX; // right edge

  // PAID pill — filled rounded rect approximated with overlapping rects
  const PILL_W = 64;
  const PILL_H = 20;
  const pillX = RX - PILL_W;
  const pillY = H - 54;
  rect(page, pillX, pillY, PILL_W, PILL_H, { fillColor: C.success });
  rect(page, pillX, pillY, 8, PILL_H, { fillColor: C.success });
  rect(page, pillX + PILL_W - 8, pillY, 8, PILL_H, { fillColor: C.success });
  // Checkmark strokes
  page.drawLine({ start: { x: pillX + 12, y: pillY + 9 }, end: { x: pillX + 16, y: pillY + 5 }, thickness: 1.6, color: C.white });
  page.drawLine({ start: { x: pillX + 16, y: pillY + 5 }, end: { x: pillX + 24, y: pillY + 14 }, thickness: 1.6, color: C.white });
  const statusStr = m.statusLabel.toUpperCase();
  text(page, statusStr, pillX + 28, pillY + 7, B, 9, C.white);

  textRight(page, `Receipt  ${m.receiptNumber}`, RX, H - 75, B, 9.5, C.gold);
  textRight(page, `Issued: ${fmtDate(m.issuedAtIso)}`, RX, H - 89, R, 8, rgb(0.8, 0.85, 0.82));
  textRight(page, `Ref: ${m.transactionReference}`, RX, H - 101, R, 7.5, rgb(0.65, 0.72, 0.68));

  // ── 2. TRANSACTION CONFIRMED BANNER ────────────────────────────────────────
  let Y = H - HDR_H - 18;
  const BANNER_H = 42;

  roundedRect(page, MX - 3, Y - BANNER_H - 3, BW + 6, BANNER_H + 6, 8, {
    borderColor: C.border,
    borderWidth: 1,
  });
  rect(page, MX, Y - BANNER_H, BW, BANNER_H, { fillColor: C.successBg, borderColor: C.success, borderWidth: 0.7 });

  // Left accent bar
  rect(page, MX, Y - BANNER_H, 4, BANNER_H, { fillColor: C.success });

  // Check circle
  const CC = { x: MX + 22, y: Y - BANNER_H / 2 };
  for (let r2 = 0; r2 < 2; r2++) {
    page.drawEllipse({
      x: CC.x,
      y: CC.y,
      xScale: 9,
      yScale: 9,
      color: r2 === 0 ? C.success : undefined,
      borderColor: r2 === 1 ? C.success : undefined,
      borderWidth: 0,
    });
  }
  page.drawLine({ start: { x: CC.x - 4, y: CC.y }, end: { x: CC.x - 1, y: CC.y - 4 }, thickness: 1.8, color: C.white });
  page.drawLine({ start: { x: CC.x - 1, y: CC.y - 4 }, end: { x: CC.x + 5, y: CC.y + 4 }, thickness: 1.8, color: C.white });

  text(page, "Payment Successfully Confirmed", MX + 38, Y - 16, B, 10.5, rgb(0.04, 0.32, 0.13));
  text(page, `Transaction date: ${fmtDate(m.transactionDateIso)}   |   Reference: ${m.transactionReference}`,
    MX + 38, Y - 29, R, 8, C.muted);

  Y -= BANNER_H + 20;

  // ── 3. TWO-COLUMN INFO CARDS ───────────────────────────────────────────────
  const COL_GAP = 14;
  const COL_W = (BW - COL_GAP) / 2;
  const CARD_H = 108;
  const HDR_STRIP = 20;

  const cards: Array<{ title: string; rows: [string, string][] }> = [
    {
      title: "CUSTOMER DETAILS",
      rows: [
        ["Company", clip(m.companyName, 30)],
        ["Admin", clip(m.adminName, 30)],
        ["Email", clip(m.email || "-", 32)],
        ["Phone", m.phone || "-"],
        ["Workspace", clip(m.workspaceName, 28)],
      ],
    },
    {
      title: "PAYMENT DETAILS",
      rows: [
        ["Mode", clip(m.paymentModeLabel, 28)],
        ["Currency", m.currency],
        ["Plan", m.planLabel],
        ["Period", clip(m.billingPeriod, 28)],
        ["Ref", clip(m.transactionReference, 28)],
      ],
    },
  ];
  const cardsTopY = Y;
  roundedRect(page, MX - 3, cardsTopY - CARD_H - 6, BW + 6, CARD_H + 12, 8, {
    borderColor: C.border,
    borderWidth: 1,
  });

  for (let i = 0; i < 2; i++) {
    const card = cards[i];
    const CX = MX + i * (COL_W + COL_GAP);

    // Card shadow effect (offset rect)
    rect(page, CX + 2, Y - CARD_H - 2, COL_W, CARD_H, { fillColor: C.border });

    // Card body
    rect(page, CX, Y - CARD_H, COL_W, CARD_H, { fillColor: C.white, borderColor: C.border, borderWidth: 0.6 });

    // Card header strip
    rect(page, CX, Y - HDR_STRIP, COL_W, HDR_STRIP, { fillColor: C.primary });

    // Gold left accent on header
    rect(page, CX, Y - HDR_STRIP, 3, HDR_STRIP, { fillColor: C.gold });

    text(page, card.title, CX + 10, Y - 13, B, 7.5, C.gold);

    // Rows
    let ry = Y - HDR_STRIP - 14;
    for (const [label, val] of card.rows) {
      text(page, label, CX + 10, ry, R, 7.5, C.muted);
      text(page, val, CX + 78, ry, B, 8, C.textDark);
      ry -= 15;
    }
  }

  Y -= CARD_H + 24;

  // ── 4. ITEMS TABLE ─────────────────────────────────────────────────────────
  const itemsTopY = Y + 8;

  // Section heading with gold accent
  rect(page, MX, Y + 2, 3, 16, { fillColor: C.gold });
  text(page, "ITEMS", MX + 8, Y, B, 9.5, C.primary);
  hline(page, MX, Y - 4, BW, C.border, 0.6);
  Y -= 18;

  // Column layout  [desc, qty, unit, total]
  const COLS = [0.46, 0.08, 0.24, 0.22];
  const TH = 20; // table header height
  const TR = 22; // table row height

  // Table header
  rect(page, MX, Y - TH, BW, TH, { fillColor: C.primary });
  rect(page, MX, Y - TH, BW, 2, { fillColor: C.gold }); // top accent

  const headers = ["Description", "Qty", "Unit Price", "Total"];
  let hx = MX + 8;
  const qtyShiftLeft = 8;
  const moneyShiftLeft = 16;
  for (let i = 0; i < 4; i++) {
    const colW = BW * COLS[i];
    if (i === 0) {
      text(page, headers[i], hx, Y - 13, B, 7.5, C.gold);
    } else if (i === 1) {
      textCenter(page, headers[i], hx + colW / 2 - qtyShiftLeft, Y - 13, B, 7.5, C.gold);
    } else {
      textRight(page, headers[i], hx + colW - 10 - moneyShiftLeft, Y - 13, B, 7.5, C.gold);
    }
    hx += colW;
  }
  Y -= TH;

  // Row data
  for (let ri = 0; ri < m.lineItems.length; ri++) {
    const row = m.lineItems[ri];
    if (Y < 190) break;

    const rowBg = ri % 2 === 0 ? C.white : C.shadowRow;
    rect(page, MX, Y - TR, BW, TR, { fillColor: rowBg });
    hline(page, MX, Y - TR, BW, C.border, 0.35);

    let rx2 = MX + 8;
    const desc = clip(row.description, 46);
    text(page, desc, rx2, Y - 14, R, 8.5, C.textDark);
    rx2 += BW * COLS[0];

    textCenter(page, String(row.quantity), rx2 + (BW * COLS[1]) / 2 - qtyShiftLeft, Y - 14, R, 8.5, C.textMid);
    rx2 += BW * COLS[1];

    textRight(page, fmtMoney(row.unit_price, m.currency),
      rx2 + BW * COLS[2] - 10 - moneyShiftLeft, Y - 14, R, 8.5, C.textMid);
    rx2 += BW * COLS[2];

    textRight(page, fmtMoney(row.total, m.currency),
      rx2 + BW * COLS[3] - 10 - moneyShiftLeft, Y - 14, B, 8.5, C.primary);

    Y -= TR;
  }

  // Bottom border of table
  hline(page, MX, Y, BW, C.primary, 0.8);
  Y -= 20;

  // ── 5. TOTALS BOX ──────────────────────────────────────────────────────────
  const TOT_W = 210;
  const TOT_X = W - MX - TOT_W;
  const vat = m.vatAmount ?? 0;
  const disc = m.discountAmount ?? 0;

  const totLines: [string, string][] = [
    ["Subtotal", fmtMoney(m.subtotal, m.currency)],
    ["VAT", fmtMoney(vat, m.currency)],
    ["Discount", disc > 0 ? `-${fmtMoney(disc, m.currency)}` : fmtMoney(0, m.currency)],
  ];
  const TOT_INNER = totLines.length * 18 + 8;
  const TOTAL_ROW = 28;
  const BOX_H = TOT_INNER + TOTAL_ROW;

  // Outer card shadow
  rect(page, TOT_X + 2, Y - BOX_H - 2, TOT_W, BOX_H, { fillColor: C.border });
  // Card
  rect(page, TOT_X, Y - BOX_H, TOT_W, BOX_H, { fillColor: C.white, borderColor: C.border, borderWidth: 0.7 });
  // Gold top accent
  rect(page, TOT_X, Y - 2, TOT_W, 2, { fillColor: C.gold });

  let ty = Y - 14;
  for (const [label, val] of totLines) {
    text(page, label, TOT_X + 10, ty, R, 8.5, C.muted);
    textRight(page, val, TOT_X + TOT_W - 10, ty, R, 8.5, C.textDark);
    ty -= 18;
  }

  hline(page, TOT_X, ty + 6, TOT_W, C.border, 0.5);

  // TOTAL PAID row
  rect(page, TOT_X, ty - TOTAL_ROW + 10, TOT_W, TOTAL_ROW, { fillColor: C.primary });
  text(page, "TOTAL PAID", TOT_X + 10, ty - 6, B, 10, C.white);
  textRight(page, fmtMoney(m.totalPaid, m.currency), TOT_X + TOT_W - 10, ty - 6, B, 10.5, C.gold);
  const itemsBottomY = ty - TOTAL_ROW + 4;
  roundedRect(page, MX - 3, itemsBottomY - 7, BW + 6, itemsTopY - (itemsBottomY - 7), 8, {
    borderColor: C.border,
    borderWidth: 1,
  });

  // ── 6. WATERMARK ───────────────────────────────────────────────────────────
  const WM_SIZE = 80;
  const wmStr = "PAID";
  const wmW = B.widthOfTextAtSize(wmStr, WM_SIZE);
  page.drawText(wmStr, {
    x: (W - wmW * 0.7) / 2 + 10,
    y: H / 2 - 40,
    size: WM_SIZE,
    font: B,
    color: rgb(0.10, 0.38, 0.22),
    rotate: degrees(-30),
    opacity: 0.055,
  });

  // ── 7. SUPPORT / NOTE STRIP ────────────────────────────────────────────────
  const NOTE_Y = 108;
  const NOTE_H = 32;

  rect(page, MX, NOTE_Y - NOTE_H, BW, NOTE_H,
    { fillColor: C.goldLight, borderColor: C.gold, borderWidth: 0.55 });
  rect(page, MX, NOTE_Y - NOTE_H, 3, NOTE_H, { fillColor: C.gold }); // left accent

  text(page, "For receipt queries, contact us — we're happy to help.",
    MX + 12, NOTE_Y - 11, B, 7.5, rgb(0.48, 0.36, 0.08));
  text(page, "billing@farmvault.africa   |   +254 714 748 299",
    MX + 12, NOTE_Y - 23, R, 7.5, rgb(0.35, 0.28, 0.06));

  // ── 8. FOOTER ──────────────────────────────────────────────────────────────
  const FTR_H = 46;

  rect(page, 0, 0, W, FTR_H, { fillColor: C.primary });
  rect(page, 0, FTR_H, W, 2, { fillColor: C.gold }); // gold top border

  // Left: trust line
  text(page, "Payment Confirmed  |  M-Pesa Verified  |  Authorized by FarmVault",
    MX, 30, R, 7, rgb(0.75, 0.82, 0.78));

  // Right: timestamp
  textRight(page, `Generated: ${fmtDate(m.footerTimestampIso)}`,
    W - MX, 30, R, 7, rgb(0.55, 0.65, 0.60));

  // Bottom metadata strip
  const strip = safe(
    `Customer since: ${fmtDate(m.customerSinceIso)}   |   Plan: ${m.planTier}   |   ` +
    `Workspace: ${m.workspaceName}   |   Cycle: ${m.paymentCycle}`,
  );
  text(page, clip(strip, 96), MX, 14, R, 7, rgb(0.50, 0.62, 0.56));

  // Wordmark right-aligned in footer
  textRight(page, "farmvault.africa", W - MX, 14, B, 7, C.gold);

  return doc.save();
}
