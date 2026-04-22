export const IMAGE_TOUR_KEY = "farmvault_image_tour_seen";

export function readHasSeenImageTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(IMAGE_TOUR_KEY) === "1";
  } catch {
    return true;
  }
}

export function setHasSeenImageTour(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IMAGE_TOUR_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}
