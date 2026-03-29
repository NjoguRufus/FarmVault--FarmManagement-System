import posthog from 'posthog-js';
import { isPosthogConfigured } from '@/lib/analytics/config';
import type { AnalyticsCompanyGroupProps, AnalyticsEventProps, AnalyticsIdentifyProps } from '@/lib/analytics/types';
import type { AnalyticsEventName } from '@/lib/analytics/eventNames';
import {
  extractRouteContextParams,
  resolveRouteAnalyticsMeta,
  type RouteAnalyticsMeta,
} from '@/lib/analytics/routeMetadata';

export { AnalyticsEvents, type AnalyticsEventName } from '@/lib/analytics/eventNames';
export type { AnalyticsIdentifyProps, AnalyticsCompanyGroupProps, AnalyticsEventProps } from '@/lib/analytics/types';
export {
  getPosthogProjectToken,
  getPosthogPublicKey,
  getPosthogHost,
  isPosthogEnabled,
  isPosthogConfigured,
  isPosthogSessionReplayEnabled,
  getPosthogClientOptions,
} from '@/lib/analytics/config';
export { resolveRouteAnalyticsMeta, extractRouteContextParams, type RouteAnalyticsMeta } from '@/lib/analytics/routeMetadata';

const GROUP_TYPE_COMPANY = 'company';

function safeProps(props: AnalyticsEventProps | undefined): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

/** Fire a custom analytics event (no-op if PostHog is not configured or not loaded). */
export function captureEvent(name: AnalyticsEventName | string, properties?: AnalyticsEventProps): void {
  if (!isPosthogConfigured() || typeof window === 'undefined') return;
  try {
    if (!posthog.__loaded) return;
    posthog.capture(name, safeProps(properties));
  } catch {
    /* never break app flows */
  }
}

/**
 * Standard page view with module context. Uses PostHog's $pageview for funnel compatibility.
 */
export function capturePageView(input: {
  route_path: string;
  page_name?: string;
  module_name?: string;
  company_id?: string | null;
  company_name?: string | null;
  role?: string | null;
  subscription_plan?: string | null;
  project_id?: string | null;
  crop_type?: string | null;
}): void {
  if (!isPosthogConfigured() || typeof window === 'undefined') return;
  try {
    if (!posthog.__loaded) return;
    const meta =
      input.page_name && input.module_name
        ? { page_name: input.page_name, module_name: input.module_name }
        : resolveRouteAnalyticsMeta(input.route_path);
    const routeParams = extractRouteContextParams(input.route_path);
    const projectId = input.project_id ?? routeParams.project_id ?? null;
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      route_path: input.route_path,
      page_name: meta.page_name,
      module_name: meta.module_name,
      ...(input.company_id ? { company_id: input.company_id } : {}),
      ...(input.company_name ? { company_name: input.company_name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.subscription_plan ? { subscription_plan: input.subscription_plan } : {}),
      ...(projectId ? { project_id: projectId } : {}),
      ...(input.crop_type ? { crop_type: input.crop_type } : {}),
      ...(routeParams.harvest_id ? { harvest_id: routeParams.harvest_id } : {}),
      ...(routeParams.employee_id ? { employee_id: routeParams.employee_id } : {}),
      ...(routeParams.company_id_param ? { developer_target_company_id: routeParams.company_id_param } : {}),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Identify the signed-in user.
 * `distinct_id` / `user_id` is the stable Clerk user id (`core.profiles.clerk_user_id`). FarmVault does not use Supabase Auth;
 * this is the canonical app user key for joining analytics to tenant data in a warehouse.
 */
export function identifyAnalyticsUser(props: AnalyticsIdentifyProps): void {
  if (!isPosthogConfigured() || typeof window === 'undefined') return;
  const { user_id, ...rest } = props;
  if (!user_id) return;
  try {
    if (!posthog.__loaded) return;
    const personProps = safeProps({
      user_id,
      email: rest.email ?? undefined,
      full_name: rest.full_name ?? undefined,
      role: rest.role ?? undefined,
      company_id: rest.company_id ?? undefined,
      company_name: rest.company_name ?? undefined,
      subscription_plan: rest.subscription_plan ?? undefined,
      tenant_status: rest.tenant_status ?? undefined,
      onboarding_status: rest.onboarding_status ?? undefined,
      is_developer: rest.is_developer ?? undefined,
    });
    posthog.identify(user_id, personProps);
  } catch {
    /* ignore */
  }
}

/** Associate the session with a company for group analytics (developer console / per-tenant metrics). */
export function setAnalyticsCompanyGroup(
  companyId: string | null | undefined,
  properties?: Partial<AnalyticsCompanyGroupProps>,
): void {
  if (!isPosthogConfigured() || typeof window === 'undefined') return;
  const id = companyId?.trim();
  if (!id) return;
  try {
    if (!posthog.__loaded) return;
    const groupProps = safeProps({
      company_id: id,
      company_name: properties?.company_name ?? undefined,
      plan: properties?.plan ?? undefined,
      status: properties?.status ?? undefined,
      created_at:
        properties?.created_at != null
          ? typeof properties.created_at === 'string'
            ? properties.created_at
            : String(properties.created_at)
          : undefined,
      trial_end:
        properties?.trial_end != null
          ? typeof properties.trial_end === 'string'
            ? properties.trial_end
            : String(properties.trial_end)
          : undefined,
      active_until:
        properties?.active_until != null
          ? typeof properties.active_until === 'string'
            ? properties.active_until
            : String(properties.active_until)
          : undefined,
    });
    posthog.group(GROUP_TYPE_COMPANY, id, groupProps);
  } catch {
    /* ignore */
  }
}

/** Clear identity on logout (new anonymous id for the browser). */
export function resetAnalyticsUser(): void {
  if (!isPosthogConfigured() || typeof window === 'undefined') return;
  try {
    if (!posthog.__loaded) return;
    posthog.reset();
  } catch {
    /* ignore */
  }
}
