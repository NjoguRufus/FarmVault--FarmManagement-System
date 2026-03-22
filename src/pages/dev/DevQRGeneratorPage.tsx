import {
  FarmVaultQRGenerator,
  FARMVAULT_SCAN_URL,
} from "@/components/qr/FarmVaultQRGenerator";

/**
 * Development-only: preview FarmVault merchandise QR, download PNG/SVG, and verify scans.
 * Requires developer auth (`DeveloperRoute` + `DeveloperLayout`, same as other `/developer/*` pages).
 */
export default function DevQRGeneratorPage() {
  if (!import.meta.env.DEV) {
    return (
      <div className="fv-card p-6 text-sm text-muted-foreground">
        The QR generator is only available in development builds. Run{" "}
        <code className="text-foreground">npm run dev</code> and sign in as a developer.
      </div>
    );
  }

  return (
    <div className="-m-6 flex min-h-0 flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/95 px-4 py-3 text-sm text-zinc-300 lg:px-6">
        <p className="font-medium text-zinc-100">Dev · Scan QR toolkit</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">/developer/qr</code>
          {" · Payload: "}
          <a
            href={FARMVAULT_SCAN_URL}
            className="font-medium text-[#D8B980] underline-offset-2 hover:underline"
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
      <FarmVaultQRGenerator className="min-h-[calc(100dvh-11rem)] lg:min-h-[calc(100dvh-8rem)]" />
    </div>
  );
}
