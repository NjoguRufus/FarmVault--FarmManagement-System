import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  persistReferralCodeIfEmpty,
  recordReferralSessionOnServer,
} from "@/lib/ambassador/referralPersistence";

/**
 * Global capture for ?ref= on any route (and keeps first-touch persistence).
 */
export function ReferralAttributionCapture() {
  const location = useLocation();
  const lastRecorded = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref")?.trim();
    if (!ref) return;

    const stored = persistReferralCodeIfEmpty(ref);
    if (stored && stored !== lastRecorded.current) {
      lastRecorded.current = stored;
      recordReferralSessionOnServer(stored);
    }
  }, [location.search, location.pathname]);

  return null;
}
