/**
 * Generates `public/email/farmvault-scan-qr.png` — same qr-code-styling options as
 * `src/components/qr/FarmVaultQRGenerator.tsx` (rounded modules, H correction, centered logo).
 *
 * Uses Playwright + real browser canvas (Node canvas adapters break this library).
 *
 * Prerequisite: `npx playwright install chromium` (once per machine).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const QR_RENDER_PX = 1024;
const QR_QUIET_ZONE = 20;
const DOT_COLOR = "#0b1f14";
const BG_COLOR = "#ffffff";
const DATA = "https://farmvault.africa/scan";

const logoCandidates = [
  path.join(root, "public", "Logo", "FarmVault_Logo dark mode.png"),
  path.join(root, "public", "Logo", "FarmVault.png"),
];
const logoPath = logoCandidates.find((p) => fs.existsSync(p)) ?? null;
if (!logoPath) {
  console.error("generate-email-branded-qr: no logo found under public/Logo/");
  process.exit(1);
}

const logoBase64 = fs.readFileSync(logoPath).toString("base64");
const logoMime = logoPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const imageDataUrl = `data:${logoMime};base64,${logoBase64}`;

const qrScriptPath = path.join(root, "node_modules", "qr-code-styling", "lib", "qr-code-styling.js");

if (!fs.existsSync(qrScriptPath)) {
  console.error("generate-email-branded-qr: missing", qrScriptPath);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: Math.ceil(QR_RENDER_PX * 1.2), height: Math.ceil(QR_RENDER_PX * 1.2) },
  });

  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;background:#fff;"><div id="host"></div></body></html>`,
    { waitUntil: "domcontentloaded" },
  );

  await page.addScriptTag({ path: qrScriptPath });

  await page.evaluate(
    ({
      data,
      image,
      width,
      height,
      margin,
      dotColor,
      bgColor,
    }) => {
      const Ctor = globalThis.QRCodeStyling;
      if (!Ctor) throw new Error("QRCodeStyling global missing after script load");
      const qr = new Ctor({
        width,
        height,
        type: "canvas",
        data,
        margin,
        qrOptions: { errorCorrectionLevel: "H" },
        dotsOptions: { type: "rounded", color: dotColor, roundSize: true },
        cornersSquareOptions: { type: "extra-rounded", color: dotColor },
        cornersDotOptions: { type: "dot", color: dotColor },
        backgroundOptions: { color: bgColor },
        image,
        imageOptions: {
          crossOrigin: "anonymous",
          hideBackgroundDots: true,
          imageSize: 0.22,
          margin: 6,
        },
      });
      const host = document.getElementById("host");
      qr.append(host);
      return true;
    },
    {
      data: DATA,
      image: imageDataUrl,
      width: QR_RENDER_PX,
      height: QR_RENDER_PX,
      margin: QR_QUIET_ZONE,
      dotColor: DOT_COLOR,
      bgColor: BG_COLOR,
    },
  );

  await page.waitForSelector("#host canvas", { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 400));

  const canvas = page.locator("#host canvas").first();
  const png = await canvas.screenshot({ type: "png" });

  const outDir = path.join(root, "public", "email");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "farmvault-scan-qr.png");
  fs.writeFileSync(outFile, png);
  console.log(`Wrote ${outFile} (${png.length} bytes)`);
} finally {
  await browser.close();
}
