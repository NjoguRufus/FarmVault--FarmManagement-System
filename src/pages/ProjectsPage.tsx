import React, { useMemo, useState } from 'react';
import { Plus, Search, MoreHorizontal, ExternalLink, Star, Loader2, Archive, RotateCcw } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Project, ProjectBlock } from '@/types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate, toDate } from '@/lib/dateUtils';
import { getExpectedHarvestDate, getCropDaysToHarvest } from '@/utils/expectedHarvest';
import { usePermissions } from '@/hooks/usePermissions';
import { useCollection } from '@/hooks/useCollection';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { useQueryClient } from '@tanstack/react-query';
import { updateProject } from '@/services/projectsService';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isProjectClosed } from '@/lib/projectClosed';
import { cropTypeKeyEmoji } from '@/lib/cropEmoji';
import { logger } from "@/lib/logger";

type ProjectCardProps = {
  project: Project;
  projectBlocks: ProjectBlock[];
  isClosed: boolean;
  canMutate: boolean;
  onCloseRequest: () => void;
  onReopenRequest: () => void;
  onNavigateView: () => void;
  onSetActive: () => void;
  getCropEmoji: (cropType: string) => string;
  getStatusBadge: (status: Project['status']) => string;
  formatCurrency: (amount: number) => string;
};

