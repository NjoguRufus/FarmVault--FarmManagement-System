import React, { useMemo, useState } from 'react';
import { Plus, Search, MoreHorizontal, ExternalLink, Star, Loader2, Archive, RotateCcw, Filter } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { updateProject } from '@/services/projectsService';
import { toast } from 'sonner';
import { isConcurrentUpdateConflict, CONCURRENT_UPDATE_MESSAGE } from '@/lib/concurrentUpdate';
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
import { FarmFormModal } from '@/components/farms/FarmFormModal';
import { listFarmsByCompany, updateFarm } from '@/services/farmsService';
import { Farm } from '@/types';

function isLegacyFarm(farm: Farm): boolean {
  return (
    farm.name.trim().toLowerCase() === 'legacy farm' &&
    farm.location.trim().toLowerCase() === 'unspecified'
  );
}

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

type FarmCardProps = {
  farm: Farm;
  isClosed: boolean;
  canMutate: boolean;
  onCloseRequest: () => void;
  onReopenRequest: () => void;
  onLeaseEditRequest: () => void;
  onNavigateView: () => void;
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

function FarmListCard({
  farm,
  isClosed,
  canMutate,
  onCloseRequest,
  onReopenRequest,
  onLeaseEditRequest,
  onNavigateView,
  formatCurrency,
}: FarmCardProps) {
  const leaseCost = Number(farm.leaseCost ?? 0);
  return (
    <div
      className={cn(
        'fv-card transition-shadow flex flex-col justify-between relative overflow-hidden',
        isClosed && 'opacity-[0.94] border-border/50 bg-muted/15 shadow-none',
        'hover:shadow-card-hover cursor-pointer',
      )}
      onClick={onNavigateView}
    >
      {isClosed && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center overflow-hidden" aria-hidden>
          <span
            className="select-none whitespace-nowrap text-[clamp(0.95rem,3.5vw,1.35rem)] font-bold uppercase tracking-[0.14em] text-rose-600/[0.12]"
            style={{ transform: 'rotate(-28deg)' }}
          >
            CLOSED
          </span>
        </div>
      )}

      <div className="relative z-[2] flex flex-col flex-1 justify-between">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌾</span>
            <div>
              <h3 className="font-semibold text-foreground">{farm.name}</h3>
              <p className="text-xs text-muted-foreground">{farm.location}</p>
            </div>
          </div>
          <span className={cn('fv-badge capitalize', isClosed ? 'bg-rose-100/90 text-rose-900' : 'fv-badge--active')}>
            {isClosed ? 'closed' : 'active'}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Ownership</span>
            <span className="font-medium capitalize">{farm.ownershipType}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Lease Cost</span>
            <span className="font-medium">
              {farm.ownershipType === 'leased' ? formatCurrency(leaseCost) : 'N/A'}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between gap-2">
          <div className="flex flex-col space-y-1 min-w-0">
            <span className="text-xs text-muted-foreground">
              Added {formatDate(farm.createdAt)}
            </span>
            {farm.ownershipType === 'leased' && farm.leaseExpiresAt && (
              <span className="text-xs text-muted-foreground">
                Lease expiry: {formatDate(farm.leaseExpiresAt)}
              </span>
            )}
          </div>
          <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="p-1.5 hover:bg-muted rounded-lg transition-colors" aria-label="Farm actions">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="cursor-pointer" onClick={onNavigateView}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Farm
                </DropdownMenuItem>
                {!isClosed && canMutate && (
                  <>
                    {farm.ownershipType === 'leased' && (
                      <DropdownMenuItem className="cursor-pointer" onClick={onLeaseEditRequest}>
                        Update Lease
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer font-semibold text-rose-800 bg-rose-50/90 focus:bg-rose-100"
                      onClick={onCloseRequest}
                    >
                      <Archive className="mr-2 h-4 w-4 shrink-0" />
                      Close Farm
                    </DropdownMenuItem>
                  </>
                )}
                {isClosed && canMutate && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={onReopenRequest}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reopen Farm
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
  const [addFarmOpen, setAddFarmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'projects' | 'farms'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCropType, setSelectedCropType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [farmCloseTarget, setFarmCloseTarget] = useState<Farm | null>(null);
  const [farmReopenTarget, setFarmReopenTarget] = useState<Farm | null>(null);
  const [farmLeaseEdit, setFarmLeaseEdit] = useState<Farm | null>(null);
  const [leaseAmountPaidInput, setLeaseAmountPaidInput] = useState('');
  const [leaseExpiresAtInput, setLeaseExpiresAtInput] = useState('');
  React.useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'farms') setActiveTab('farms');
    if (view === 'projects') setActiveTab('projects');
  }, [searchParams]);

  const [closeTarget, setCloseTarget] = useState<Project | null>(null);
  const [reopenTarget, setReopenTarget] = useState<Project | null>(null);
  const visibleProjects = user ? projects.filter((p) => p.companyId === user.companyId) : [];
  const { data: farms = [] } = useQuery({
    queryKey: ['farms', user?.companyId ?? ''],
    queryFn: () => listFarmsByCompany(user?.companyId ?? null),
    enabled: Boolean(user?.companyId),
  });

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
  const cleanedFarms = useMemo(() => farms.filter((farm) => !isLegacyFarm(farm)), [farms]);
  const { activeFarms, closedFarms } = useMemo(() => {
    const active: Farm[] = [];
    const closed: Farm[] = [];
    for (const farm of cleanedFarms) {
      if (farm.status === 'closed') closed.push(farm);
      else active.push(farm);
    }
    return { activeFarms: active, closedFarms: closed };
  }, [cleanedFarms]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const farmProjectCropMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const project of visibleProjects) {
      if (!project.farmId) continue;
      const bucket = map.get(project.farmId) ?? new Set<string>();
      bucket.add(project.cropType);
      map.set(project.farmId, bucket);
    }
    return map;
  }, [visibleProjects]);

  const matchesProjectFilters = (project: Project, listKind: 'active' | 'closed') => {
    const matchesSearch =
      !normalizedSearch ||
      [project.name, project.location, project.cropType].some((v) =>
        String(v ?? '').toLowerCase().includes(normalizedSearch),
      );
    if (!matchesSearch) return false;

    const matchesCrop = selectedCropType === 'all' || project.cropType === selectedCropType;
    if (!matchesCrop) return false;

    if (selectedStatus === 'all') return true;
    if (listKind === 'closed') return selectedStatus === 'closed';
    return project.status === selectedStatus;
  };

  const matchesFarmFilters = (farm: Farm, listKind: 'active' | 'closed') => {
    const matchesSearch =
      !normalizedSearch ||
      [farm.name, farm.location, farm.ownershipType].some((v) =>
        String(v ?? '').toLowerCase().includes(normalizedSearch),
      );
    if (!matchesSearch) return false;

    if (selectedCropType !== 'all') {
      const cropSet = farmProjectCropMap.get(farm.id);
      if (!cropSet || !cropSet.has(selectedCropType)) return false;
    }

    if (selectedStatus === 'all') return true;
    if (selectedStatus === 'closed') return listKind === 'closed';
    if (selectedStatus === 'active') return listKind === 'active';
    return false;
  };

  const filteredActiveProjects = useMemo(() => {
    return activeProjects.filter((project) => matchesProjectFilters(project, 'active'));
  }, [activeProjects, selectedCropType, selectedStatus, normalizedSearch]);
  const filteredClosedProjects = useMemo(() => {
    return closedProjects.filter((project) => matchesProjectFilters(project, 'closed'));
  }, [closedProjects, selectedCropType, selectedStatus, normalizedSearch]);
  const filteredActiveFarms = useMemo(() => {
    return activeFarms.filter((farm) => matchesFarmFilters(farm, 'active'));
  }, [activeFarms, selectedCropType, selectedStatus, normalizedSearch, farmProjectCropMap]);
  const filteredClosedFarms = useMemo(() => {
    return closedFarms.filter((farm) => matchesFarmFilters(farm, 'closed'));
  }, [closedFarms, selectedCropType, selectedStatus, normalizedSearch, farmProjectCropMap]);

  const handleMobileCropChange = (value: string) => {
    setSelectedCropType(value);
  };

  const handleMobileStatusChange = (value: string) => {
    setSelectedStatus(value);
  };

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
      await updateProject(target.id, { status: 'closed' }, { expectedRowVersion: target.rowVersion ?? 1 });
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
      toast.error(isConcurrentUpdateConflict(e) ? CONCURRENT_UPDATE_MESSAGE : 'Couldn’t close this project. Try again.');
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
      await updateProject(target.id, { status: 'active' }, { expectedRowVersion: target.rowVersion ?? 1 });
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
      toast.error(isConcurrentUpdateConflict(e) ? CONCURRENT_UPDATE_MESSAGE : 'Couldn’t reopen this project. Try again.');
    }
  };

  const confirmFarmClose = async () => {
    if (!farmCloseTarget) return;
    try {
      await updateFarm(farmCloseTarget.id, { status: 'closed' });
      toast.success('Farm closed.');
      setFarmCloseTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['farms', user?.companyId ?? ''] });
    } catch (e) {
      console.error(e);
      toast.error('Could not close farm.');
    }
  };

  const confirmFarmReopen = async () => {
    if (!farmReopenTarget) return;
    try {
      await updateFarm(farmReopenTarget.id, { status: 'active' });
      toast.success('Farm reopened.');
      setFarmReopenTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['farms', user?.companyId ?? ''] });
    } catch (e) {
      console.error(e);
      toast.error('Could not reopen farm.');
    }
  };

  const saveLeaseTracking = async () => {
    if (!farmLeaseEdit) return;
    const paidValue = leaseAmountPaidInput.trim() ? Number(leaseAmountPaidInput) : null;
    if (paidValue != null && Number.isNaN(paidValue)) {
      toast.error('Lease amount paid must be a number.');
      return;
    }
    try {
      await updateFarm(farmLeaseEdit.id, {
        leaseAmountPaid: paidValue,
        leaseExpiresAt: leaseExpiresAtInput || null,
      });
      toast.success('Farm lease details updated.');
      setFarmLeaseEdit(null);
      setLeaseAmountPaidInput('');
      setLeaseExpiresAtInput('');
      await queryClient.invalidateQueries({ queryKey: ['farms', user?.companyId ?? ''] });
    } catch (e) {
      console.error(e);
      toast.error('Could not update farm lease details.');
    }
  };

  const renderSection = (title: string | null, subtitle: string | null, list: Project[], closed: boolean) => {
    if (list.length === 0) return null;
    return (
      <section className="space-y-4">
        {(title || subtitle) && (
          <div>
            {title ? <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2> : null}
            {subtitle ? <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p> : null}
          </div>
        )}
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
        <div className="flex items-center gap-2">
          {canCreateProject && (
            <button className="fv-btn fv-btn--secondary" onClick={() => setAddFarmOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Farm
            </button>
          )}
          {canCreateProject && (
            <button
              className="fv-btn fv-btn--primary"
              onClick={openCreateDialog}
              data-tour="projects-new-button"
            >
              <Plus className="h-4 w-4" />
              Create New Project
            </button>
          )}
        </div>
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
      <FarmFormModal open={addFarmOpen} onOpenChange={setAddFarmOpen} />

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

      <AlertDialog open={farmCloseTarget != null} onOpenChange={(o) => !o && setFarmCloseTarget(null)}>
        <AlertDialogContent className="gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Close this farm?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays in your records and can be reopened later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0 sm:mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction className="mt-0" onClick={(e) => { e.preventDefault(); void confirmFarmClose(); }}>
              Close Farm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={farmReopenTarget != null} onOpenChange={(o) => !o && setFarmReopenTarget(null)}>
        <AlertDialogContent className="gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this farm?</AlertDialogTitle>
            <AlertDialogDescription>
              The farm will move back to active farms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0 sm:mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction className="mt-0" onClick={(e) => { e.preventDefault(); void confirmFarmReopen(); }}>
              Reopen Farm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={farmLeaseEdit != null} onOpenChange={(open) => !open && setFarmLeaseEdit(null)}>
        <DialogContent className="max-w-md p-4 sm:p-6">
          <DialogTitle>Update Lease Details</DialogTitle>
          <DialogDescription>
            Track lease payment progress and extend expiry for this farm.
          </DialogDescription>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground">Amount paid (KES)</label>
              <input
                className="fv-input mt-1"
                value={leaseAmountPaidInput}
                onChange={(e) => setLeaseAmountPaidInput(e.target.value)}
                placeholder="e.g 25000"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Lease expiry date</label>
              <input
                type="date"
                className="fv-input mt-1"
                value={leaseExpiresAtInput}
                onChange={(e) => setLeaseExpiresAtInput(e.target.value)}
              />
            </div>
            <button className="fv-btn fv-btn--primary w-full" onClick={() => void saveLeaseTracking()}>
              Save Lease Updates
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects and farms…"
              className="fv-input pl-10"
            />
          </div>
          <Popover open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="sm:hidden inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3 text-foreground transition-colors hover:bg-muted/50"
                aria-label="Open filters"
              >
                <Filter className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-72 rounded-xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:hidden"
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Crop</label>
                  <Select value={selectedCropType} onValueChange={handleMobileCropChange}>
                    <SelectTrigger className="border-border bg-background text-foreground focus-visible:ring-0 focus-visible:ring-offset-0">
                      <SelectValue placeholder="All Crops" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card text-foreground">
                      <SelectItem value="all">All Crops</SelectItem>
                      <SelectItem value="tomatoes">{cropTypeKeyEmoji('tomatoes')} Tomatoes</SelectItem>
                      <SelectItem value="french-beans">{cropTypeKeyEmoji('french-beans')} French Beans</SelectItem>
                      <SelectItem value="capsicum">{cropTypeKeyEmoji('capsicum')} Capsicum</SelectItem>
                      <SelectItem value="maize">{cropTypeKeyEmoji('maize')} Maize</SelectItem>
                      <SelectItem value="watermelons">{cropTypeKeyEmoji('watermelons')} Watermelons</SelectItem>
                      <SelectItem value="rice">{cropTypeKeyEmoji('rice')} Rice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
                  <Select value={selectedStatus} onValueChange={handleMobileStatusChange}>
                    <SelectTrigger className="border-border bg-background text-foreground focus-visible:ring-0 focus-visible:ring-offset-0">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-card text-foreground">
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="hidden sm:flex gap-2">
          <Select value={selectedCropType} onValueChange={setSelectedCropType}>
            <SelectTrigger className="w-[180px] border-border bg-background text-foreground focus-visible:ring-0 focus-visible:ring-offset-0">
              <SelectValue placeholder="All Crops" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card text-foreground">
              <SelectItem value="all">All Crops</SelectItem>
              <SelectItem value="tomatoes">{cropTypeKeyEmoji('tomatoes')} Tomatoes</SelectItem>
              <SelectItem value="french-beans">{cropTypeKeyEmoji('french-beans')} French Beans</SelectItem>
              <SelectItem value="capsicum">{cropTypeKeyEmoji('capsicum')} Capsicum</SelectItem>
              <SelectItem value="maize">{cropTypeKeyEmoji('maize')} Maize</SelectItem>
              <SelectItem value="watermelons">{cropTypeKeyEmoji('watermelons')} Watermelons</SelectItem>
              <SelectItem value="rice">{cropTypeKeyEmoji('rice')} Rice</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[170px] border-border bg-background text-foreground focus-visible:ring-0 focus-visible:ring-offset-0">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card text-foreground">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div
        className={cn(
          "flex w-full max-w-2xl rounded-lg bg-muted/70 p-1 gap-1",
          "max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5 max-sm:[scrollbar-width:thin]",
          "max-sm:[&::-webkit-scrollbar]:h-0.5 max-sm:[&::-webkit-scrollbar-track]:bg-transparent max-sm:[&::-webkit-scrollbar-thumb]:rounded-full max-sm:[&::-webkit-scrollbar-thumb]:bg-border/40 max-sm:[&::-webkit-scrollbar-thumb]:hover:bg-border/60",
          "sm:flex sm:flex-wrap sm:overflow-visible",
        )}
      >
        <button
          type="button"
          onClick={() => setActiveTab('projects')}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:flex-1 sm:px-3",
            activeTab === 'projects' ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Active Projects
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('farms')}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:min-w-0 sm:flex-1 sm:px-3",
            activeTab === 'farms' ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Active Farms
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        {activeTab === 'projects'
          ? 'Seasons you’re working on now — close one when the season is finished.'
          : 'Farms you are actively managing now — close one when operations there are finished.'}
      </p>

      {activeTab === 'projects' ? (
        <div className="space-y-10" data-tour="projects-grid">
          {renderSection(
            null,
            null,
            filteredActiveProjects,
            false,
          )}
          {renderSection(
            'Closed Projects',
            'Finished seasons stay here for your records. Reopen anytime if you need them active again.',
            filteredClosedProjects,
            true,
          )}
          {filteredActiveProjects.length === 0 && filteredClosedProjects.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No projects match your search.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredActiveFarms.map((farm) => (
                <FarmListCard
                  key={farm.id}
                  farm={farm}
                  isClosed={false}
                  canMutate={canEditProject}
                  onCloseRequest={() => setFarmCloseTarget(farm)}
                  onReopenRequest={() => setFarmReopenTarget(farm)}
                  onLeaseEditRequest={() => {
                    setFarmLeaseEdit(farm);
                    setLeaseAmountPaidInput(farm.leaseAmountPaid != null ? String(farm.leaseAmountPaid) : '');
                    setLeaseExpiresAtInput(
                      farm.leaseExpiresAt ? farm.leaseExpiresAt.toISOString().slice(0, 10) : '',
                    );
                  }}
                  onNavigateView={() => navigate(`/farms/${farm.id}`)}
                  formatCurrency={formatCurrency}
                />
              ))}
            </div>
          </section>

          {filteredClosedFarms.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">Closed Farms</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredClosedFarms.map((farm) => (
                  <FarmListCard
                    key={farm.id}
                    farm={farm}
                    isClosed
                    canMutate={canEditProject}
                    onCloseRequest={() => setFarmCloseTarget(farm)}
                    onReopenRequest={() => setFarmReopenTarget(farm)}
                    onLeaseEditRequest={() => {
                      setFarmLeaseEdit(farm);
                      setLeaseAmountPaidInput(farm.leaseAmountPaid != null ? String(farm.leaseAmountPaid) : '');
                      setLeaseExpiresAtInput(
                        farm.leaseExpiresAt ? farm.leaseExpiresAt.toISOString().slice(0, 10) : '',
                      );
                    }}
                    onNavigateView={() => navigate(`/farms/${farm.id}`)}
                    formatCurrency={formatCurrency}
                  />
                ))}
              </div>
            </section>
          )}
          {filteredActiveFarms.length === 0 && filteredClosedFarms.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No farms match your search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
