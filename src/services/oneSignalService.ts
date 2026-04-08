type OneSignalTagRole = "developer" | "company" | "ambassador";
type OneSignalTagPlan = "basic" | "pro";

type OneSignalRuntime = {
  init: (options: Record<string, unknown>) => Promise<void>;
  showSlidedownPrompt: () => void;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications?: {
    requestPermission?: () => Promise<void>;
  };
  User: {
    addTag: (key: string, value: string) => Promise<void> | void;
    PushSubscription?: {
      id?: string | null;
      optedIn?: boolean;
      optIn?: () => Promise<void>;
      optOut?: () => Promise<void>;
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
  roles?: OneSignalTagRole[];
  plan: OneSignalTagPlan;
  companyId?: string | null;
  /** When true, request push permission and optIn if not already subscribed. */
  notificationsEnabled?: boolean;
  onPlayerId?: (playerId: string) => void;
};

const PLAYER_ID_STORAGE_KEY = "farmvault:onesignal:player-id";
const PROMPT_ATTEMPT_PREFIX = "farmvault:onesignal:prompt-attempted:";

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
      const roleTags = Array.isArray(args.roles) && args.roles.length > 0 ? args.roles : [args.role];
      await Promise.resolve(oneSignal.User.addTag("roles", roleTags.join(",")));
      await Promise.resolve(oneSignal.User.addTag("has_role_developer", roleTags.includes("developer") ? "1" : "0"));
      await Promise.resolve(oneSignal.User.addTag("has_role_company", roleTags.includes("company") ? "1" : "0"));
      await Promise.resolve(oneSignal.User.addTag("has_role_ambassador", roleTags.includes("ambassador") ? "1" : "0"));
      await Promise.resolve(oneSignal.User.addTag("plan", args.plan));
      if (args.companyId) {
        await Promise.resolve(oneSignal.User.addTag("companyId", args.companyId));
      }
      if (typeof window !== "undefined") {
        const host = window.location.hostname || "";
        if (host) {
          await Promise.resolve(oneSignal.User.addTag("origin_host", host));
        }
      }

      const optedIn = Boolean(oneSignal.User.PushSubscription?.optedIn);

      if (args.notificationsEnabled && !optedIn) {
        // Company has enabled notifications — prompt once per user per device.
        const promptKey = `${PROMPT_ATTEMPT_PREFIX}${args.userId}`;
        let alreadyAttempted = false;
        try {
          alreadyAttempted = window.localStorage.getItem(promptKey) === "1";
        } catch {
          alreadyAttempted = false;
        }
        if (!alreadyAttempted) {
          if (oneSignal.Notifications?.requestPermission) {
            await oneSignal.Notifications.requestPermission();
          }
          if (oneSignal.User.PushSubscription?.optIn) {
            await oneSignal.User.PushSubscription.optIn();
          }
          try {
            window.localStorage.setItem(promptKey, "1");
          } catch {
            // Non-blocking.
          }
        }
      } else if (!args.notificationsEnabled && optedIn) {
        // Company disabled notifications — silently opt out this device.
        if (oneSignal.User.PushSubscription?.optOut) {
          await oneSignal.User.PushSubscription.optOut();
        }
      }

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

/** Opt out of push for this device without removing the user identity/tags. */
export function queueOneSignalOptOut(): void {
  const queue = getQueue();
  if (!queue) return;

  queue.push(async (oneSignal) => {
    try {
      if (oneSignal.User.PushSubscription?.optOut) {
        await oneSignal.User.PushSubscription.optOut();
      }
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

