import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Project } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { listProjects } from '@/services/projectsService';

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
  const queryClient = useQueryClient();
  const prevCompanyIdRef = useRef<string | null>(undefined as unknown as string | null);
  const isDeveloper = user?.role === 'developer';
  const companyId = user?.companyId ?? null;
  const canSubscribeProjects = authReady && isAuthenticated && (isDeveloper || !!companyId);

  const {
    data: projectsData = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => listProjects(companyId),
    enabled: canSubscribeProjects,
    staleTime: 60_000,
  });
  const [cachedProjects, setCachedProjects] = useState<Project[]>(() => readCachedProjects());
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  useEffect(() => {
    const prev = prevCompanyIdRef.current;
    if (prev !== undefined && prev !== companyId) {
      setCachedProjects([]);
      setActiveProject(null);
      try {
        window.localStorage.removeItem(PROJECTS_CACHE_KEY);
        queryClient.clear();
      } catch {
        // ignore
      }
    }
    if (!companyId && !isDeveloper) {
      setCachedProjects([]);
      setActiveProject(null);
      try {
        window.localStorage.removeItem(PROJECTS_CACHE_KEY);
      } catch {
        // ignore
      }
    }
    prevCompanyIdRef.current = companyId;
  }, [companyId, isDeveloper, queryClient]);

  useEffect(() => {
    if (!canSubscribeProjects || isLoading) return;
    if (error) return;

    // Avoid infinite update loop: only update cache when data actually changes.
    const sameLength = cachedProjects.length === projectsData.length;
    const sameIds =
      sameLength &&
      cachedProjects.every((p, idx) => p.id === projectsData[idx]?.id);
    if (sameIds) return;

    setCachedProjects(projectsData);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(projectsData));
      } catch {
        // Ignore quota/private mode failures.
      }
    }
  }, [projectsData, cachedProjects, isLoading, error, canSubscribeProjects]);

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
