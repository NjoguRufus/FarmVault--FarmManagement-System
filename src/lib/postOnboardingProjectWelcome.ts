/**
 * One-time welcome after onboarding / first project. Cleared on dismiss.
 * Uses sessionStorage (tab-scoped).
 */
const STORAGE_KEY = 'farmvault:postOnboardingFirstProjectWelcome';
const TRIAL_WELCOME_KEY = 'farmvault:postOnboardingProTrialWelcome';
const TRIAL_COMPANY_NAME_KEY = 'farmvault:postOnboardingProTrialCompanyName';

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

/** After Pro trial RPC succeeds (step 2 onboarding). */
export function setPostOnboardingProTrialWelcome(companyName: string): void {
  try {
    sessionStorage.setItem(TRIAL_WELCOME_KEY, '1');
    sessionStorage.setItem(TRIAL_COMPANY_NAME_KEY, (companyName ?? '').trim());
  } catch {
    /* ignore */
  }
}

export function hasPostOnboardingProTrialWelcomeFlag(): boolean {
  try {
    return sessionStorage.getItem(TRIAL_WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

export function readPostOnboardingProTrialCompanyName(): string {
  try {
    return sessionStorage.getItem(TRIAL_COMPANY_NAME_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function clearPostOnboardingProTrialWelcomeFlag(): void {
  try {
    sessionStorage.removeItem(TRIAL_WELCOME_KEY);
    sessionStorage.removeItem(TRIAL_COMPANY_NAME_KEY);
  } catch {
    /* ignore */
  }
}
