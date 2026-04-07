/**
 * Plays UI notification sound when a push arrives with the app in foreground, or when the user taps a notification.
 * Background pushes cannot play custom audio (browser limitation); vibration is handled in the service worker.
 */

const MSG_TYPE = "FARMVAULT_PUSH_UI_SOUND";

const MP3 = "/sounds/notification.mp3";
const WAV = "/sounds/notification.wav";

let bridgeInstalled = false;
let lastPlay = 0;
const DEBOUNCE_MS = 400;

function playWebAudioChime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.15);
    window.setTimeout(() => {
      void ctx.close();
    }, 280);
  } catch {
    /* ignore */
  }
}

export async function playPushNotificationUiSound(): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlay < DEBOUNCE_MS) return;
  lastPlay = now;

  const tryPlay = async (src: string): Promise<boolean> => {
    try {
      const audio = new Audio(src);
      audio.volume = 0.65;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  };

  if (await tryPlay(MP3)) return;
  if (await tryPlay(WAV)) return;
  playWebAudioChime();
}

/** Listen for messages from src/sw.ts (foreground push + notification click). */
export function initServiceWorkerPushFeedback(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || bridgeInstalled) return;
  bridgeInstalled = true;

  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const d = event.data as { type?: string } | undefined;
    if (d?.type === MSG_TYPE) {
      void playPushNotificationUiSound();
    }
  });
}

