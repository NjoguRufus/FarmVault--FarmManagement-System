import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import { cn } from "@/lib/utils";
import {
  buildQrOptions,
  FARMVAULT_QR_LOGO_PATH,
  preloadLogo,
} from "@/components/qr/FarmVaultQRGenerator";

export type AmbassadorReferralQrBlockHandle = {
  downloadPng: (fileBaseName: string) => Promise<void>;
};

type Props = {
  url: string;
  className?: string;
  hostClassName?: string;
};

export const AmbassadorReferralQrBlock = forwardRef<AmbassadorReferralQrBlockHandle, Props>(
  function AmbassadorReferralQrBlock({ url, className, hostClassName }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const qrRef = useRef<QRCodeStyling | null>(null);
    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
      downloadPng: async (fileBaseName: string) => {
        const qr = qrRef.current;
        if (!qr || !ready) return;
        const safe = fileBaseName.replace(/[^\w-]+/g, "-").slice(0, 80) || "farmvault-referral";
        try {
          await qr.download({ name: safe, extension: "png" });
        } catch {
          /* ignore */
        }
      },
    }));

    useEffect(() => {
      const host = hostRef.current;
      if (!host || !url) return;

      let cancelled = false;
      setReady(false);

      void (async () => {
        const useImage = await preloadLogo(FARMVAULT_QR_LOGO_PATH);
        if (cancelled) return;

        QRCodeStyling._clearContainer(host);
        const qr = new QRCodeStyling(buildQrOptions(url, useImage));
        qrRef.current = qr;
        qr.append(host);

        try {
          await qr.getRawData("png");
        } catch {
          /* still show QR */
        }
        if (!cancelled) setReady(true);
      })();

      return () => {
        cancelled = true;
        QRCodeStyling._clearContainer(host);
        qrRef.current = null;
      };
    }, [url]);

    return (
      <div className={cn("w-full", className)}>
        <div
          ref={hostRef}
          className={cn(
            "relative aspect-square w-full overflow-hidden rounded-lg bg-white [&_canvas]:h-full [&_canvas]:w-full",
            hostClassName,
          )}
          aria-label="QR code for your referral link"
        />
        {!ready && (
          <p className="mt-2 text-center text-xs text-emerald-200/60" aria-live="polite">
            Generating QR…
          </p>
        )}
      </div>
    );
  },
);
