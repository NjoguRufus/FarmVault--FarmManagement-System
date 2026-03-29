/**
 * Persists onboarding step + form context in sessionStorage so refresh keeps the user on the same step.
 * Scoped per Clerk user id (tab survives reload; new sign-in ignores another user's payload).
 */
const STORAGE_KEY = 'farmvault:onboarding-session:v1';

export type OnboardingSessionStep = 1 | 2 | 3;

export type OnboardingSessionPayload = {
  clerkUserId: string;
  step: OnboardingSessionStep;
  companyId: string | null;
  companyName: string;
  companyEmail: string;
};

function safeParse(raw: string | null): OnboardingSessionPayload | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<OnboardingSessionPayload>;
    if (!o || typeof o.clerkUserId !== 'string') return null;
    const step = Number(o.step);
    if (step !== 1 && step !== 2 && step !== 3) return null;
    return {
      clerkUserId: o.clerkUserId,
      step: step as OnboardingSessionStep,
      companyId: typeof o.companyId === 'string' ? o.companyId : null,
      companyName: typeof o.companyName === 'string' ? o.companyName : '',
      companyEmail: typeof o.companyEmail === 'string' ? o.companyEmail : '',
    };
  } catch {
    return null;
  }
}

export function readOnboardingSessionProgress(clerkUserId: string | null): OnboardingSessionPayload | null {
  if (!clerkUserId) return null;
  try {
    const parsed = safeParse(sessionStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.clerkUserId !== clerkUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOnboardingSessionProgress(payload: OnboardingSessionPayload): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

export function clearOnboardingSessionProgress(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
