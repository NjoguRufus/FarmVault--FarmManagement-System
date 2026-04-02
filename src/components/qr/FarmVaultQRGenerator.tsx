import { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import { cn } from "@/lib/utils";

/** Production scan landing URL — static, no redirects, no SaaS. */
export const FARMVAULT_SCAN_URL = "https://farmvault.africa/scan";

/** Default: `public/Logo/FarmVault_Logo dark mode.png` (URL-encoded for safe loading). */
export const FARMVAULT_QR_LOGO_PATH = encodeURI("/Logo/FarmVault_Logo dark mode.png");

const QR_RENDER_PX = 1024;
const QR_QUIET_ZONE = 20;
const DOT_COLOR = "#0b1f14";
const BG_COLOR = "#ffffff";
const LOGO_LOAD_MS = 12_000;

export type FarmVaultQRGeneratorProps = {
  /** Payload encoded in the QR (default: `FARMVAULT_SCAN_URL`). */
  data?: string;
  /**
   * Center image — public path or absolute URL.
   * Omit (undefined) to use `FARMVAULT_QR_LOGO_PATH`.
   * Pass `null` or `""` to generate with no center image.
   */
  logoSrc?: string | null;
  className?: string;
};

export function preloadLogo(url: string | undefined): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const finish = (ok: string | undefined) => resolve(ok);
    const timer = window.setTimeout(() => finish(undefined), LOGO_LOAD_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(url);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(undefined);
    };
    img.src = url;
  });
}

export function buildQrOptions(
  data: string,
  imageUrl: string | undefined,
): ConstructorParameters<typeof QRCodeStyling>[0] {
  const base: ConstructorParameters<typeof QRCodeStyling>[0] = {
    width: QR_RENDER_PX,
    height: QR_RENDER_PX,
    type: "canvas",
    data,
    margin: QR_QUIET_ZONE,
    qrOptions: {
      errorCorrectionLevel: "H",
    },
    dotsOptions: {
      type: "rounded",
      color: DOT_COLOR,
      roundSize: true,
    },
    cornersSquareOptions: {
      type: "extra-rounded",
      color: DOT_COLOR,
    },
    cornersDotOptions: {
      type: "dot",
      color: DOT_COLOR,
    },
    backgroundOptions: {
      color: BG_COLOR,
    },
  };

  if (!imageUrl) return base;

  return {
    ...base,
    image: imageUrl,
    imageOptions: {
      crossOrigin: "anonymous",
      hideBackgroundDots: true,
      imageSize: 0.22,
      margin: 6,
    },
  };
}

/** Same qr-code-styling recipe as `npm run generate:email-qr` → `public/email/farmvault-scan-qr.png`. */
export function FarmVaultQRGenerator({
  data = FARMVAULT_SCAN_URL,
  logoSrc,
  className,
}: FarmVaultQRGeneratorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const [exportReady, setExportReady] = useState(false);
  const [logoNote, setLogoNote] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const attemptUrl =
      logoSrc === undefined ? FARMVAULT_QR_LOGO_PATH : logoSrc || undefined;

    let cancelled = false;
    setExportReady(false);
    setLogoNote(null);

    (async () => {
      const useImage = await preloadLogo(attemptUrl);
      if (cancelled) return;

      if (attemptUrl && !useImage) {
        setLogoNote(
          "Logo file not found — QR is shown without a center image. Ensure `public/Logo/FarmVault_Logo dark mode.png` exists or pass a valid `logoSrc`.",
        );
      }
      if (cancelled) return;

      QRCodeStyling._clearContainer(host);
      const qr = new QRCodeStyling(buildQrOptions(data, useImage));
      qrRef.current = qr;
      qr.append(host);

      try {
        await qr.getRawData("png");
      } catch {
        // Still allow SVG attempts; surface via disabled state if both fail
      }
      if (cancelled) return;
      setExportReady(true);
    })();

    return () => {
      cancelled = true;
      QRCodeStyling._clearContainer(host);
      qrRef.current = null;
    };
  }, [data, logoSrc]);

  const download = async (extension: "png" | "svg") => {
    const qr = qrRef.current;
    if (!qr || !exportReady) return;
    try {
      await qr.download({ name: "farmvault-scan", extension });
    } catch {
      // Browser may block programmatic download in some contexts
    }
  };

  return (
    <section
      className={cn(
        "flex min-h-[100dvh] w-full flex-col justify-center bg-zinc-950",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-8 sm:py-12">
        <header className="mb-6 text-center sm:mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            FarmVault QR Code
          </h1>
          <p className="mt-2 text-sm text-zinc-400 sm:text-base">Scan to access FarmVault</p>
        </header>

        <div className="w-full max-w-[min(100%,280px)] rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-sm sm:max-w-[300px] sm:p-5">
          <div
            ref={hostRef}
            className="relative aspect-square w-full overflow-hidden rounded-xl bg-white [&_canvas]:h-full [&_canvas]:w-full"
            aria-label="QR code linking to FarmVault scan page"
          />
          {!exportReady && (
            <p className="mt-2 text-center text-xs text-zinc-500" aria-live="polite">
              Generating QR…
            </p>
          )}
        </div>

        <div className="mt-6 flex w-full max-w-xs flex-col gap-3 sm:mt-8 sm:flex-row sm:justify-center">
          <button
            type="button"
            disabled={!exportReady}
            onClick={() => void download("png")}
            className={cn(
              "min-h-[44px] flex-1 rounded-xl px-4 py-3 text-sm font-semibold shadow-md transition sm:min-h-0",
              exportReady
                ? "bg-[#D8B980] text-zinc-950 hover:bg-[#c9a96e] active:scale-[0.98]"
                : "cursor-not-allowed bg-zinc-700 text-zinc-400 opacity-60",
            )}
          >
            Download PNG
          </button>
          <button
            type="button"
            disabled={!exportReady}
            onClick={() => void download("svg")}
            className={cn(
              "min-h-[44px] flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold shadow-sm transition sm:min-h-0",
              exportReady
                ? "border-[#D8B980] bg-[#D8B980]/25 text-[#D8B980] hover:bg-[#D8B980]/40 active:scale-[0.98]"
                : "cursor-not-allowed border-zinc-600 bg-zinc-800/40 text-zinc-500 opacity-60",
            )}
          >
            Download SVG
          </button>
        </div>

        {logoNote && (
          <p className="mt-4 max-w-sm text-center text-xs leading-relaxed text-amber-200/90">{logoNote}</p>
        )}

        <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-zinc-500">
          High error correction (H), quiet zone included. PNG/SVG export matches on-screen design at {QR_RENDER_PX}px for
          print.
        </p>
      </div>
    </section>
  );
}
