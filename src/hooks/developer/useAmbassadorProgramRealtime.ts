import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { debounce } from "@/lib/debounce";

/**
 * Refetch ambassador-program aggregates when underlying tables change (views are not realtime).
 * Five table listeners can fire in one transaction — debounce to one refresh.
 */
export function useAmbassadorProgramRealtime(onRefresh: () => void) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const schedule = debounce(() => {
      onRefreshRef.current();
    }, 900);

    const channel = supabase
      .channel("dev-ambassador-program")
      .on("postgres_changes", { event: "*", schema: "public", table: "ambassadors" }, () => {
        schedule();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "referrals" }, () => {
        schedule();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions" }, () => {
        schedule();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ambassador_earnings" }, () => {
        schedule();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ambassador_withdrawals" }, () => {
        schedule();
      })
      .subscribe();

    return () => {
      schedule.cancel();
      void supabase.removeChannel(channel);
    };
  }, []);
}
