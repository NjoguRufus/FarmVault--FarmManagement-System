import type { Project } from '@/types';

export function isProjectClosed(project: Pick<Project, 'status'> | null | undefined): boolean {
  return String(project?.status ?? '').toLowerCase() === 'closed';
}
