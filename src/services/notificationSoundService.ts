/**
 * Notification Sound Service
 * Handles loading and playing notification sounds with browser autoplay restrictions.
 */

export type NotificationSoundFile = 
  | 'notification1.aac'
  | 'notification2.aac'
  | 'notification3.aac'
  | 'notification5.aac';

export const NOTIFICATION_SOUNDS: { id: NotificationSoundFile; label: string }[] = [
  { id: 'notification1.aac', label: 'Notification 1' },
  { id: 'notification2.aac', label: 'Notification 2' },
  { id: 'notification3.aac', label: 'Notification 3' },
  { id: 'notification5.aac', label: 'Notification 5' },
];

const SOUND_BASE_PATH = '/notification/';

let audioCache: Map<string, HTMLAudioElement> = new Map();
let lastPlayTime = 0;
const DEBOUNCE_MS = 500;

function getAudioElement(soundFile: NotificationSoundFile): HTMLAudioElement {
  const cached = audioCache.get(soundFile);
  if (cached) return cached;

  const audio = new Audio(`${SOUND_BASE_PATH}${soundFile}`);
  audio.preload = 'auto';
  audioCache.set(soundFile, audio);
  return audio;
}

export function preloadSound(soundFile: NotificationSoundFile): void {
  getAudioElement(soundFile);
}

export function preloadAllSounds(): void {
  NOTIFICATION_SOUNDS.forEach(sound => preloadSound(sound.id));
}

export async function playNotificationSound(
  soundFile: NotificationSoundFile,
  options?: { force?: boolean; volume?: number }
): Promise<boolean> {
  const now = Date.now();
  
  if (!options?.force && now - lastPlayTime < DEBOUNCE_MS) {
    return false;
  }

  try {
    const audio = getAudioElement(soundFile);
    audio.currentTime = 0;
    audio.volume = options?.volume ?? 0.7;
    
    await audio.play();
    lastPlayTime = now;
    return true;
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[notificationSound] Playback failed:', err);
    }
    return false;
  }
}

export async function testNotificationSound(soundFile: NotificationSoundFile): Promise<boolean> {
  return playNotificationSound(soundFile, { force: true, volume: 0.8 });
}

export function stopAllSounds(): void {
  audioCache.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
}

export function clearAudioCache(): void {
  stopAllSounds();
  audioCache.clear();
}

export async function checkAudioPlaybackSupport(): Promise<boolean> {
  try {
    const testAudio = new Audio();
    const canPlayAAC = testAudio.canPlayType('audio/aac') !== '';
    const canPlayMP4 = testAudio.canPlayType('audio/mp4') !== '';
    return canPlayAAC || canPlayMP4;
  } catch {
    return false;
  }
}

export function getSoundLabel(soundFile: NotificationSoundFile): string {
  return NOTIFICATION_SOUNDS.find(s => s.id === soundFile)?.label ?? soundFile;
}
