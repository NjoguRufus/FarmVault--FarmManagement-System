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
import { listFarmsByCompany } from '@/services/farmsService';
import { isProjectClosed } from '@/lib/projectClosed';

function isLegacyPlaceholderFarm(f: { name: string; location: string }) {
  return (
    f.name.trim().toLowerCase() === 'legacy farm' &&
    f.location.trim().toLowerCase() === 'unspecified'
  );
}

interface ProjectContextType {
  projects: Project[];
  /** True while the Supabase projects query for the active company is loading. */
  isLoadingProjects: boolean;
  /** Set when listProjects fails (e.g. RLS) so UI can avoid a false “no projects” onboarding state. */
  projectsFetchError: Error | null;
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  /** Farm workspace selection when no project is active (navbar Farms tab). */
  activeFarmId: string | null;
  setActiveFarmId: (farmId: string | null) => void;
  getProjectsByCompany: (companyId: string) => Project[];
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);
const PROJECTS_CACHE_KEY = 'farmvault:projects:cache:v1';

function activeProjectStorageKey(companyId: string) {
  return `farmvault:activeProjectId:v1:${companyId}`;
}

function activeFarmStorageKey(companyId: string) {
  return `farmvault:activeFarmId:v1:${companyId}`;
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
  const { user, isAuthenticated, authReady, companyDataQueriesEnabled } = useAuth();
  const queryClient = useQueryClient();
  const prevCompanyIdRef = useRef<string | null>(undefined as unknown as string | null);
  const isDeveloper = user?.role === 'developer';
  const companyId = user?.companyId ?? null;
  const canSubscribeProjects =
    companyDataQueriesEnabled && authReady && isAuthenticated && (isDeveloper || !!companyId);

  const {
    data: projectsData = [],
    isLoading: isLoadingProjects,
    error: projectsQueryError,
  } = useQuery({
    queryKey: ['projects', companyId],
    queryFn: () => listProjects(companyId),
    enabled: canSubscribeProjects,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const {
    data: farmsData = [],
    isLoading: isLoadingFarms,
  } = useQuery({
    queryKey: ['farms', companyId ?? ''],
    queryFn: () => listFarmsByCompany(companyId),
    enabled: Boolean(companyId) && authReady && isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const [cachedProjects, setCachedProjects] = useState<Project[]>(() => readCachedProjects());
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [activeFarmId, setActiveFarmIdState] = useState<string | null>(null);
  const restoredWorkspaceSelectionRef = useRef<string | null>(null);

  const setActiveFarmId = useCallback(
    (farmId: string | null) => {
      setActiveFarmIdState(farmId);
      if (typeof window === 'undefined' || !companyId) return;
      try {
        const key = activeFarmStorageKey(companyId);
        if (farmId) window.localStorage.setItem(key, farmId);
        else window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
    [companyId],
  );

  const setActiveProject = useCallback(
    (project: Project | null) => {
      const next = project && !isProjectClosed(project) ? project : null;
      setActiveProjectState(next);
      if (next?.farmId) {
        setActiveFarmIdState(next.farmId);
        if (typeof window !== 'undefined' && companyId) {
          try {
            window.localStorage.setItem(activeFarmStorageKey(companyId), next.farmId);
          } catch {
            // ignore
          }
        }
      }
      if (typeof window === 'undefined' || !companyId) return;
      try {
        const key = activeProjectStorageKey(companyId);
        if (next) window.localStorage.setItem(key, next.id);
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
      setActiveFarmIdState(null);
      restoredWorkspaceSelectionRef.current = null;
      try {
        if (prev) {
          window.localStorage.removeItem(activeProjectStorageKey(prev));
          window.localStorage.removeItem(activeFarmStorageKey(prev));
          void queryClient.removeQueries({ queryKey: ['projects', prev] });
          void queryClient.removeQueries({ queryKey: ['dashboard-expenses-supa', prev] });
          void queryClient.removeQueries({ queryKey: ['dashboard-inventory-supa', prev] });
        }
        window.localStorage.removeItem(PROJECTS_CACHE_KEY);
      } catch {
        // ignore
      }
    }
    if (!companyId && !isDeveloper) {
      setCachedProjects([]);
      setActiveProjectState(null);
      setActiveFarmIdState(null);
      restoredWorkspaceSelectionRef.current = null;
      try {
        window.localStorage.removeItem(PROJECTS_CACHE_KEY);
      } catch {
        // ignore
      }
    }
    prevCompanyIdRef.current = companyId;
  }, [companyId, isDeveloper, queryClient]);

  useEffect(() => {
    if (!canSubscribeProjects || isLoadingProjects) return;
    if (projectsQueryError) return;

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
  }, [projectsData, cachedProjects, isLoadingProjects, projectsQueryError, canSubscribeProjects]);

  const projectsFetchError = (projectsQueryError as Error | null) ?? null;

  const projects = useMemo(() => {
    if (!canSubscribeProjects) {
      return [];
    }

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const shouldUseCache =
      projectsData.length === 0 &&
      cachedProjects.length > 0 &&
      (isOffline || projectsQueryError !== null);

    return shouldUseCache ? cachedProjects : projectsData;
  }, [projectsData, cachedProjects, projectsQueryError, canSubscribeProjects]);

  const visibleFarms = useMemo(
    () =>
      farmsData.filter(
        (f) => f.status !== 'closed' && !isLegacyPlaceholderFarm(f),
      ),
    [farmsData],
  );

  useEffect(() => {
    if (!activeFarmId || isLoadingFarms) return;
    if (!visibleFarms.some((f) => f.id === activeFarmId)) {
      setActiveFarmId(null);
    }
  }, [activeFarmId, isLoadingFarms, visibleFarms, setActiveFarmId]);

  useEffect(() => {
    if (!activeProject) return;
    const stillExists = projects.some((p) => p.id === activeProject.id);
    if (!stillExists) setActiveProject(null);
  }, [projects, activeProject, setActiveProject]);

  useEffect(() => {
    if (!activeProject) return;
    const fresh = projects.find((p) => p.id === activeProject.id);
    if (!fresh) return;
    if (isProjectClosed(fresh)) {
      setActiveProject(null);
      return;
    }
    if (
      fresh.budget !== activeProject.budget ||
      fresh.budgetPoolId !== activeProject.budgetPoolId ||
      fresh.name !== activeProject.name ||
      fresh.status !== activeProject.status
    ) {
      setActiveProjectState(fresh);
    }
  }, [projects, activeProject, setActiveProject]);

  useEffect(() => {
    if (!companyId || !canSubscribeProjects || isLoadingProjects || projectsQueryError || isLoadingFarms) return;
    if (restoredWorkspaceSelectionRef.current === companyId) return;
    restoredWorkspaceSelectionRef.current = companyId;
    try {
      const projectRaw = window.localStorage.getItem(activeProjectStorageKey(companyId));
      if (projectRaw?.trim()) {
        const match = projects.find((p) => p.id === projectRaw.trim());
        if (match && !isProjectClosed(match)) {
          setActiveProject(match);
          return;
        }
      }
      const farmRaw = window.localStorage.getItem(activeFarmStorageKey(companyId));
      if (farmRaw?.trim()) {
        const id = farmRaw.trim();
        if (visibleFarms.some((f) => f.id === id)) setActiveFarmIdState(id);
      }
    } catch {
      // ignore
    }
  }, [
    companyId,
    canSubscribeProjects,
    isLoadingProjects,
    isLoadingFarms,
    projectsQueryError,
    projects,
    visibleFarms,
    setActiveProject,
  ]);

  const getProjectsByCompany = (companyId: string) => {
    return projects.filter((p) => p.companyId === companyId);
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        isLoadingProjects,
        projectsFetchError,
        activeProject,
        setActiveProject,
        activeFarmId,
        setActiveFarmId,
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
