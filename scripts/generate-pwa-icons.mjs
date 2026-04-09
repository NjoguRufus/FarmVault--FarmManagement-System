/**
 * generate-pwa-icons.mjs
 * Generates all four PWA icons from the FarmVault logo.
 *
 * Output:
 *   public/icons/icon-192.png          – 192×192  purpose: any
 *   public/icons/icon-192-maskable.png – 192×192  purpose: maskable (logo at 75% with safe zone)
 *   public/icons/icon-512.png          – 512×512  purpose: any
 *   public/icons/icon-512-maskable.png – 512×512  purpose: maskable (logo at 75% with safe zone)
 *
 * Run: node scripts/generate-pwa-icons.mjs
 */

import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SOURCE = resolve(ROOT, "public/Logo/FarmVault_Logo dark mode.png");
const OUT_DIR = resolve(ROOT, "public/icons");

// FarmVault brand background — matches manifest.json theme_color
const BG = { r: 11, g: 61, b: 46, alpha: 1 }; // #0B3D2E

mkdirSync(OUT_DIR, { recursive: true });

/**
 * Build a square PNG with the logo centred on the brand background.
 * @param {number} canvasSize   – total icon size in px
 * @param {number} logoFraction – logo occupies this fraction of the canvas (0–1)
 */
async function makeIcon(canvasSize, logoFraction) {
  const logoSize = Math.round(canvasSize * logoFraction);
  const offset = Math.round((canvasSize - logoSize) / 2);

  const logoBuffer = await sharp(SOURCE)
    .resize(logoSize, logoSize, { fit: "contain", background: BG })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logoBuffer, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  console.log("Source:", SOURCE);
  console.log("Output:", OUT_DIR);
  console.log("");

  const jobs = [
    // [outputFile, canvasSize, logoFraction]
    // purpose: any  – fill the canvas (logo IS the icon)
    ["icon-192.png", 192, 1.0],
    ["icon-512.png", 512, 1.0],
    // purpose: maskable – logo at 75% so the shield stays inside Android's safe zone
    ["icon-192-maskable.png", 192, 0.75],
    ["icon-512-maskable.png", 512, 0.75],
  ];

  for (const [file, size, fraction] of jobs) {
    const dest = resolve(OUT_DIR, file);
    const buf = await makeIcon(size, fraction);
    await sharp(buf).toFile(dest);
    console.log(`✓  ${file}  (${size}×${size}, logo at ${fraction * 100}%)`);
  }

  console.log("\nAll icons generated successfully.");
}

main().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
