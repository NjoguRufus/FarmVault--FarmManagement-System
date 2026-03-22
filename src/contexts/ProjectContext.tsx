import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
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

function activeProjectStorageKey(companyId: string) {
  return `farmvault:activeProjectId:v1:${companyId}`;
}

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
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const [cachedProjects, setCachedProjects] = useState<Project[]>(() => readCachedProjects());
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const restoredActiveForCompanyRef = useRef<string | null>(null);

  const setActiveProject = useCallback(
    (project: Project | null) => {
      setActiveProjectState(project);
      if (typeof window === 'undefined' || !companyId) return;
      try {
        const key = activeProjectStorageKey(companyId);
        if (project) window.localStorage.setItem(key, project.id);
        else window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
    [companyId],
  );

  useEffect(() => {
    const prev = prevCompanyIdRef.current;
    if (prev !== undefined && prev !== companyId) {
      setCachedProjects([]);
      setActiveProjectState(null);
      restoredActiveForCompanyRef.current = null;
      try {
        if (prev) window.localStorage.removeItem(activeProjectStorageKey(prev));
        window.localStorage.removeItem(PROJECTS_CACHE_KEY);
        queryClient.clear();
      } catch {
        // ignore
      }
    }
    if (!companyId && !isDeveloper) {
      setCachedProjects([]);
      setActiveProjectState(null);
      restoredActiveForCompanyRef.current = null;
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
  }, [projects, activeProject, setActiveProject]);

  useEffect(() => {
    if (!activeProject) return;
    const fresh = projects.find((p) => p.id === activeProject.id);
    if (!fresh) return;
    if (
      fresh.budget !== activeProject.budget ||
      fresh.budgetPoolId !== activeProject.budgetPoolId ||
      fresh.name !== activeProject.name
    ) {
      setActiveProjectState(fresh);
    }
  }, [projects, activeProject]);

  useEffect(() => {
    if (!companyId || !canSubscribeProjects || isLoading || error) return;
    if (!projects.length) return;
    if (restoredActiveForCompanyRef.current === companyId) return;
    restoredActiveForCompanyRef.current = companyId;
    try {
      const raw = window.localStorage.getItem(activeProjectStorageKey(companyId));
      if (!raw?.trim()) return;
      const match = projects.find((p) => p.id === raw.trim());
      if (match) setActiveProjectState(match);
    } catch {
      // ignore
    }
  }, [companyId, canSubscribeProjects, isLoading, error, projects]);

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
