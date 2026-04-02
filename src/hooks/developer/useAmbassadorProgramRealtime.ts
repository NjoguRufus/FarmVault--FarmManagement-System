import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Refetch ambassador-program aggregates when underlying tables change (views are not realtime).
 */
export function useAmbassadorProgramRealtime(onRefresh: () => void) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const channel = supabase
      .channel("dev-ambassador-program")
      .on("postgres_changes", { event: "*", schema: "public", table: "ambassadors" }, () => {
        onRefreshRef.current();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "referrals" }, () => {
        onRefreshRef.current();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions" }, () => {
        onRefreshRef.current();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