function ProjectListCard({
  project,
  projectBlocks,
  isClosed,
  canMutate,
  busy,
  onCloseRequest,
  onReopenRequest,
  onNavigateView,
  onSetActive,
  getCropEmoji,
  getStatusBadge,
  formatCurrency,
}: ProjectCardProps) {
  const isCreating = (project as Project & { setupComplete?: boolean }).setupComplete === false;
  const blocksForProject = projectBlocks.filter((b) => b.projectId === project.id);
  const cropDays = project.useBlocks ? getCropDaysToHarvest(project.cropType) : null;

  return (
    <div
      className={cn(
        'fv-card transition-shadow flex flex-col justify-between relative overflow-hidden',
        isClosed && 'opacity-[0.94] border-border/50 bg-muted/15 shadow-none',
        isCreating ? 'cursor-wait opacity-90' : 'hover:shadow-card-hover cursor-pointer',
      )}
      onClick={() => {
        if (isCreating) return;
        onNavigateView();
      }}
    >
      {isClosed && (
        <div
          className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center overflow-hidden"
          aria-hidden
        >
          <span
            className="select-none whitespace-nowrap text-[clamp(0.95rem,3.5vw,1.35rem)] font-bold uppercase tracking-[0.14em] text-rose-600/[0.12]"
            style={{ transform: 'rotate(-28deg)' }}
          >
            CLOSED
          </span>
        </div>
      )}

      <div className={cn('relative z-[2] flex flex-col flex-1 justify-between')}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{getCropEmoji(project.cropType)}</span>
            <div>
              <h3 className="font-semibold text-foreground">{project.name}</h3>
              <p className="text-xs text-muted-foreground capitalize">
                {project.cropType.replace('-', ' ')}
              </p>
            </div>
          </div>
          {isCreating ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating project…
            </span>
          ) : (
            <span className={cn('fv-badge capitalize', getStatusBadge(project.status))}>
              {project.status}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Location</span>
            <span className="font-medium">{project.location}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-medium">{formatCurrency(project.budget)}</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between gap-2">
          <div className="flex flex-col space-y-1 min-w-0">
            {project.useBlocks && blocksForProject.length > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">
                  Blocks ({blocksForProject.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {blocksForProject.slice(0, 4).map((block) => {
                    const planted = toDate(block.plantingDate);
                    const expected =
                      block.expectedEndDate
                        ? toDate(block.expectedEndDate)
                        : (() => {
                            if (!planted || cropDays == null) return null;
                            const d = new Date(planted);
                            d.setDate(d.getDate() + cropDays);
                            return d;
                          })();

                    return (
                      <span
                        key={block.id}
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 bg-muted/40 text-[11px] text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">{block.blockName}</span>
                        {typeof block.acreage === 'number' && <span>· {block.acreage} ac</span>}
                        {planted && <span>· Planted {formatDate(planted)}</span>}
                        {expected && <span>· Harvest {formatDate(expected)}</span>}
                      </span>
                    );
                  })}
                  {blocksForProject.length > 4 && (
                    <span className="text-[11px] text-muted-foreground">
                      +{blocksForProject.length - 4} more
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  Started {formatDate(project.startDate)}
                </span>
                {getExpectedHarvestDate(project) && (
                  <span className="text-xs text-muted-foreground">
                    Expected Harvest: {formatDate(getExpectedHarvestDate(project))}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  aria-label="Project actions"
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => {
                    onNavigateView();
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Project
                </DropdownMenuItem>
                {!isClosed && (
                  <>
                    <DropdownMenuItem className="cursor-pointer" onClick={onSetActive}>
                      <Star className="mr-2 h-4 w-4" />
                      Set as Active Project
                    </DropdownMenuItem>
                    {canMutate && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer font-semibold text-rose-800 bg-rose-50/90 focus:bg-rose-100 focus:text-rose-900 dark:text-rose-300 dark:bg-rose-950/40 dark:focus:bg-rose-950/60 dark:focus:text-rose-100"
                          onClick={onCloseRequest}
                        >
                          <Archive className="mr-2 h-4 w-4 shrink-0" />
                          Close Project
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
                {isClosed && canMutate && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={onReopenRequest}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reopen Project
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { projects, setActiveProject, activeProject } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreateProject = can('projects', 'create');
  const canEditProject = can('projects', 'edit');
  const isCreateDialogOpen = canCreateProject && searchParams.get('new') === '1';

  const [closeTarget, setCloseTarget] = useState<Project | null>(null);
  const [reopenTarget, setReopenTarget] = useState<Project | null>(null);
  const visibleProjects = user ? projects.filter((p) => p.companyId === user.companyId) : [];

  if (import.meta.env.DEV) {
    logger.log('[Projects] companyId', user?.companyId, 'total', projects.length, 'visible', visibleProjects.length);
  }

  const { data: projectBlocks = [] } = useCollection<ProjectBlock>(
    `projects-page-blocks-${user?.companyId ?? ''}`,
    'projectBlocks',
    {
      companyId: user?.companyId ?? null,
      orderByField: 'createdAt',
      orderByDirection: 'asc',
      enabled: Boolean(user?.companyId),
    },
  );

  const { activeProjects, closedProjects } = useMemo(() => {
    const active: Project[] = [];
    const closed: Project[] = [];
    for (const p of visibleProjects) {
      if (isProjectClosed(p)) closed.push(p);
      else active.push(p);
    }
    return { activeProjects: active, closedProjects: closed };
  }, [visibleProjects]);

  const openCreateDialog = () => {
    const next = new URLSearchParams(searchParams);
    next.set('new', '1');
    setSearchParams(next, { replace: true });
  };

  const closeCreateDialog = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  };

  const getStatusBadge = (status: Project['status']) => {
    const styles: Record<Project['status'], string> = {
      active: 'fv-badge--active',
      planning: 'fv-badge--info',
      completed: 'fv-badge--gold',
      archived: 'bg-muted text-muted-foreground',
      closed: 'bg-rose-100/90 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
    };
    return styles[status];
  };

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const companyId = user?.companyId ?? null;

  const confirmClose = async () => {
    if (!closeTarget || !companyId) return;
    const target = closeTarget;
    setCloseTarget(null);

    if (activeProject?.id === target.id) {
      setActiveProject(null);
    }

    const previousList = queryClient.getQueryData<Project[]>(['projects', companyId]);
    const previousDetail = queryClient.getQueryData<Project | null>(['project', target.id, companyId]);

    queryClient.setQueryData<Project[]>(['projects', companyId], (old) =>
      (old ?? []).map((p) => (p.id === target.id ? { ...p, status: 'closed' } : p)),
    );
    queryClient.setQueryData<Project | null>(['project', target.id, companyId], (old) =>
      old && old.id === target.id ? { ...old, status: 'closed' } : old,
    );

    try {
      await updateProject(target.id, { status: 'closed' });
      toast.success('Project closed', {
        description: 'It’s in Closed Projects whenever you need to look it up.',
      });
      void queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['project', target.id, companyId] });
    } catch (e) {
      console.error(e);
      if (previousList !== undefined) {
        queryClient.setQueryData(['projects', companyId], previousList);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      }
      if (previousDetail !== undefined) {
        queryClient.setQueryData(['project', target.id, companyId], previousDetail);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['project', target.id, companyId] });
      }
      toast.error('Couldn’t close this project. Try again.');
    }
  };

  const confirmReopen = async () => {
    if (!reopenTarget || !companyId) return;
    const target = reopenTarget;
    setReopenTarget(null);

    const previousList = queryClient.getQueryData<Project[]>(['projects', companyId]);
    const previousDetail = queryClient.getQueryData<Project | null>(['project', target.id, companyId]);

    queryClient.setQueryData<Project[]>(['projects', companyId], (old) =>
      (old ?? []).map((p) => (p.id === target.id ? { ...p, status: 'active' } : p)),
    );
    queryClient.setQueryData<Project | null>(['project', target.id, companyId], (old) =>
      old && old.id === target.id ? { ...old, status: 'active' } : old,
    );

    try {
      await updateProject(target.id, { status: 'active' });
      toast.success('Project reopened', {
        description: 'It’s back with your ongoing farms.',
      });
      void queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['project', target.id, companyId] });
    } catch (e) {
      console.error(e);
      if (previousList !== undefined) {
        queryClient.setQueryData(['projects', companyId], previousList);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      }
      if (previousDetail !== undefined) {
        queryClient.setQueryData(['project', target.id, companyId], previousDetail);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['project', target.id, companyId] });
      }
      toast.error('Couldn’t reopen this project. Try again.');
    }
  };

  const renderSection = (title: string, subtitle: string | null, list: Project[], closed: boolean) => {
    if (list.length === 0) return null;
    return (
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2>
          {subtitle ? <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {list.map((project) => (
            <ProjectListCard
              key={project.id}
              project={project}
              projectBlocks={projectBlocks}
              isClosed={closed}
              canMutate={canEditProject}
              onCloseRequest={() => setCloseTarget(project)}
              onReopenRequest={() => setReopenTarget(project)}
              onNavigateView={() => {
                if (!isProjectClosed(project)) {
                  setActiveProject(project);
                }
                navigate(`/projects/${project.id}`);
              }}
              onSetActive={() => setActiveProject(project)}
              getCropEmoji={cropTypeKeyEmoji}
              getStatusBadge={getStatusBadge}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all your agricultural projects
          </p>
        </div>
        {canCreateProject && (
          <button
            className="fv-btn fv-btn--primary"
            onClick={openCreateDialog}
            data-tour="projects-new-button"
          >
            <Plus className="h-4 w-4" />
            Create New or Existing Project
          </button>
        )}
      </div>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            openCreateDialog();
            return;
          }
          closeCreateDialog();
        }}
      >
        <DialogContent className="max-w-2xl p-4 sm:p-6">
          <DialogTitle className="sr-only">Create Project</DialogTitle>
          <DialogDescription className="sr-only">
            Create a new farm project by setting crop setup and farm details.
          </DialogDescription>
          <NewProjectForm onCancel={closeCreateDialog} onSuccess={closeCreateDialog} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={closeTarget != null} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <AlertDialogContent className="gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Close this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This project will be moved to Closed Projects. You can still view it later, but it will no longer
              appear among your ongoing farms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0 sm:mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="mt-0 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600 min-h-11 px-5 text-sm font-semibold shadow-md sm:mt-0"
              onClick={(e) => {
                e.preventDefault();
                void confirmClose();
              }}
            >
              Close Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reopenTarget != null} onOpenChange={(o) => !o && setReopenTarget(null)}>
        <AlertDialogContent className="gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This project will be moved back to your ongoing farms and you can continue recording activities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0 sm:mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="mt-0 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600 min-h-11 px-5 text-sm font-semibold shadow-md sm:mt-0"
              onClick={(e) => {
                e.preventDefault();
                void confirmReopen();
              }}
            >
              Reopen Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search projects…" className="fv-input pl-10" />
        </div>
        <div className="flex gap-2">
          <select className="fv-select">
            <option value="">All Crops</option>
            <option value="tomatoes">Tomatoes</option>
            <option value="french-beans">French Beans</option>
            <option value="capsicum">Capsicum</option>
            <option value="maize">Maize</option>
            <option value="watermelons">Watermelons</option>
            <option value="rice">Rice</option>
          </select>
          <select className="fv-select">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="space-y-10" data-tour="projects-grid">
        {renderSection(
          'Active Projects',
          'Seasons you’re working on now — close one when the season is finished.',
          activeProjects,
          false,
        )}
        {renderSection(
          'Closed Projects',
          'Finished seasons stay here for your records. Reopen anytime if you need them active again.',
          closedProjects,
          true,
        )}
        {visibleProjects.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            No projects yet. Create your first farm project to get started.
          </p>
        )}
      </div>
    </div>
  );
}
