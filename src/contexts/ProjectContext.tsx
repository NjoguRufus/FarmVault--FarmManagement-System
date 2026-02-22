import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { where } from 'firebase/firestore';
import { Project } from '@/types';
import { useCollection } from '@/hooks/useCollection';
import { useAuth } from '@/contexts/AuthContext';

interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  getProjectsByCompany: (companyId: string) => Project[];
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);
const PROJECTS_CACHE_KEY = 'farmvault:projects:cache:v1';

function readCachedProjects(): Project[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, authReady } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const canSubscribeProjects = authReady && isAuthenticated && (isDeveloper || !!user?.companyId);

  const projectConstraints = useMemo(
    () =>
      isDeveloper || !user?.companyId
        ? []
        : [where('companyId', '==', user.companyId)],
    [isDeveloper, user?.companyId],
  );

  const {
    data: projectsData = [],
    isLoading,
    error,
    fromCache,
    hasPendingWrites,
  } = useCollection<Project>('projects', 'projects', {
    enabled: canSubscribeProjects,
    constraints: projectConstraints,
  });
  const [cachedProjects, setCachedProjects] = useState<Project[]>(() => readCachedProjects());
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!canSubscribeProjects || isLoading) return;
    // Persist only fully-synced snapshots (including empty arrays) to avoid stale cache drift.
    if (!fromCache && !hasPendingWrites) {
      setCachedProjects(projectsData);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(projectsData));
        } catch {
          // Ignore quota/private mode failures.
        }
      }
    }
  }, [projectsData, isLoading, fromCache, hasPendingWrites, canSubscribeProjects]);

  const projects = useMemo(() => {
    if (!canSubscribeProjects) {
      return [];
    }

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const shouldUseCache =
      projectsData.length === 0 &&
      cachedProjects.length > 0 &&
      (isOffline || error !== null);

    return shouldUseCache ? cachedProjects : projectsData;
  }, [projectsData, cachedProjects, error, canSubscribeProjects]);

  useEffect(() => {
    if (!activeProject) return;
    const stillExists = projects.some((p) => p.id === activeProject.id);
    if (!stillExists) setActiveProject(null);
  }, [projects, activeProject]);

  const getProjectsByCompany = (companyId: string) => {
    return projects.filter((p) => p.companyId === companyId);
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProject,
        getProjectsByCompany,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
