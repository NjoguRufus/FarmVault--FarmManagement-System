type OneSignalTagRole = "developer" | "company" | "ambassador";
type OneSignalTagPlan = "basic" | "pro";

type OneSignalRuntime = {
  init: (options: Record<string, unknown>) => Promise<void>;
  showSlidedownPrompt: () => void;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  User: {
    addTag: (key: string, value: string) => Promise<void> | void;
    PushSubscription?: {
      id?: string | null;
    };
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalRuntime) => void | Promise<void>>;
  }
}

type SyncIdentityArgs = {
  userId: string;
  role: OneSignalTagRole;
  plan: OneSignalTagPlan;
  onPlayerId?: (playerId: string) => void;
};

const PLAYER_ID_STORAGE_KEY = "farmvault:onesignal:player-id";

function getQueue(): Array<(oneSignal: OneSignalRuntime) => void | Promise<void>> | null {
  if (typeof window === "undefined") return null;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return window.OneSignalDeferred;
}

export function queueOneSignalIdentitySync(args: SyncIdentityArgs): void {
  const queue = getQueue();
  if (!queue) return;

  queue.push(async (oneSignal) => {
    try {
      await oneSignal.login(args.userId);
      await Promise.resolve(oneSignal.User.addTag("role", args.role));
      await Promise.resolve(oneSignal.User.addTag("plan", args.plan));

      const playerId = oneSignal.User.PushSubscription?.id?.trim();
      if (playerId) {
        try {
          window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
        } catch {
          // Non-blocking.
        }
        args.onPlayerId?.(playerId);
      }
    } catch {
      // Non-blocking.
    }
  });
}

export function queueOneSignalLogout(): void {
  const queue = getQueue();
  if (!queue) return;

  queue.push(async (oneSignal) => {
    try {
      await oneSignal.logout();
    } catch {
      // Non-blocking.
    }
  });
}

export function queueOneSignalPromptPermission(): void {
  const queue = getQueue();
  if (!queue) return;

  queue.push(async (oneSignal) => {
    try {
      oneSignal.showSlidedownPrompt();
    } catch {
      // Non-blocking.
    }
  });
}

