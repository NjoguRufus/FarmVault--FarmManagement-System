import {
  FarmVaultQRGenerator,
  FARMVAULT_SCAN_URL,
} from "@/components/qr/FarmVaultQRGenerator";

/**
 * FarmVault scan QR for developers: preview merchandise/share QR, download PNG/SVG.
 * Protected by `DeveloperRoute` + `DeveloperLayout` like other `/developer/*` pages.
 */
export default function DevQRGeneratorPage() {
  return (
    <div className="-mx-3 flex min-h-0 flex-col sm:-mx-6">
      <div className="border-b border-zinc-800 bg-zinc-900/95 px-3 py-3 text-sm text-zinc-300 sm:px-4 lg:px-6">
        <p className="font-medium text-zinc-100">Scan QR toolkit</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">/developer/qr</code>
          {" · Payload: "}
          <a
            href={FARMVAULT_SCAN_URL}
            className="font-medium text-[#D8B980] underline-offset-2 hover:underline break-all"
            target="_blank"
            rel="noreferrer"
          >
            {FARMVAULT_SCAN_URL}
          </a>
          . Use <strong className="text-zinc-300">Download PNG</strong> or{" "}
          <strong className="text-zinc-300">Download SVG</strong> for print; scan the on-screen code or the file with
          your phone to confirm it opens the URL.
        </p>
      </div>
      <FarmVaultQRGenerator className="min-h-[calc(100dvh-13rem)] sm:min-h-[calc(100dvh-12rem)] lg:min-h-[calc(100dvh-8rem)]" />
    </div>
  );
}
