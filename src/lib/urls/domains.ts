/**
 * Centralized environment-aware URL + domain helpers.
 *
 * Goals:
 * - Localhost/dev: never redirect to production domains.
 * - Production: separate marketing domain (farmvault.africa) and app domain (app.farmvault.africa).
 * - Avoid hardcoding URLs throughout the app: use envs with safe fallbacks.
 */
type DomainConfig = {
  publicBaseUrl: string;
  appBaseUrl: string;
};

function stripTrailingSlash(url: string): string {
  return String(url || '').replace(/\/+$/, '');
}

function safeUrl(raw: string | undefined | null): string | null {
  const v = stripTrailingSlash(String(raw || '').trim());
  if (!v) return null;
  try {
    // eslint-disable-next-line no-new
    new URL(v);
    return v;
  } catch {
    return null;
  }
}

function getDefaultConfig(): DomainConfig {
  const publicBaseUrl =
    safeUrl(import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) ?? 'https://farmvault.africa';
  const appBaseUrl =
    safeUrl(import.meta.env.VITE_APP_BASE_URL as string | undefined) ?? 'https://app.farmvault.africa';
  return { publicBaseUrl, appBaseUrl };
}

export function getHostname(): string {
  if (typeof window === 'undefined') return '';
  return (window.location?.hostname || '').toLowerCase();
}

export function isLocalhostHost(hostname = getHostname()): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

export function isProdLike(): boolean {
  // Vite sets import.meta.env.PROD for production builds.
  return Boolean(import.meta.env.PROD);
}

export function getDomainConfig(): DomainConfig {
  const cfg = getDefaultConfig();

  // In dev/localhost, prefer the current origin as BOTH bases.
  // This ensures we never push localhost users to production domains.
  if (typeof window !== 'undefined' && window.location?.origin && !isProdLike()) {
    const origin = stripTrailingSlash(window.location.origin);
    return { publicBaseUrl: origin, appBaseUrl: origin };
  }

  // In production builds running on localhost (rare but possible), still do not force prod domains.
  if (typeof window !== 'undefined' && isLocalhostHost()) {
    const origin = stripTrailingSlash(window.location.origin);
    return { publicBaseUrl: origin, appBaseUrl: origin };
  }

  return cfg;
}

export function getPublicBaseUrl(): string {
  return getDomainConfig().publicBaseUrl;
}

export function getAppBaseUrl(): string {
  return getDomainConfig().appBaseUrl;
}

export function isPublicProductionHost(hostname = getHostname()): boolean {
  if (!isProdLike()) return false;
  if (isLocalhostHost(hostname)) return false;
  return hostname === 'farmvault.africa' || hostname === 'www.farmvault.africa';
}

export function isAppProductionHost(hostname = getHostname()): boolean {
  if (!isProdLike()) return false;
  if (isLocalhostHost(hostname)) return false;
  return hostname === 'app.farmvault.africa';
}

/**
 * PWA (manifest + service worker + install prompt) is enabled on both the app host
 * and the marketing host so the Install button works from the landing page without
 * redirecting. Also enabled on localhost for development.
 */
export function isPwaEnabledHost(hostname = getHostname()): boolean {
  if (typeof window === 'undefined') return false;
  if (isLocalhostHost(hostname)) return true;
  if (!isProdLike()) return false;
  return (
    hostname === 'app.farmvault.africa' ||
    hostname === 'farmvault.africa' ||
    hostname === 'www.farmvault.africa'
  );
}

/**
 * Marketing host (farmvault.africa): signup links must use absolute app URL so ?ref= survives
 * (localStorage does not cross subdomains).
 */
export function isMarketingProductionHost(hostname = getHostname()): boolean {
  return isPublicProductionHost(hostname);
}

export function buildUrl(base: string, path: string): string {
  const b = stripTrailingSlash(base);
  const p = String(path || '').startsWith('/') ? String(path) : `/${path || ''}`;
  return `${b}${p}`;
}

export function getAppAuthUrl(kind: 'sign-in' | 'sign-up'): string {
  const path = kind === 'sign-in' ? '/sign-in' : '/sign-up';
  // If we're already on the app domain or in localhost dev, use relative paths to preserve SPA navigation.
  if (typeof window !== 'undefined') {
    const hostname = getHostname();
    if (!isProdLike() || isLocalhostHost(hostname) || isAppProductionHost(hostname)) return path;
  }
  return buildUrl(getAppBaseUrl(), path);
}

export function getAppEntryUrl(path = '/auth/callback'): string {
  if (typeof window !== 'undefined') {
    const hostname = getHostname();
    if (!isProdLike() || isLocalhostHost(hostname) || isAppProductionHost(hostname)) return path;
  }
  return buildUrl(getAppBaseUrl(), path);
}

/**
 * Farmer sign-up URL: relative on app/localhost; absolute https://app.farmvault.africa/sign-up?... from marketing.
 * `queryString` should not include a leading "?".
 */
export function resolveFarmerSignUpUrl(queryString: string): string {
  const path = queryString ? `/sign-up?${queryString}` : '/sign-up';
  if (typeof window !== 'undefined') {
    const hostname = getHostname();
    if (isProdLike() && !isLocalhostHost(hostname) && isMarketingProductionHost(hostname)) {
      return buildUrl(getAppBaseUrl(), path);
    }
  }
  return path;
}

