import { useCallback, useMemo, useState } from "react";

const STORAGE_KEY = "fv-ambassador-learn-progress-v1";

/** Canonical module ids — legacy localStorage entries outside this set are ignored for counts. */
export const AMBASSADOR_LEARN_MODULE_IDS = ["what-is", "features", "pitching", "earn"] as const;
export type AmbassadorLearnModuleId = (typeof AMBASSADOR_LEARN_MODULE_IDS)[number];
export const AMBASSADOR_LEARN_MODULE_COUNT = AMBASSADOR_LEARN_MODULE_IDS.length;

const validId = (id: string): id is AmbassadorLearnModuleId =>
  (AMBASSADOR_LEARN_MODULE_IDS as readonly string[]).includes(id);

function readStored(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const ids = Array.isArray(parsed) ? (parsed as string[]) : [];
    return ids.filter(validId);
  } catch {
    return [];
  }
}

function writeStored(ids: string[]) {
  const filtered = ids.filter(validId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useAmbassadorLearnProgress() {
  const [completed, setCompleted] = useState<string[]>(readStored);

  const setAndPersist = useCallback((updater: (prev: string[]) => string[]) => {
    setCompleted((prev) => {
      const next = updater(prev.filter(validId));
      writeStored(next);
      return next;
    });
  }, []);

  const markComplete = useCallback(
    (id: string) => {
      if (!validId(id)) return;
      setAndPersist((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [setAndPersist]
  );

  const toggleComplete = useCallback(
    (id: string) => {
      if (!validId(id)) return;
      setAndPersist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [setAndPersist]
  );

  const { done, percent } = useMemo(() => {
    const d = completed.filter(validId).length;
    return {
      done: d,
      percent: Math.round((d / AMBASSADOR_LEARN_MODULE_COUNT) * 100),
    };
  }, [completed]);

  const isComplete = useCallback(
    (id: string) => validId(id) && completed.includes(id),
    [completed]
  );

  return { completed, markComplete, toggleComplete, isComplete, done, percent };
}
