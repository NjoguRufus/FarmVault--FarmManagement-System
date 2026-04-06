/**
 * A4 FarmVault-branded payment receipt (pdf-lib).
 * Colors: primary #0b3d2e, secondary #0f5b3f, gold #D8B980, success #16a34a.
 */
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  degrees,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

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

const PRIMARY = rgb(11 / 255, 61 / 255, 46 / 255);
const SECONDARY = rgb(15 / 255, 91 / 255, 63 / 255);
const GOLD = rgb(216 / 255, 185 / 255, 128 / 255);
const SUCCESS = rgb(22 / 255, 163 / 255, 74 / 255);
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.35, 0.35, 0.35);
const BORDER = rgb(0.88, 0.88, 0.88);
const WM = rgb(0.94, 0.94, 0.94);

/**
 * pdf-lib StandardFonts use WinAnsi — no Unicode arrows, em dashes, ellipsis, etc.
 */
function pdfWinAnsiSafe(raw: string): string {
  let s = raw
    .replace(/\u2192/g, "->") // →
    .replace(/\u2014/g, "-") // —
    .replace(/\u2013/g, "-") // –
    .replace(/\u2212/g, "-") // −
    .replace(/\u2026/g, "...") // …
    .replace(/\u00B7/g, " ") // ·
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"');
  // Remaining non WinAnsi-safe → drop to '?', keep ASCII + Latin-1
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x9 || c === 0xa || c === 0xd) {
      out += ch;
      continue;
    }
    if (c >= 0x20 && c <= 0x7e) {
      out += ch;
      continue;
    }
    if (c >= 0xa0 && c <= 0xff) {
      out += ch;
      continue;
    }
    out += "?";
  }
  return out;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

