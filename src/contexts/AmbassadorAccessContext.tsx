import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AMBASSADOR_ACCESS_INTENT_KEY,
  readAmbassadorAccessIntent,
  setAmbassadorAccessIntent as persistAmbassadorAccessIntent,
} from "@/lib/ambassador/accessIntent";

type AmbassadorAccessContextValue = {
  isAccessingAmbassador: boolean;
  setIsAccessingAmbassador: (value: boolean) => void;
};

const AmbassadorAccessContext = createContext<AmbassadorAccessContextValue | null>(null);

export function AmbassadorAccessProvider({ children }: { children: React.ReactNode }) {
  const [isAccessingAmbassador, setState] = useState(() => readAmbassadorAccessIntent());

  useEffect(() => {
    const sync = () => setState(readAmbassadorAccessIntent());
    const onStorage = (e: StorageEvent) => {
      if (e.key === AMBASSADOR_ACCESS_INTENT_KEY || e.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("farmvault:ambassador-access-intent", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("farmvault:ambassador-access-intent", sync);
    };
  }, []);

  const setIsAccessingAmbassador = useCallback((value: boolean) => {
    persistAmbassadorAccessIntent(value);
    setState(value);
  }, []);

  const value = useMemo(
    () => ({ isAccessingAmbassador, setIsAccessingAmbassador }),
    [isAccessingAmbassador, setIsAccessingAmbassador],
  );

  return (
    <AmbassadorAccessContext.Provider value={value}>{children}</AmbassadorAccessContext.Provider>
  );
}

export function useAmbassadorAccess(): AmbassadorAccessContextValue {
  const ctx = useContext(AmbassadorAccessContext);
  if (!ctx) {
    throw new Error("useAmbassadorAccess must be used within AmbassadorAccessProvider");
  }
  return ctx;
}
