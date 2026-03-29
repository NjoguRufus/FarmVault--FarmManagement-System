/**
 * One-time welcome after the user saves their first project during onboarding.
 * Cleared when the user dismisses the banner. Uses sessionStorage (tab-scoped).
 */
const STORAGE_KEY = 'farmvault:postOnboardingFirstProjectWelcome';

export function setPostOnboardingFirstProjectWelcomeFlag(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode / quota */
  }
}

export function hasPostOnboardingFirstProjectWelcomeFlag(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPostOnboardingFirstProjectWelcomeFlag(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