function fmtMoney(n: number, currency: string): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${currency} ${n < 0 ? "-" : ""}${s}`;
}

function drawHeaderBand(page: PDFPage, width: number, height: number) {
  page.drawRectangle({
    x: 0,
    y: height - 118,
    width,
    height: 118,
    color: PRIMARY,
  });
  page.drawRectangle({
    x: 0,
    y: height - 118,
    width,
    height: 36,
    color: SECONDARY,
  });
}

function drawWatermark(page: PDFPage, width: number, height: number, font: PDFFont, text: string) {
  const size = 56;
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (width - tw) / 2,
    y: height / 2 - 40,
    size,
    font,
    color: WM,
    rotate: degrees(-32),
  });
}

export async function buildBillingReceiptPdf(model: BillingReceiptPdfModel): Promise<Uint8Array> {
  const m: BillingReceiptPdfModel = {
    ...model,
    receiptNumber: pdfWinAnsiSafe(model.receiptNumber),
    statusLabel: pdfWinAnsiSafe(model.statusLabel),
    transactionReference: pdfWinAnsiSafe(model.transactionReference),
    companyName: pdfWinAnsiSafe(model.companyName),
    adminName: pdfWinAnsiSafe(model.adminName),
    email: pdfWinAnsiSafe(model.email),
    phone: pdfWinAnsiSafe(model.phone),
    workspaceName: pdfWinAnsiSafe(model.workspaceName),
    paymentModeLabel: pdfWinAnsiSafe(model.paymentModeLabel),
    currency: pdfWinAnsiSafe(model.currency),
    planLabel: pdfWinAnsiSafe(model.planLabel),
    billingPeriod: pdfWinAnsiSafe(model.billingPeriod),
    lineItems: model.lineItems.map((row) => ({
      ...row,
      description: pdfWinAnsiSafe(row.description),
    })),
    planTier: pdfWinAnsiSafe(model.planTier),
    paymentCycle: pdfWinAnsiSafe(model.paymentCycle),
    footerTimestampIso: pdfWinAnsiSafe(model.footerTimestampIso),
  };

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  drawHeaderBand(page, width, height);

  const logoUrl =
    Deno.env.get("FARMVAULT_RECEIPT_LOGO_URL")?.trim() ??
    "https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png";
  let textColX = 42;
  try {
    const res = await fetch(logoUrl);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
      let img;
      try {
        if (ct.includes("jpeg") || ct.includes("jpg")) {
          img = await doc.embedJpg(bytes);
        } else {
          img = await doc.embedPng(bytes);
        }
      } catch {
        try {
          img = await doc.embedPng(bytes);
        } catch {
          img = await doc.embedJpg(bytes);
        }
      }
      const imgH = 30;
      const scale = imgH / img.height;
      const imgW = img.width * scale;
      page.drawImage(img, { x: 42, y: height - 54, width: imgW, height: imgH });
      textColX = 42 + imgW + 12;
    }
  } catch {
    /* optional branding */
  }

  page.drawText("FarmVault", {
    x: textColX,
    y: height - 52,
    size: 18,
    font: fontBold,
    color: GOLD,
  });
  page.drawText("PAYMENT RECEIPT", {
    x: textColX,
    y: height - 86,
    size: 20,
    font: fontBold,
    color: WHITE,
  });

  const rightBlockX = width - 42 - 200;
  page.drawText(`Receipt ${m.receiptNumber}`, {
    x: rightBlockX,
    y: height - 52,
    size: 10,
    font: fontBold,
    color: GOLD,
  });
  page.drawText(`Issued ${fmtDate(m.issuedAtIso)}`, {
    x: rightBlockX,
    y: height - 66,
    size: 9,
    font,
    color: WHITE,
  });
  page.drawRectangle({
    x: rightBlockX,
    y: height - 98,
    width: 86,
    height: 20,
    color: SUCCESS,
  });
  page.drawText(m.statusLabel.toUpperCase(), {
    x: rightBlockX + 10,
    y: height - 92,
    size: 9,
    font: fontBold,
    color: WHITE,
  });

  let y = height - 138;
  page.drawRectangle({ x: 36, y: y - 36, width: width - 72, height: 36, color: rgb(0.93, 0.98, 0.94) });
  page.drawRectangle({ x: 36, y: y - 36, width: width - 72, height: 36, borderColor: SUCCESS, borderWidth: 1 });
  const checkCx = 52;
  const checkCy = y - 22;
  page.drawLine({
    start: { x: checkCx, y: checkCy - 2 },
    end: { x: checkCx + 3.5, y: checkCy - 6 },
    thickness: 2,
    color: SUCCESS,
  });
  page.drawLine({
    start: { x: checkCx + 3.5, y: checkCy - 6 },
    end: { x: checkCx + 11, y: checkCy + 3 },
    thickness: 2,
    color: SUCCESS,
  });
  page.drawText("Payment Successfully Confirmed", {
    x: 68,
    y: y - 22,
    size: 11,
    font: fontBold,
    color: rgb(0.05, 0.35, 0.15),
  });
  page.drawText(`Transaction date: ${fmtDate(m.transactionDateIso)}`, {
    x: 48,
    y: y - 34,
    size: 9,
    font,
    color: MUTED,
  });
  page.drawText(`Reference: ${m.transactionReference || "-"}`, {
    x: 320,
    y: y - 34,
    size: 9,
    font,
    color: MUTED,
  });
  y -= 52;

  const colGap = 24;
  const colW = (width - 72 - colGap) / 2;
  page.drawText("CUSTOMER DETAILS", {
    x: 42,
    y,
    size: 9,
    font: fontBold,
    color: PRIMARY,
  });
  page.drawText("PAYMENT DETAILS", {
    x: 42 + colW + colGap,
    y,
    size: 9,
    font: fontBold,
    color: PRIMARY,
  });
  y -= 16;

  const leftLines = [
    `Company: ${m.companyName}`,
    `Admin: ${m.adminName}`,
    `Email: ${m.email || "-"}`,
    `Phone: ${m.phone || "-"}`,
    `Workspace: ${m.workspaceName}`,
  ];
  const rightLines = [
    `Mode: ${m.paymentModeLabel}`,
    `Receipt: ${m.receiptNumber}`,
    `Currency: ${m.currency}`,
    `Plan: ${m.planLabel}`,
    `Billing period: ${m.billingPeriod}`,
    `Transaction ref: ${m.transactionReference || "-"}`,
  ];

  const lh = 11;
  let ly = y;
  for (const line of leftLines) {
    page.drawText(line.length > 52 ? `${line.slice(0, 49)}...` : line, {
      x: 42,
      y: ly,
      size: 8.5,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
    ly -= lh;
  }
  let ry = y;
  for (const line of rightLines) {
    page.drawText(line.length > 58 ? `${line.slice(0, 55)}...` : line, {
      x: 42 + colW + colGap,
      y: ry,
      size: 8.5,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
    ry -= lh;
  }
  y = Math.min(ly, ry) - 18;

  page.drawText("ITEMS", { x: 42, y, size: 9, font: fontBold, color: PRIMARY });
  y -= 14;

  const tableX = 42;
  const cols = [0.46, 0.1, 0.22, 0.22];
  const tw = width - 84;
  const headers = ["Description", "Qty", "Unit", "Total"];
  page.drawRectangle({ x: tableX, y: y - 2, width: tw, height: 16, color: rgb(0.96, 0.96, 0.96) });
  let cx = tableX + 6;
  for (let i = 0; i < 4; i++) {
    page.drawText(headers[i], {
      x: cx,
      y: y - 12,
      size: 8,
      font: fontBold,
      color: MUTED,
    });
    cx += tw * cols[i];
  }
  y -= 22;

  for (const row of m.lineItems) {
    if (y < 200) break;
    page.drawRectangle({ x: tableX, y: y + 5.5, width: tw, height: 0.35, color: BORDER });
    cx = tableX + 6;
    const desc = row.description.length > 40 ? `${row.description.slice(0, 37)}...` : row.description;
    page.drawText(desc, { x: cx, y: y - 8, size: 8.5, font });
    cx += tw * cols[0];
    page.drawText(String(row.quantity), { x: cx, y: y - 8, size: 8.5, font });
    cx += tw * cols[1];
    page.drawText(fmtMoney(row.unit_price, m.currency), { x: cx, y: y - 8, size: 8.5, font });
    cx += tw * cols[2];
    page.drawText(fmtMoney(row.total, m.currency), { x: cx, y: y - 8, size: 8.5, font: fontBold });
    y -= 22;
  }

  const boxW = 200;
  const boxX = width - 42 - boxW;
  const vat = m.vatAmount ?? 0;
  const disc = m.discountAmount ?? 0;
  page.drawRectangle({ x: boxX, y: y - 78, width: boxW, height: 78, borderColor: BORDER, borderWidth: 1 });
  let ty = y - 14;
  page.drawText("Subtotal", { x: boxX + 8, y: ty, size: 9, font, color: MUTED });
  page.drawText(fmtMoney(m.subtotal, m.currency), {
    x: boxX + boxW - 8 - font.widthOfTextAtSize(fmtMoney(m.subtotal, m.currency), 9),
    y: ty,
    size: 9,
    font,
  });
  ty -= 14;
  page.drawText("VAT", { x: boxX + 8, y: ty, size: 9, font, color: MUTED });
  page.drawText(fmtMoney(vat, m.currency), {
    x: boxX + boxW - 8 - font.widthOfTextAtSize(fmtMoney(vat, m.currency), 9),
    y: ty,
    size: 9,
    font,
  });
  ty -= 14;
  page.drawText("Discount", { x: boxX + 8, y: ty, size: 9, font, color: MUTED });
  const discStr = fmtMoney(disc > 0 ? -disc : 0, m.currency);
  page.drawText(discStr, {
    x: boxX + boxW - 8 - font.widthOfTextAtSize(discStr, 9),
    y: ty,
    size: 9,
    font,
  });
  ty -= 22;
  page.drawRectangle({ x: boxX, y: ty - 6, width: boxW, height: 22, color: rgb(0.94, 0.99, 0.95) });
  page.drawText("TOTAL PAID", { x: boxX + 8, y: ty - 2, size: 10, font: fontBold, color: PRIMARY });
  const totalStr = fmtMoney(m.totalPaid, m.currency);
  page.drawText(totalStr, {
    x: boxX + boxW - 8 - fontBold.widthOfTextAtSize(totalStr, 10),
    y: ty - 2,
    size: 10,
    font: fontBold,
    color: PRIMARY,
  });
  y = ty - 36;

  drawWatermark(page, width, height, fontBold, "PAID");

  page.drawText("Payment Confirmed  |  M-Pesa Verified  |  Authorized by FarmVault", {
    x: 42,
    y: 86,
    size: 8,
    font,
    color: MUTED,
  });
  page.drawText(`Generated ${m.footerTimestampIso}`, {
    x: 42,
    y: 72,
    size: 8,
    font,
    color: MUTED,
  });

  const strip =
    `Customer since: ${fmtDate(m.customerSinceIso)}   |   Plan: ${m.planTier}   |   Workspace: ${m.workspaceName}   |   Cycle: ${m.paymentCycle}`;
  const stripTrim = strip.length > 92 ? `${strip.slice(0, 89)}...` : strip;
  page.drawRectangle({ x: 0, y: 0, width, height: 44, color: rgb(0.97, 0.97, 0.97) });
  page.drawText(stripTrim, { x: 42, y: 26, size: 7.5, font, color: MUTED });

  return doc.save();
}
