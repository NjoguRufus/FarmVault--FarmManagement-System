export type WorkspaceMode = "company" | "ambassador";

export const WORKSPACE_MODE_STORAGE_KEY = "farmvault:workspace-mode:v1";

const EVENT = "farmvault:workspace-mode";

export function readWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") return "company";
  try {
    const v = window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY);
    return v === "ambassador" ? "ambassador" : "company";
  } catch {
    return "company";
  }
}

export function writeWorkspaceMode(mode: WorkspaceMode): void {
  if (typeof window === "undefined") return;
  try {
    if (mode === "ambassador") {
      window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, "ambassador");
    } else {
      window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, "company");
    }
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeWorkspaceMode(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === WORKSPACE_MODE_STORAGE_KEY || e.key === null) listener();
  };
  const onLocal = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onLocal);
  };
}
