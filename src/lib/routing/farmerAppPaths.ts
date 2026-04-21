/** Canonical company-shell paths (farmer-facing nav). Legacy URLs redirect here. */
export const FARMER_HOME_PATH = '/home';
export const FARMER_FARM_WORK_PATH = '/farm-work';
export const FARMER_NOTES_PATH = '/notes';
export const FARMER_MORE_PATH = '/more';

/** Records/notes list + editor base path for the current shell (company, staff, or developer). */
export function resolveNotesBasePath(pathname: string): string {
  const p = (pathname || '/').replace(/\/+/g, '/');
  if (p.startsWith('/developer/records')) return '/developer/records';
  if (p.startsWith('/staff/notes')) return '/staff/notes';
  return FARMER_NOTES_PATH;
}
