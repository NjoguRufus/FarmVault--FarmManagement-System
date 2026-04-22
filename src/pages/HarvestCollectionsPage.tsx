import { logger } from "@/lib/logger";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Scale,
  Banknote,
  ShoppingCart,
  ChevronLeft,
  CheckCircle2,
  Search,
  Package,
  Leaf,
  Sprout,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  CircleDollarSign,
  Zap,
  CloudUpload,
  Pencil,
  MoreHorizontal,
  Trash2,
  HelpCircle,
  Check,
  X,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import AccessRestrictedPage from '@/pages/AccessRestrictedPage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, toDate } from '@/lib/dateUtils';
import { buildHarvestCollectionAutoName } from '@/lib/harvestCollectionNaming';
import { cn } from '@/lib/utils';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import type { HarvestCollection, HarvestPicker, PickerWeighEntry, Project } from '@/types';
import {
  createHarvestCollection,
  addHarvestPicker,
  addPickerWeighEntry,
  updatePickerIntakeEntry,
  deletePickerIntakeEntry,
  markPickerCashPaid,
  markPickersPaidInBatch,
  setBuyerPriceAndMaybeClose,
  registerHarvestCash,
  applyHarvestCashPayment,
  payPickersFromWalletBatch,
  syncClosedCollectionToHarvestSale,
  listPickersByCollectionIds,
  listPickerIntakeByCollectionIds,
  listPickerPaymentsByCollectionIds,
  renameHarvestCollection,
  deleteHarvestCollection,
  transferCollectionToProject,
  mapPicker,
  computeCollectionFinancials,
  updateHarvestPicker,
  getCompanyCollectionFinancialsAggregate,
} from '@/services/harvestCollectionsService';
import { HarvestService } from '@/services/localData/HarvestService';
import {
  computeWalletSummary,
  getWalletLedgerEntries,
  getWalletLedgerEntriesSupabase,
  getFinanceWalletTotals,
  subscribeWalletLedger,
  type ProjectWalletLedgerEntry,
} from '@/services/projectWalletService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { isConcurrentUpdateConflict, CONCURRENT_UPDATE_MESSAGE } from '@/lib/concurrentUpdate';
import { format } from 'date-fns';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Select as UiSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ACTIONS, EVENTS, STATUS, type CallBackProps } from 'react-joyride';
import {
  getHarvestCollectionsStarterSteps,
  filterTourStepsByAvailability,
  hasCompletedHarvestTour,
  hasDismissedHarvestTour,
  setCompletedHarvestTour,
  setDismissedHarvestTour,
  type HarvestTourContext,
} from '@/tours/harvestCollectionsTour';
import { HarvestCollectionsTour } from '@/components/tours/HarvestCollectionsTour';
import { RenameHarvestCollectionModal } from '@/components/modals/RenameHarvestCollectionModal';
import { HarvestCollectionTransferModal } from '@/components/modals/HarvestCollectionTransferModal';
import { isProjectClosed } from '@/lib/projectClosed';
import { FeatureGate } from '@/components/subscription';
import { useHarvestNavPrefix } from '@/hooks/useHarvestNavPrefix';

const COLLECTION_ICONS = [Scale, Package, Leaf, Sprout] as const;
const HARVEST_COLLECTION_BASE_NAME = 'test';

type ViewMode = 'list' | 'intake' | 'pay' | 'buyer' | 'view_pickers';

/** Threshold above which a crate weight is consigggered unusual and triggers a confirmation */
const UNUSUAL_WEIGHT_THRESHOLD_KG = 25;

export default function HarvestCollectionsPage() {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { can: canKey, projectAccessIds } = useEmployeeAccess();
  const { activeProject, activeFarmId, projects, setActiveProject } = useProject();
  const { hasPendingWrites, isSyncing, isOnline, triggerSync } = useConnectivityStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userCompanyId = user?.companyId ?? null;
  const harvestNavPrefix = useHarvestNavPrefix();

  const isAdminUser = user?.role === 'company-admin' || user?.role === 'developer';

  const companyProjects = useMemo(
    () => (userCompanyId ? projects.filter((p) => p.companyId === userCompanyId) : projects),
    [projects, userCompanyId]
  );

  const effectiveProject = useMemo(() => {
    if (routeProjectId) {
      const fromRoute = projects.find((p) => p.id === routeProjectId) ?? null;
      return fromRoute;
    }
    return activeProject;
  }, [routeProjectId, projects, activeProject]);

  /** Farm context for expenses and picker payouts (project preferred). */
  const harvestFarmId = useMemo(
    () => effectiveProject?.farmId ?? activeFarmId ?? null,
    [effectiveProject?.farmId, activeFarmId],
  );

  const harvestProjectSelectOptions = useMemo(() => {
    const open = companyProjects.filter((p) => !isProjectClosed(p));
    if (
      effectiveProject &&
      isProjectClosed(effectiveProject) &&
      !open.some((p) => p.id === effectiveProject.id)
    ) {
      return [effectiveProject, ...open];
    }
    return open;
  }, [companyProjects, effectiveProject]);

  const switchHarvestProject = useCallback(
    (projectId: string) => {
      const next = harvestProjectSelectOptions.find((p) => p.id === projectId) ?? null;
      if (!next || isProjectClosed(next)) return;
      setActiveProject(next as Project);
      navigate(`${harvestNavPrefix}/harvest-collections/${next.id}`, { replace: true });
    },
    [harvestProjectSelectOptions, setActiveProject, navigate, harvestNavPrefix],
  );

  useEffect(() => {
    if (!routeProjectId || !effectiveProject || effectiveProject.id !== routeProjectId) return;
    if (activeProject?.id === routeProjectId) return;
    if (isProjectClosed(effectiveProject)) return;
    setActiveProject(effectiveProject);
  }, [routeProjectId, effectiveProject, activeProject?.id, setActiveProject]);

  useEffect(() => {
    if (!userCompanyId) return;
    captureEvent(AnalyticsEvents.HARVEST_COLLECTION_VIEWED, {
      company_id: userCompanyId,
      project_id: effectiveProject?.id,
      module_name: 'harvest',
      route_path: routeProjectId ? `/harvest-collections/${routeProjectId}` : '/harvest-collections',
    });
  }, [userCompanyId, effectiveProject?.id, routeProjectId]);

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [autoSuggestedCollectionName, setAutoSuggestedCollectionName] = useState('');
  const newCollectionNameDirtyRef = useRef(false);
  const createCollectionInFlightRef = useRef(false);
  const [newHarvestDate, setNewHarvestDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [newPricePerKgPicker, setNewPricePerKgPicker] = useState('20');
  const [creating, setCreating] = useState(false);

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [newPickerNumber, setNewPickerNumber] = useState('');
  const [newPickerName, setNewPickerName] = useState('');
  const [addingPicker, setAddingPicker] = useState(false);
  const newPickerNumberRef = useRef<HTMLInputElement>(null);

  const [addWeighOpen, setAddWeighOpen] = useState(false);
  const [weighPickerId, setWeighPickerId] = useState('');
  const [weighKg, setWeighKg] = useState('');
  const [weighTrip, setWeighTrip] = useState('1');
  const [weighOpenedFromCard, setWeighOpenedFromCard] = useState(false);
  const [isEditingWeighPickerName, setIsEditingWeighPickerName] = useState(false);
  const [editingWeighPickerName, setEditingWeighPickerName] = useState('');
  const [editingWeighPickerSaving, setEditingWeighPickerSaving] = useState(false);
  const editingWeighPickerNameRef = useRef<HTMLInputElement>(null);
  const [isSavingWeight, setIsSavingWeight] = useState(false);
  const weighKgInputRef = useRef<HTMLInputElement>(null);
  // Unusual weight confirmation dialog
  const [unusualWeightConfirm, setUnusualWeightConfirm] = useState<{ kg: number; mode: 'close' | 'stay' | 'next' } | null>(null);
  const [recentPickerIds, setRecentPickerIds] = useState<string[]>([]);
  const [lastWeighPickerId, setLastWeighPickerId] = useState<string | null>(null);
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [quickPayPickerId, setQuickPayPickerId] = useState<string | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPaySaving, setQuickPaySaving] = useState(false);
  /** Single-picker Pay Full flow (non–quick pay grid). */
  const [singlePickerPayWorkingId, setSinglePickerPayWorkingId] = useState<string | null>(null);
  const [quickPayPartialOpen, setQuickPayPartialOpen] = useState(false);
  const [quickPayPartialBalance, setQuickPayPartialBalance] = useState(0);
  const [quickPayLocalPaidByPickerId, setQuickPayLocalPaidByPickerId] = useState<Record<string, number>>({});
  const [quickPaySummaryExpanded, setQuickPaySummaryExpanded] = useState(false);
  const [quickPaySearch, setQuickPaySearch] = useState('');
  const [debouncedQuickPaySearch, setDebouncedQuickPaySearch] = useState('');
  const skipJustClickedRef = useRef(false);

  const [buyerPricePerKg, setBuyerPricePerKg] = useState('');
  const [markingBuyerPaid, setMarkingBuyerPaid] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [debouncedPickerSearch, setDebouncedPickerSearch] = useState('');
  const [viewPickersSearch, setViewPickersSearch] = useState('');
  const [debouncedViewPickersSearch, setDebouncedViewPickersSearch] = useState('');
  const [expandedViewPickerIds, setExpandedViewPickerIds] = useState<Set<string>>(new Set());
  const [viewPickersLayout, setViewPickersLayout] = useState<'list' | 'cards'>(isAdminUser ? 'cards' : 'list');
  const viewPickersPrevSearchRef = useRef('');
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [paySelectedIds, setPaySelectedIds] = useState<Set<string>>(new Set());
  const [cashAmount, setCashAmount] = useState('');
  const [cashSource, setCashSource] = useState<'bank' | 'custom'>('bank');
  const [cashSourceCustom, setCashSourceCustom] = useState('');
  const [cashDialogCollection, setCashDialogCollection] = useState<HarvestCollection | null>(null);
  const [cashDialogVisible, setCashDialogVisible] = useState(false);
  const [cashDialogSaving, setCashDialogSaving] = useState(false);
  const [walletLedgerEntries, setWalletLedgerEntries] = useState<ProjectWalletLedgerEntry[]>([]);
  const [payingSelected, setPayingSelected] = useState(false);
  const [payingPickerIds, setPayingPickerIds] = useState<Set<string> | null>(null);
  const [showPaidAndProfit, setShowPaidAndProfit] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'pending' | 'closed'>('all');
  const [quickMode, setQuickMode] = useState(false);
  const [quickIntakePickerNumber, setQuickIntakePickerNumber] = useState('');
  const [quickIntakeKg, setQuickIntakeKg] = useState('');
  const [isSavingQuickIntake, setIsSavingQuickIntake] = useState(false);
  const quickIntakePickerNumberRef = useRef<HTMLInputElement>(null);
  const quickIntakeKgRef = useRef<HTMLInputElement>(null);
  const quickIntakeContainerRef = useRef<HTMLDivElement>(null);
  // Unusual weight confirmation for quick intake
  const [unusualQuickWeightConfirm, setUnusualQuickWeightConfirm] = useState<{ kg: number; saveAndStay: boolean } | null>(null);
  const [editIntakeEntry, setEditIntakeEntry] = useState<{
    id: string;
    pickerId: string;
    pickerNumber: number | string;
    pickerName: string;
    kg: number;
    collectionId: string;
  } | null>(null);
  const [editIntakePickerId, setEditIntakePickerId] = useState('');
  const [editIntakeKg, setEditIntakeKg] = useState('');
  const [editIntakeSaving, setEditIntakeSaving] = useState(false);
  const [expandedQuickIntakePickerId, setExpandedQuickIntakePickerId] = useState<string | null>(null);
  const [deleteIntakeConfirm, setDeleteIntakeConfirm] = useState<{ entryId: string; collectionId: string } | null>(null);
  const [deletingIntakeEntry, setDeletingIntakeEntry] = useState(false);

  // Collection management: rename (audit logged) + delete (with confirmation).
  const [renameCollectionDialogOpen, setRenameCollectionDialogOpen] = useState(false);
  const [renameTargetCollection, setRenameTargetCollection] = useState<HarvestCollection | null>(null);
  const [transferCollectionDialogOpen, setTransferCollectionDialogOpen] = useState(false);
  const [transferTargetCollection, setTransferTargetCollection] = useState<HarvestCollection | null>(null);
  const [deleteCollectionConfirm, setDeleteCollectionConfirm] = useState<HarvestCollection | null>(null);
  const [deletingCollection, setDeletingCollection] = useState(false);

  const [harvestTourRun, setHarvestTourRun] = useState(false);
  const [harvestTourStepIndex, setHarvestTourStepIndex] = useState(0);
  const [harvestTourSteps, setHarvestTourSteps] = useState<ReturnType<typeof getHarvestCollectionsStarterSteps>>([]);
  const harvestTourAutoRunDoneRef = useRef(false);

  const canViewCollections = canKey('harvest_collections.view') || can('harvest', 'view');
  const canCreateCollection =
    canKey('harvest_collections.create') || can('harvest', 'create') || can('harvest', 'recordIntake');
  const canManageIntake =
    canKey('harvest_collections.edit') ||
    can('harvest', 'recordIntake') ||
    can('harvest', 'edit') ||
    can('harvest', 'create');
  const canDeleteIntakeEntry =
    canKey('harvest_collections.delete') || can('harvest', 'edit') || canManageIntake;
  const canPayPickers = canKey('harvest_collections.pay') || can('harvest', 'payPickers');
  const canViewBuyerSection = can('harvest', 'viewBuyerSection');
  const canCloseHarvest = can('harvest', 'close');
  const canViewFinancials = canKey('harvest_collections.financials') || can('harvest', 'viewFinancials');
  const canViewPaymentAmounts = canViewFinancials;
  const canViewPickerEntries = canKey('harvest_collections.view_picker_entries');
  const canRenameCollection = canKey('harvest_collections.edit') || canManageIntake;
  const canTransferCollection = isAdminUser && (canKey('harvest_collections.edit') || can('harvest', 'edit') || canManageIntake);
  const canDeleteCollection = canKey('harvest_collections.delete') || can('harvest', 'edit');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedPickerSearch(pickerSearch);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [pickerSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuickPaySearch(quickPaySearch);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [quickPaySearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedViewPickersSearch(viewPickersSearch);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [viewPickersSearch]);

  useEffect(() => {
    if (!isAdminUser && viewPickersLayout !== 'list') {
      setViewPickersLayout('list');
    }
  }, [isAdminUser, viewPickersLayout]);

  if (import.meta.env.DEV && user) {
    logger.log('[HarvestCollections] edit/delete visibility', {
      canManageIntake,
      canDeleteIntakeEntry,
      byKeyEdit: canKey('harvest_collections.edit'),
      byKeyDelete: canKey('harvest_collections.delete'),
      byLegacyEdit: can('harvest', 'edit'),
      byLegacyRecordIntake: can('harvest', 'recordIntake'),
    });
  }

  const detailModes = useMemo<ViewMode[]>(() => {
    const modes: ViewMode[] = [];
    if (isAdminUser) {
      if (canViewPickerEntries) modes.push('view_pickers');
      if (canViewBuyerSection) modes.push('buyer');
      if (canManageIntake) modes.push('intake');
      if (canPayPickers) modes.push('pay');
      return modes;
    }
    if (canManageIntake) modes.push('intake');
    if (canPayPickers) modes.push('pay');
    if (canViewBuyerSection) modes.push('buyer');
    if (canViewPickerEntries) modes.push('view_pickers');
    return modes;
  }, [isAdminUser, canViewPickerEntries, canManageIntake, canPayPickers, canViewBuyerSection]);
  
  const defaultDetailMode: ViewMode = detailModes[0] ?? 'list';

  const companyId = user?.companyId ?? null;
  const effectiveProjectId = effectiveProject?.id ?? null;

  if (import.meta.env.DEV && user) {
    logger.log('[HarvestCollections] staff permissions', {
      uid: user.id,
      canViewCollections,
      canCreateCollection,
      canManageIntake,
      canPayPickers,
      canViewBuyerSection,
      canViewFinancials,
      projectAccessIds,
      collectionCardFields: {
        date: true,
        totalKg: true,
        pickers: true,
        totalPay: canViewPaymentAmounts,
      },
      detailSections: {
        statsTotalsCard: true,
        statsFinancialCards: canViewPaymentAmounts,
        buyerSaleCard: canViewFinancials,
        walletSection: canViewFinancials,
      },
      pickerEntryFields: {
        weights: true,
        trips: true,
        perEntryAmount: canViewFinancials,
        balances: canViewFinancials,
      },
    });
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    logger.log('[Reload Debug] mount');
    return () => {
      logger.log('[Reload Debug] unmount');
    };
  }, []);

  const reloadDebugPrevRef = useRef<{ viewMode: ViewMode; quickMode: boolean; selectedCollectionId: string | null; companyId: string | null; effectiveProjectId: string | null } | null>(null);
  
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const next = {
      viewMode,
      quickMode,
      selectedCollectionId,
      companyId,
      effectiveProjectId,
    };
    const prev = reloadDebugPrevRef.current;
    const changed = !prev || prev.viewMode !== next.viewMode || prev.quickMode !== next.quickMode || prev.selectedCollectionId !== next.selectedCollectionId || prev.companyId !== next.companyId || prev.effectiveProjectId !== next.effectiveProjectId;
    reloadDebugPrevRef.current = next;
    if (changed) {
      logger.log('[Reload Debug] state changed', next);
    }
  }, [viewMode, quickMode, selectedCollectionId, companyId, effectiveProjectId]);

  const handleSaveCash = async () => {
    if (!canViewFinancials) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to update the harvest wallet.',
        variant: 'destructive',
      });
      return;
    }
    if (!cashDialogCollection || !cashAmount.trim() || !companyId) return;
    const amount = Number(cashAmount || '0');
    if (amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Cash received must be greater than 0.', variant: 'destructive' });
      return;
    }
    try {
      setCashDialogSaving(true);
      const resolvedSource =
        cashSource === 'custom' && cashSourceCustom.trim().length > 0
          ? cashSourceCustom.trim()
          : cashSource;

      await registerHarvestCash({
        collectionId: cashDialogCollection.id,
        projectId: cashDialogCollection.projectId,
        companyId: cashDialogCollection.companyId,
        cropType: String(cashDialogCollection.cropType),
        cashReceived: amount,
        source: resolvedSource,
        receivedBy: user?.name || user?.email || user?.id || 'unknown',
      });
      queryClient.invalidateQueries({ queryKey: ['projectWalletTotals', companyId, cashDialogCollection.projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectWalletLedger', companyId, cashDialogCollection.projectId] });
      queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardFinancialTotals', companyId] });
      queryClient.invalidateQueries({ queryKey: ['harvestSalesTotals', companyId, effectiveProjectId] });
      setCashDialogCollection(null);
      setCashAmount('');
      toast({ title: 'Cash registered' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to register cash', variant: 'destructive' });
    } finally {
      setCashDialogSaving(false);
    }
  };

  const handleRenameDialogOpenChange = (open: boolean) => {
    setRenameCollectionDialogOpen(open);
    if (!open) setRenameTargetCollection(null);
  };

  const handleTransferDialogOpenChange = (open: boolean) => {
    setTransferCollectionDialogOpen(open);
    if (!open) setTransferTargetCollection(null);
  };

  const handleRenameCollectionSave = async (nextName: string) => {
    if (!renameTargetCollection || !companyId) return;
    if (!canRenameCollection) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to rename this harvest collection.',
        variant: 'destructive',
      });
      throw new Error('Permission denied');
    }

    try {
      const result = await renameHarvestCollection({
        collectionId: renameTargetCollection.id,
        companyId,
        oldName: renameTargetCollection.name ?? null,
        newName: nextName,
        actorUserId: user?.id ?? null,
        expectedRowVersion: renameTargetCollection.rowVersion ?? 1,
      });

      queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] });

      if (result.auditLogged) {
        toast({ title: 'Collection renamed' });
      } else {
        toast({
          title: 'Collection renamed',
          description: 'Name updated, but audit log could not be saved.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Rename failed',
        description: isConcurrentUpdateConflict(e)
          ? CONCURRENT_UPDATE_MESSAGE
          : (e?.message ?? 'Could not rename collection.'),
        variant: 'destructive',
      });
      throw e;
    }
  };

  const handleDeleteCollectionConfirm = async () => {
    if (!deleteCollectionConfirm || !companyId) return;
    if (!canDeleteCollection) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to delete this harvest collection.',
        variant: 'destructive',
      });
      return;
    }

    setDeletingCollection(true);
    try {
      await deleteHarvestCollection({
        collectionId: deleteCollectionConfirm.id,
        companyId,
        expectedRowVersion: deleteCollectionConfirm.rowVersion ?? 1,
      });
      // Refresh list + clear selection if needed.
      queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] });
      if (selectedCollectionId === deleteCollectionConfirm.id) setSelectedCollectionId(null);
      toast({ title: 'Collection deleted' });
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: isConcurrentUpdateConflict(e)
          ? CONCURRENT_UPDATE_MESSAGE
          : (e?.message ?? 'Could not delete collection.'),
        variant: 'destructive',
      });
    } finally {
      setDeletingCollection(false);
      setDeleteCollectionConfirm(null);
    }
  };

  const handleTransferCollectionSubmit = async (params: {
    targetProjectId: string;
    reason: string | null;
  }) => {
    if (!transferTargetCollection || !companyId) return;
    if (!canTransferCollection) {
      toast({
        title: 'Access denied',
        description: 'You do not have access to transfer this harvest collection.',
        variant: 'destructive',
      });
      return;
    }
    if (params.targetProjectId === transferTargetCollection.projectId) {
      throw new Error('Please choose a different project.');
    }
    const validTarget = companyProjects.some(
      (project) => project.companyId === companyId &&
        project.id === params.targetProjectId &&
        project.id !== transferTargetCollection.projectId &&
        !isProjectClosed(project),
    );
    if (!validTarget) {
      throw new Error('Target project must belong to the same company.');
    }

    await transferCollectionToProject({
      companyId,
      collectionId: transferTargetCollection.id,
      targetProjectId: params.targetProjectId,
      reason: params.reason,
      transferredBy: user?.id ?? null,
    });

    queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
    queryClient.invalidateQueries({ queryKey: ['harvestCollectionTransfers', companyId, transferTargetCollection.id] });
    queryClient.invalidateQueries({ queryKey: ['harvestCollectionsFinancialTotals'] });
    queryClient.invalidateQueries({ queryKey: ['projectWalletTotals'] });
    queryClient.invalidateQueries({ queryKey: ['projectWalletLedger'] });
    queryClient.invalidateQueries({ queryKey: ['harvestSalesTotals'] });

    toast({
      title: 'Collection transferred',
      description: 'The collection has been moved to the selected project.',
    });
    setTransferCollectionDialogOpen(false);
    setTransferTargetCollection(null);
  };

  useEffect(() => {
    setPaySelectedIds(new Set());
    setShowPaidAndProfit(false);
  }, [selectedCollectionId]);

  useEffect(() => {
    if (!selectedCollectionId) return;
    if (viewMode === 'list' && detailModes.length > 0) {
      setViewMode(detailModes[0]);
      return;
    }
    if (viewMode !== 'list' && !detailModes.includes(viewMode)) {
      setViewMode(detailModes[0] ?? 'list');
    }
  }, [selectedCollectionId, viewMode, detailModes]);

  const { data: collectionsRaw = [], isLoading: loadingCollections } = useQuery({
    queryKey: ['harvestCollections', companyId, effectiveProjectId],
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await HarvestService.pullRemote(companyId, effectiveProjectId ?? null);
        } catch {
          // ignore
        }
      }
      return HarvestService.listHarvestCollections(companyId, effectiveProjectId ?? null);
    },
    enabled: !!companyId,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const collectionIds = useMemo(() => collectionsRaw.map((c) => c.id), [collectionsRaw]);

  const { data: pickersRaw = [] } = useQuery({
    queryKey: ['harvestPickers', companyId, collectionIds],
    queryFn: () => listPickersByCollectionIds(collectionIds),
    enabled: collectionIds.length > 0,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const { data: intakeRaw = [] } = useQuery({
    queryKey: ['pickerIntake', companyId, collectionIds],
    queryFn: () => listPickerIntakeByCollectionIds(collectionIds),
    enabled: collectionIds.length > 0,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const { data: paymentsRaw = [] } = useQuery({
    queryKey: ['pickerPayments', companyId, collectionIds],
    queryFn: () => listPickerPaymentsByCollectionIds(collectionIds),
    enabled: collectionIds.length > 0,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const allCollections = useMemo(() => {
    const priceByCollection = new Map<string, number>();
    collectionsRaw.forEach((c) => priceByCollection.set(c.id, c.pricePerKgPicker ?? 0));
    const kgByCollectionPicker = new Map<string, number>();
    intakeRaw.forEach((e) => {
      const key = `${e.collectionId}::${e.pickerId}`;
      const cur = kgByCollectionPicker.get(key) ?? 0;
      kgByCollectionPicker.set(key, cur + (e.weightKg ?? 0));
    });
    return collectionsRaw.map((c) => {
      let totalHarvestKg = 0;
      let totalPickerCost = 0;
      kgByCollectionPicker.forEach((kg, key) => {
        if (key.startsWith(`${c.id}::`)) {
          totalHarvestKg += kg;
          totalPickerCost += Math.round(kg * (priceByCollection.get(c.id) ?? 0));
        }
      });
      return { ...c, totalHarvestKg, totalPickerCost } as HarvestCollection;
    });
  }, [collectionsRaw, intakeRaw]);

  const allPickers = useMemo((): HarvestPicker[] => {
    const priceByCollection = new Map<string, number>();
    collectionsRaw.forEach((c) => priceByCollection.set(c.id, c.pricePerKgPicker ?? 0));
    const kgByPicker = new Map<string, number>();
    intakeRaw.forEach((e) => {
      const cur = kgByPicker.get(e.pickerId) ?? 0;
      kgByPicker.set(e.pickerId, cur + (e.weightKg ?? 0));
    });
    const paidByPicker = new Map<string, number>();
    paymentsRaw.forEach((p) => {
      const cur = paidByPicker.get(p.picker_id) ?? 0;
      paidByPicker.set(p.picker_id, cur + Number(p.amount_paid));
    });
    return pickersRaw.map((p) => {
      const totalKg = kgByPicker.get(p.id) ?? 0;
      const pricePerKg = priceByCollection.get(p.collection_id) ?? 0;
      const totalPay = Math.round(totalKg * pricePerKg);
      const paid = paidByPicker.get(p.id) ?? 0;
      /**
       * Picker is "Paid" only when:
       * 1. They have a positive payable amount (totalPay > 0), AND
       * 2. Their paid amount covers the total (paid >= totalPay).
       * 
       * Pickers with zero kg or zero totalPay are NOT marked as paid - they simply have no payment due yet.
       * This prevents false "PAID" badges on new pickers before weights are added.
       */
      const isPaid = totalPay > 0 && paid >= totalPay;
      return mapPicker(p, totalKg, totalPay, isPaid) as HarvestPicker;
    });
  }, [pickersRaw, intakeRaw, paymentsRaw, collectionsRaw]);

  const allWeighEntries = useMemo((): PickerWeighEntry[] => {
    return intakeRaw.map((e) => ({
      id: e.id,
      companyId: e.companyId,
      pickerId: e.pickerId,
      collectionId: e.collectionId,
      weightKg: e.weightKg,
      tripNumber: e.tripNumber ?? 0,
      recordedAt: e.recordedAt,
    }));
  }, [intakeRaw]);

  const isFrenchBeansProject =
    String(effectiveProject?.cropType ?? '').toLowerCase().replace('_', '-') === 'french-beans';

  const { data: collectionsFinancialTotals } = useQuery({
    queryKey: ['harvestCollectionsFinancialTotals', companyId ?? '', effectiveProjectId ?? ''],
    queryFn: () => getCompanyCollectionFinancialsAggregate(companyId ?? '', effectiveProjectId ?? null),
    enabled: Boolean(companyId && isFrenchBeansProject),
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const { data: financeWalletTotals } = useQuery({
    queryKey: ['projectWalletTotals', companyId ?? '', effectiveProjectId ?? ''],
    queryFn: () => getFinanceWalletTotals(effectiveProjectId!, companyId!),
    enabled: !!companyId && !!effectiveProjectId && isFrenchBeansProject,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const { data: supabaseLedgerEntries } = useQuery({
    queryKey: ['projectWalletLedger', companyId ?? '', effectiveProjectId ?? ''],
    queryFn: () => getWalletLedgerEntriesSupabase(effectiveProjectId!, companyId!),
    enabled: !!companyId && !!effectiveProjectId && isFrenchBeansProject,
    staleTime: 15000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const walletEntriesForSummary = useMemo(
    () => (isFrenchBeansProject ? (supabaseLedgerEntries ?? []) : walletLedgerEntries),
    [isFrenchBeansProject, supabaseLedgerEntries, walletLedgerEntries]
  );

  useEffect(() => {
    if (!companyId || !effectiveProject?.id || isFrenchBeansProject) return;
    return subscribeWalletLedger(effectiveProject.id, companyId, (entries) => {
      setWalletLedgerEntries(entries);
    });
  }, [companyId, effectiveProject?.id, isFrenchBeansProject]);

  const walletSummary = useMemo(() => {
    if (isFrenchBeansProject && financeWalletTotals) {
      return {
        cashReceivedTotal: financeWalletTotals.totalCredits,
        cashPaidOutTotal: financeWalletTotals.totalDebits,
        currentBalance: financeWalletTotals.balance,
      };
    }
    return computeWalletSummary(walletEntriesForSummary);
  }, [isFrenchBeansProject, financeWalletTotals, walletEntriesForSummary]);

  const collections = useMemo(() => {
    if (!effectiveProject) return allCollections;
    const filtered = allCollections.filter((c) => c.projectId === effectiveProject.id);
    const toCreatedMs = (c: HarvestCollection): number => {
      const created = (c as { createdAt?: unknown }).createdAt;
      const createdAt = created != null ? toDate(created) : null;
      if (createdAt) return createdAt.getTime();
      const harvestAt = c.harvestDate != null ? toDate(c.harvestDate) : null;
      return harvestAt ? harvestAt.getTime() : 0;
    };
    // One global order: newest created first across both old and auto-named cards.
    return [...filtered].sort((a, b) => {
      const timeDiff = toCreatedMs(b) - toCreatedMs(a);
      if (timeDiff !== 0) return timeDiff;
      return String(b.id ?? '').localeCompare(String(a.id ?? ''));
    });
  }, [allCollections, effectiveProject]);

  useEffect(() => {
    setSelectedCollectionId(null);
    setViewMode('list');
  }, [effectiveProject?.id]);

  // New collection modal suggestion: use the same project-scoped list as visible cards.
  // This keeps preview aligned with UI state and includes all statuses.
  useEffect(() => {
    if (!newCollectionOpen) return;
    if (!effectiveProject) return;

    const nextSequence = (collections.length || 0) + 1;
    const suggestion = buildHarvestCollectionAutoName({
      baseName: HARVEST_COLLECTION_BASE_NAME,
      sequenceNumber: nextSequence,
    });
    setAutoSuggestedCollectionName(suggestion);
    // Keep reactive to list updates while user has not manually edited the suggested value.
    if (!newCollectionNameDirtyRef.current) {
      setNewCollectionName(suggestion);
    }
  }, [newCollectionOpen, effectiveProject, collections.length]);

  const collectionsSummary = useMemo(() => {
    if (isFrenchBeansProject && collectionsFinancialTotals) {
      const totalKg = Number(collectionsFinancialTotals.totalHarvestKg ?? 0) || 0;
      const totalRevenue = Number(collectionsFinancialTotals.totalRevenue ?? collectionsFinancialTotals.totalSales ?? 0) || 0;

      if (import.meta.env.DEV) {
        logger.log('[HarvestCollections] summary (Supabase aggregate)', {
          companyId,
          projectId: effectiveProjectId,
          totalKg,
          totalRevenue,
          rawTotals: collectionsFinancialTotals,
        });
      }

      return {
        totalKg,
        totalRevenue,
        totalCollections: collectionsFinancialTotals.collections.length,
      };
    }

    const onlyFrench = collections.filter(
      (c) => String(c.cropType).toLowerCase().replace('_', '-') === 'french-beans'
    );
    const totalKg = onlyFrench.reduce((sum, c) => sum + Number(c.totalHarvestKg ?? 0), 0);
    const totalRevenue = onlyFrench.reduce((sum, c) => {
      const qty = Number(c.totalHarvestKg ?? 0) || 0;
      const buyerPrice = Number((c as any).pricePerKgBuyer ?? 0) || 0;
      return sum + qty * buyerPrice;
    }, 0);

    if (import.meta.env.DEV) {
      const debugRows = onlyFrench.map((c) => {
        const qty = Number(c.totalHarvestKg ?? 0) || 0;
        const buyerPrice = Number((c as any).pricePerKgBuyer ?? 0) || 0;
        const revenue = qty * buyerPrice;
        return {
          id: c.id,
          harvestDate: c.harvestDate,
          totalHarvestKg: qty,
          pricePerKgBuyer: buyerPrice,
          revenue,
        };
      });
      logger.log('[HarvestCollections] summary (fallback from collections)', {
        companyId,
        projectId: effectiveProjectId,
        totalKg,
        totalRevenue,
        rows: debugRows,
      });
    }

    return {
      totalKg,
      totalRevenue,
      totalCollections: onlyFrench.length,
    };
  }, [collections, isFrenchBeansProject, collectionsFinancialTotals, companyId, effectiveProjectId]);

  /** Pending = buyer not yet marked as paid (harvest not completed). */
  const pendingCollections = useMemo(
    () => collections.filter((c) => c.status !== 'closed'),
    [collections]
  );
  /** Closed = buyer paid, harvest completed. */
  const closedCollections = useMemo(
    () => collections.filter((c) => c.status === 'closed'),
    [collections]
  );

  const pickersCountByCollectionId = useMemo(() => {
    const map: Record<string, number> = {};
    (pickersRaw ?? []).forEach((p) => {
      const cid = String(p.collection_id ?? '');
      if (cid) map[cid] = (map[cid] ?? 0) + 1;
    });
    return map;
  }, [pickersRaw]);

  const collectionTotalsById = useMemo(() => {
    const priceByCollection = new Map<string, number>();
    allCollections.forEach((c) => {
      priceByCollection.set(c.id, Number(c.pricePerKgPicker ?? 0));
    });

    const pickerKgByCollectionPicker = new Map<string, number>();
    allWeighEntries.forEach((entry) => {
      const collectionId = String(entry.collectionId ?? '');
      const pickerId = String(entry.pickerId ?? '');
      const kg = Number(entry.weightKg ?? 0);
      if (!collectionId || !pickerId || !Number.isFinite(kg) || kg <= 0) return;
      const key = `${collectionId}::${pickerId}`;
      pickerKgByCollectionPicker.set(key, (pickerKgByCollectionPicker.get(key) ?? 0) + kg);
    });

    const totals: Record<string, { totalHarvestKg: number; totalPickerCost: number }> = {};
    pickerKgByCollectionPicker.forEach((kg, key) => {
      const separator = key.indexOf('::');
      const collectionId = separator === -1 ? key : key.slice(0, separator);
      const pricePerKg = priceByCollection.get(collectionId) ?? 0;
      if (!totals[collectionId]) {
        totals[collectionId] = { totalHarvestKg: 0, totalPickerCost: 0 };
      }
      totals[collectionId].totalHarvestKg += kg;
      totals[collectionId].totalPickerCost += Math.round(kg * pricePerKg);
    });

    return totals;
  }, [allCollections, allWeighEntries]);

  const backfillSyncedRef = React.useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const toSync = collections.filter(
      (c) =>
        String(c.cropType).toLowerCase().replace('_', '-') === 'french-beans' &&
        (c.status === 'closed' || !!c.buyerPaidAt) &&
        (c.totalRevenue ?? 0) > 0 &&
        (c.totalHarvestKg ?? 0) > 0 &&
        !c.harvestId &&
        !backfillSyncedRef.current.has(c.id)
    );
    if (toSync.length === 0) return;
    toSync.forEach((c) => backfillSyncedRef.current.add(c.id));
    (async () => {
      let synced = 0;
      for (const c of toSync) {
        try {
          const ok = await syncClosedCollectionToHarvestSale(c.id);
          if (ok) synced++;
        } catch {
          backfillSyncedRef.current.delete(c.id);
        }
      }
      if (synced > 0) {
        queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] });
        queryClient.invalidateQueries({ queryKey: ['harvests'] });
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        toast({ title: 'Synced', description: `${synced} closed collection(s) added to Harvest & Sales.` });
      }
    })();
  }, [collections, queryClient, toast, companyId, effectiveProjectId]);

  const selectedCollection = useMemo(
    () => allCollections.find((c) => c.id === selectedCollectionId) ?? null,
    [allCollections, selectedCollectionId]
  );

  const companyProjectNameById = useMemo(() => {
    const map = new Map<string, string>();
    companyProjects.forEach((project) => map.set(project.id, project.name));
    return map;
  }, [companyProjects]);

  const transferTargetProjects = useMemo(() => {
    if (!companyId) return [];
    return companyProjects
      .filter((project) => project.companyId === companyId && !isProjectClosed(project))
      .map((project) => ({ id: project.id, name: project.name }));
  }, [companyProjects, companyId]);

  useEffect(() => {
    if (!selectedCollection) return;
    const fromDb = selectedCollection.pricePerKgBuyer;
    if (fromDb != null && Number(fromDb) > 0) {
      setBuyerPricePerKg(String(fromDb));
    }
  }, [selectedCollection]);

  const isFrenchBeansCollection = useMemo(() => {
    const ct = (selectedCollection?.cropType as string | undefined)?.toLowerCase().replace('_', '-');
    return ct === 'french-beans';
  }, [selectedCollection?.cropType]);

  const hasFrenchBeansCollections = useMemo(
    () => collections.some((c) => String(c.cropType).toLowerCase().replace('_', '-') === 'french-beans'),
    [collections]
  );

  const pickersForCollection = useMemo(() => {
    if (!selectedCollectionId) return [];
    return allPickers
      .filter((p) => p.collectionId === selectedCollectionId)
      .sort((a, b) => (a.pickerNumber ?? 0) - (b.pickerNumber ?? 0));
  }, [allPickers, selectedCollectionId]);

  const weighEntriesForCollection = useMemo(() => {
    if (!selectedCollectionId) return [];
    return allWeighEntries.filter((e) => e.collectionId === selectedCollectionId);
  }, [allWeighEntries, selectedCollectionId]);

  const quickIntakeRecentEntries = useMemo(() => {
    const entries = [...weighEntriesForCollection].sort((a, b) => {
      const at = (a.recordedAt != null ? toDate(a.recordedAt)?.getTime() : 0) ?? 0;
      const bt = (b.recordedAt != null ? toDate(b.recordedAt)?.getTime() : 0) ?? 0;
      return bt - at;
    });
    return entries.map((e, idx) => {
      const picker = pickersForCollection.find((p) => p.id === e.pickerId);
      return {
        id: e.id ?? `intake-${idx}`,
        pickerId: e.pickerId,
        collectionId: e.collectionId,
        pickerNumber: picker?.pickerNumber ?? '?',
        pickerName: picker?.pickerName ?? '—',
        tripNumber: e.tripNumber ?? 0,
        kg: Number(e.weightKg ?? 0),
        recordedAt: e.recordedAt,
      };
    });
  }, [weighEntriesForCollection, pickersForCollection]);

  /** Quick Intake: recent entries grouped by picker (picker_id). One row per picker when collapsed; expand to see child entries. */
  const quickIntakeEntriesByPicker = useMemo(() => {
    const byPicker = new Map<string, { pickerId: string; pickerNumber: string | number; pickerName: string; entries: typeof quickIntakeRecentEntries }>();
    for (const entry of quickIntakeRecentEntries) {
      const key = entry.pickerId;
      if (!byPicker.has(key)) {
        byPicker.set(key, {
          pickerId: entry.pickerId,
          pickerNumber: entry.pickerNumber,
          pickerName: entry.pickerName,
          entries: [],
        });
      }
      byPicker.get(key)!.entries.push(entry);
    }
    const groups = Array.from(byPicker.values()).map((g) => {
      const entriesSorted = [...g.entries].sort((a, b) => {
        const at = (a.recordedAt != null ? toDate(a.recordedAt)?.getTime() : 0) ?? 0;
        const bt = (b.recordedAt != null ? toDate(b.recordedAt)?.getTime() : 0) ?? 0;
        return bt - at;
      });
      const totalKg = entriesSorted.reduce((sum, e) => sum + e.kg, 0);
      const latestAt = entriesSorted[0]?.recordedAt != null ? toDate(entriesSorted[0].recordedAt)?.getTime() ?? 0 : 0;
      return { ...g, entries: entriesSorted, totalKg, latestAt };
    });
    groups.sort((a, b) => b.latestAt - a.latestAt);
    return groups;
  }, [quickIntakeRecentEntries]);

  const uniqueEnteredPickersCount = useMemo(() => {
    const ids = new Set(weighEntriesForCollection.map((e) => e.pickerId));
    return ids.size;
  }, [weighEntriesForCollection]);

  const remainingPickersCount = useMemo(() => {
    return Math.max(0, pickersForCollection.length - uniqueEnteredPickersCount);
  }, [pickersForCollection.length, uniqueEnteredPickersCount]);

  const paymentsForCollection = useMemo(() => {
    if (!selectedCollectionId) return [];
    return (paymentsRaw ?? []).filter((p) => p.collection_id === selectedCollectionId);
  }, [paymentsRaw, selectedCollectionId]);

  const collectionFinancials = useMemo(() => {
    if (!selectedCollection || !selectedCollectionId) {
      return {
        totalHarvestQty: 0,
        pickerPricePerUnit: 20,
        buyerPricePerUnit: 0,
        totalPickerDue: 0,
        totalPaidOut: 0,
        pickerBalance: 0,
        revenue: 0,
        profit: 0,
      };
    }
    const intakeEntries = weighEntriesForCollection.map((e) => ({ quantity: e.weightKg, weightKg: e.weightKg }));
    const paymentEntries = paymentsForCollection.map((p) => ({ amount_paid: p.amount_paid }));
    return computeCollectionFinancials({
      collection: {
        picker_price_per_unit: selectedCollection.pricePerKgPicker,
        buyer_price_per_unit: selectedCollection.pricePerKgBuyer ?? null,
      },
      intakeEntries,
      paymentEntries,
    });
  }, [selectedCollection, selectedCollectionId, weighEntriesForCollection, paymentsForCollection]);

  const isCollectionClosed = useMemo(
    () =>
      selectedCollection?.status === 'closed' ||
      (selectedCollection as { is_closed?: boolean } | undefined)?.is_closed === true,
    [selectedCollection]
  );
  
  const showBuyerSale = Boolean(canViewFinancials && isCollectionClosed);

  const harvestTourContext = useMemo<HarvestTourContext>(() => {
    const visibleTabs: ('intake' | 'pay' | 'buyer')[] = [];
    if (canManageIntake) visibleTabs.push('intake');
    if (canPayPickers) visibleTabs.push('pay');
    if (canViewBuyerSection) visibleTabs.push('buyer');
    return {
      hasProject: Boolean(effectiveProject),
      isFrenchBeansProject: String(effectiveProject?.cropType ?? '').toLowerCase() === 'french-beans',
      hasSelectedCollection: Boolean(selectedCollectionId && selectedCollection),
      hasCollections: collections.length > 0,
      canCreateCollection,
      canManageIntake,
      canPayPickers,
      canViewBuyerSection,
      canCloseHarvest,
      canViewFinancials,
      quickMode,
      collectionStatus: selectedCollection
        ? (isCollectionClosed ? 'closed' : 'open')
        : null,
      isOfflineOrHasPendingSync: !isOnline || hasPendingWrites,
      visibleTabs,
    };
  }, [
    effectiveProject,
    selectedCollectionId,
    selectedCollection,
    collections.length,
    canCreateCollection,
    canManageIntake,
    canPayPickers,
    canViewBuyerSection,
    canCloseHarvest,
    canViewFinancials,
    quickMode,
    isCollectionClosed,
    isOnline,
    hasPendingWrites,
  ]);

  const startHarvestTour = useCallback(() => {
    const raw = getHarvestCollectionsStarterSteps(harvestTourContext);
    const available = filterTourStepsByAvailability(raw);
    if (available.length === 0) return;
    setHarvestTourSteps(available);
    setHarvestTourStepIndex(0);
    setHarvestTourRun(true);
  }, [harvestTourContext]);

  const handleHarvestTourCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index = 0, status, type } = data;
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setCompletedHarvestTour(user?.id);
        setDismissedHarvestTour(user?.id);
        setHarvestTourRun(false);
        setHarvestTourSteps([]);
        setHarvestTourStepIndex(0);
        return;
      }
      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        setHarvestTourSteps((prev) => {
          const next = filterTourStepsByAvailability(
            getHarvestCollectionsStarterSteps(harvestTourContext)
          );
          if (next.length === 0) {
            setHarvestTourRun(false);
            setHarvestTourStepIndex(0);
            return [];
          }
          const delta = action === ACTIONS.PREV ? -1 : 1;
          const nextIndex = index + delta;
          if (nextIndex < 0) {
            setHarvestTourStepIndex(0);
            return next;
          }
          if (nextIndex >= next.length) {
            setCompletedHarvestTour(user?.id);
            setDismissedHarvestTour(user?.id);
            setHarvestTourRun(false);
            setHarvestTourStepIndex(0);
            return [];
          }
          setHarvestTourStepIndex(nextIndex);
          return next;
        });
      }
    },
    [harvestTourContext, user?.id],
  );

  useEffect(() => {
    if (!effectiveProject || harvestTourAutoRunDoneRef.current) return;
    if (hasCompletedHarvestTour(user?.id) || hasDismissedHarvestTour(user?.id)) {
      harvestTourAutoRunDoneRef.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      harvestTourAutoRunDoneRef.current = true;
      const raw = getHarvestCollectionsStarterSteps(harvestTourContext);
      const available = filterTourStepsByAvailability(raw);
      if (available.length > 0) {
        setHarvestTourSteps(available);
        setHarvestTourStepIndex(0);
        setHarvestTourRun(true);
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [effectiveProject, harvestTourContext, user?.id]);

  const pickerTotalsById = useMemo(() => {
    const totals: Record<string, { totalKg: number; totalPay: number }> = {};
    const pricePerKgPicker = Number(selectedCollection?.pricePerKgPicker ?? 0);

    weighEntriesForCollection.forEach((entry) => {
      const pickerId = String(entry.pickerId ?? '');
      const kg = Number(entry.weightKg ?? 0);
      if (!pickerId || !Number.isFinite(kg) || kg <= 0) return;

      if (!totals[pickerId]) {
        totals[pickerId] = { totalKg: 0, totalPay: 0 };
      }
      totals[pickerId].totalKg += kg;
    });

    Object.keys(totals).forEach((pickerId) => {
      totals[pickerId].totalPay = Math.round(totals[pickerId].totalKg * pricePerKgPicker);
    });

    return totals;
  }, [weighEntriesForCollection, selectedCollection?.pricePerKgPicker]);

  /** Avg Kg per Picker: totalKg and active picker count for the selected collection. Active = total collected weight > 0. */
  const avgKgPerPickerStats = useMemo(() => {
    const totalKg = Object.values(pickerTotalsById).reduce((sum, t) => sum + t.totalKg, 0);
    const activePickers = Object.values(pickerTotalsById).filter((t) => t.totalKg > 0).length;
    const avgKgPerPicker =
      activePickers > 0 ? Math.round((totalKg / activePickers) * 10) / 10 : 0;
    return { totalKg, activePickers, avgKgPerPicker };
  }, [pickerTotalsById]);

  const getPickerTotals = useCallback((pickerId: string): { totalKg: number; totalPay: number } => {
    return pickerTotalsById[pickerId] ?? { totalKg: 0, totalPay: 0 };
  }, [pickerTotalsById]);

  const paidByPickerId = useMemo(() => {
    const map: Record<string, number> = {};
    paymentsForCollection.forEach((entry) => {
      const id = String(entry.picker_id ?? '');
      if (!id) return;
      map[id] = (map[id] ?? 0) + Number(entry.amount_paid ?? 0);
    });
    return map;
  }, [paymentsForCollection]);

  useEffect(() => {
    if (Object.keys(quickPayLocalPaidByPickerId).length === 0) return;
    setQuickPayLocalPaidByPickerId({});
  }, [paymentsForCollection, quickPayLocalPaidByPickerId]);

  type QuickPayQueueItem = {
    pickerId: string;
    pickerNumber: number;
    pickerName: string;
    totalKg: number;
    totalDue: number;
    totalPaid: number;
    balance: number;
  };

  const quickPayQueue = useMemo<QuickPayQueueItem[]>(() => {
    const items: QuickPayQueueItem[] = [];
    pickersForCollection.forEach((p) => {
      const totals = getPickerTotals(p.id);
      const paid = (paidByPickerId[p.id] ?? 0) + (quickPayLocalPaidByPickerId[p.id] ?? 0);
      const balance = Math.max(0, totals.totalPay - paid);
      if (balance <= 0) return;
      items.push({
        pickerId: p.id,
        pickerNumber: Number(p.pickerNumber ?? 0),
        pickerName: String(p.pickerName ?? ''),
        totalKg: totals.totalKg,
        totalDue: totals.totalPay,
        totalPaid: paid,
        balance,
      });
    });
    items.sort((a, b) => a.pickerNumber - b.pickerNumber);
    return items;
  }, [pickersForCollection, getPickerTotals, paidByPickerId, quickPayLocalPaidByPickerId]);

  const quickPayQueueFiltered = useMemo(() => {
    const q = quickPayQueue;
    const s = (debouncedQuickPaySearch ?? '').trim().toLowerCase();
    if (!s) return q;
    return q.filter(
      (item) =>
        String(item.pickerNumber).toLowerCase().includes(s) ||
        item.pickerName.toLowerCase().includes(s)
    );
  }, [quickPayQueue, debouncedQuickPaySearch]);

  /** Pickers matching search (all pickers in collection, for immediate card display when searching by number/name). */
  const quickPaySearchMatchingPickers = useMemo(() => {
    const s = (debouncedQuickPaySearch ?? '').trim().toLowerCase();
    if (!s) return [];
    return pickersForCollection.filter(
      (p) =>
        String(p.pickerNumber ?? '').toLowerCase().includes(s) ||
        String(p.pickerName ?? '').toLowerCase().includes(s)
    );
  }, [debouncedQuickPaySearch, pickersForCollection]);

  /** Picker to show in Quick Pay card: from queue when no search, else first match from all pickers (including paid). */
  const quickPayDisplayPickerId = useMemo(() => {
    if (!(quickMode && viewMode === 'pay')) return null;
    const s = (quickPaySearch ?? '').trim();
    if (s && quickPaySearchMatchingPickers.length > 0) {
      return quickPaySearchMatchingPickers[0].id;
    }
    const first = quickPayQueueFiltered[0];
    return first?.pickerId ?? null;
  }, [quickMode, viewMode, quickPaySearch, quickPaySearchMatchingPickers, quickPayQueueFiltered]);

  useEffect(() => {
    if (!(quickMode && viewMode === 'pay')) return;
    logger.log('[Quick Pay Queue]', quickPayQueue);
  }, [quickPayQueue, quickMode, viewMode]);

  useEffect(() => {
    if (!(quickMode && viewMode === 'pay')) return;
    if (quickPayPartialOpen) return;
    if (selectedCollection?.status === 'closed') return;
    if (skipJustClickedRef.current) {
      skipJustClickedRef.current = false;
      return;
    }
    const displayId = quickPayDisplayPickerId;
    if (quickPayPickerId !== displayId) {
      setQuickPayPickerId(displayId);
    }
  }, [quickMode, viewMode, quickPayDisplayPickerId, quickPayPickerId, quickPayPartialOpen, selectedCollection?.status]);

  useEffect(() => {
    if (!(quickMode && viewMode === 'pay') || !quickPayPickerId) return;
    const picker = pickersForCollection.find((p) => p.id === quickPayPickerId);
    const queueRow = quickPayQueue.find((q) => q.pickerId === quickPayPickerId);
    logger.log('[Quick Pay Current Picker]', picker ? { id: picker.id, pickerNumber: picker.pickerNumber, pickerName: picker.pickerName, balance: queueRow?.balance } : null);
  }, [quickMode, viewMode, quickPayPickerId, pickersForCollection, quickPayQueue]);

  const amountPaidOutThisCollection = useMemo(
    () => collectionFinancials.totalPaidOut,
    [collectionFinancials.totalPaidOut]
  );

  const filteredPickers = useMemo(() => {
    const q = (debouncedPickerSearch || '').trim().toLowerCase();
    if (!q) return pickersForCollection;
    return pickersForCollection.filter(
      (p) =>
        String(p.pickerNumber ?? '').toLowerCase().includes(q) ||
        (p.pickerName ?? '').toLowerCase().includes(q)
    );
  }, [pickersForCollection, debouncedPickerSearch]);

  const viewPickerRows = useMemo(() => {
    const pricePerKgPicker = Number(selectedCollection?.pricePerKgPicker ?? 0);
    const byPicker = new Map<
      string,
      {
        pickerId: string;
        pickerNumber: number | string;
        pickerName: string;
        totalKg: number;
        totalAmount: number;
        entries: Array<{ rowKey: string; timeLabel: string; kg: number; amount: number; recordedAtMs: number }>;
      }
    >();

    pickersForCollection.forEach((picker) => {
      byPicker.set(picker.id, {
        pickerId: picker.id,
        pickerNumber: picker.pickerNumber ?? '',
        pickerName: picker.pickerName ?? '—',
        totalKg: 0,
        totalAmount: 0,
        entries: [],
      });
    });

    weighEntriesForCollection.forEach((entry, idx) => {
      const pickerId = String(entry.pickerId ?? '');
      const row = byPicker.get(pickerId);
      if (!row) return;
      const kg = Number(entry.weightKg ?? 0);
      if (!Number.isFinite(kg) || kg <= 0) return;
      row.totalKg += kg;
      const amount = Math.round(kg * pricePerKgPicker);
      row.totalAmount += amount;
      row.entries.push({
        rowKey: entry.id ?? `view-picker-entry-${idx}`,
        timeLabel: entry.recordedAt != null ? format(toDate(entry.recordedAt) ?? new Date(), 'h:mm a') : '—',
        kg,
        amount,
        recordedAtMs: entry.recordedAt != null ? (toDate(entry.recordedAt) ?? new Date()).getTime() : 0,
      });
    });

    return Array.from(byPicker.values())
      .map((row) => ({
        ...row,
        // Oldest first so entry #1 is the first recorded entry.
        entries: row.entries.sort((a, b) => a.recordedAtMs - b.recordedAtMs),
      }))
      .sort((a, b) => Number(a.pickerNumber ?? 0) - Number(b.pickerNumber ?? 0));
  }, [pickersForCollection, weighEntriesForCollection, selectedCollection?.pricePerKgPicker]);

  const filteredViewPickerRows = useMemo(() => {
    const query = (debouncedViewPickersSearch ?? '').trim().toLowerCase().replace(/^#/, '');
    if (!query) return viewPickerRows;
    return viewPickerRows.filter((row) => String(row.pickerNumber ?? '').toLowerCase().includes(query));
  }, [viewPickerRows, debouncedViewPickersSearch]);

  useEffect(() => {
    if (viewMode !== 'view_pickers') return;
    if (filteredViewPickerRows.length === 0) {
      setExpandedViewPickerIds(new Set());
      viewPickersPrevSearchRef.current = debouncedViewPickersSearch;
      return;
    }
    const searchChanged = viewPickersPrevSearchRef.current !== debouncedViewPickersSearch;
    // Admin card view should stay collapsed until chevron is explicitly tapped.
    if (isAdminUser && viewPickersLayout === 'cards') {
      if (searchChanged) setExpandedViewPickerIds(new Set());
      viewPickersPrevSearchRef.current = debouncedViewPickersSearch;
      return;
    }
    const visibleIds = new Set(filteredViewPickerRows.map((row) => row.pickerId));
    setExpandedViewPickerIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      if (searchChanged && next.size === 0 && filteredViewPickerRows[0]) {
        next.add(filteredViewPickerRows[0].pickerId);
      }
      return next;
    });
    viewPickersPrevSearchRef.current = debouncedViewPickersSearch;
  }, [viewMode, filteredViewPickerRows, debouncedViewPickersSearch, isAdminUser, viewPickersLayout]);

  const filteredPickersForPay = useMemo(() => {
    return [...filteredPickers].sort((a, b) => (a.isPaid === b.isPaid ? 0 : a.isPaid ? 1 : -1));
  }, [filteredPickers]);

  const payUnpaidAndGroups = useMemo(() => {
    const unpaid = filteredPickersForPay.filter((p) => !p.isPaid);
    const paid = filteredPickersForPay.filter((p) => p.isPaid);
    if (paid.length === 0)
      return {
        unpaid,
        groups: [] as { label: string; pickers: HarvestPicker[] }[],
        individuals: [] as { label: string; pickers: HarvestPicker[] }[],
      };

    const toTime = (p: HarvestPicker) => {
      const t = p.paidAt;
      if (t == null) return 0;
      if (typeof t === 'object' && 'toMillis' in t) return (t as { toMillis: () => number }).toMillis();
      if (t instanceof Date) return t.getTime();
      return Number(t) || 0;
    };
    const byBatch = new Map<string, HarvestPicker[]>();
    paid.forEach((p) => {
      const bid = p.paymentBatchId ?? '__legacy__';
      if (!byBatch.has(bid)) byBatch.set(bid, []);
      byBatch.get(bid)!.push(p);
    });
    const batches = Array.from(byBatch.entries()).map(([_, pickers]) => ({
      pickers,
      minPaidAt: Math.min(...pickers.map(toTime)),
    }));
    batches.sort((a, b) => a.minPaidAt - b.minPaidAt);
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let letterIndex = 0;
    const groupsRaw = batches.map((b) => {
      const isLegacy = b.pickers.some((p) => !p.paymentBatchId);
      const letter = labels[letterIndex++] ?? String(letterIndex);
      const isIndividual = b.pickers.length === 1;

      let label: string;
      if (isLegacy) {
        label = isIndividual ? 'Individual (earlier)' : 'Paid (earlier)';
      } else {
        label = isIndividual ? `Individual ${letter}` : `Group ${letter}`;
      }

      return { label, pickers: b.pickers, isIndividual };
    });
    const individuals = groupsRaw.filter((g) => g.isIndividual).map(({ label, pickers }) => ({ label, pickers }));
    const groups = groupsRaw.filter((g) => !g.isIndividual).map(({ label, pickers }) => ({ label, pickers }));

    return { unpaid, groups, individuals };
  }, [filteredPickersForPay]);

  const unpaidPickersByBalance = useMemo(() => {
    const unpaid = payUnpaidAndGroups.unpaid;
    return [...unpaid].sort((a, b) => {
      const balanceA = getPickerTotals(a.id).totalPay - (paidByPickerId[a.id] ?? 0);
      const balanceB = getPickerTotals(b.id).totalPay - (paidByPickerId[b.id] ?? 0);
      return balanceB - balanceA;
    });
  }, [payUnpaidAndGroups.unpaid, getPickerTotals, paidByPickerId]);

  const recentPickersForIntake = useMemo(() => {
    const ids = recentPickerIds.slice(0, 10);
    return ids
      .map((id) => pickersForCollection.find((p) => p.id === id))
      .filter((p): p is HarvestPicker => p != null);
  }, [recentPickerIds, pickersForCollection]);

  const selectedTotalPay = useMemo(() => {
    let sum = 0;
    paySelectedIds.forEach((id) => {
      sum += getPickerTotals(id).totalPay;
    });
    return sum;
  }, [paySelectedIds, getPickerTotals]);

  const nextPickerNumber = useMemo(() => {
    const max = pickersForCollection.length
      ? Math.max(...pickersForCollection.map((p) => p.pickerNumber ?? 0))
      : 0;
    return max + 1;
  }, [pickersForCollection]);

  const nextTripForPicker = useMemo(() => {
    const map: Record<string, number> = {};
    pickersForCollection.forEach((p) => {
      const entries = weighEntriesForCollection.filter((e) => e.pickerId === p.id);
      const maxTrip = entries.length === 0 ? 0 : Math.max(...entries.map((e) => e.tripNumber ?? 0));
      map[p.id] = maxTrip + 1;
    });
    return map;
  }, [pickersForCollection, weighEntriesForCollection]);

  const quickIntakePickerLookup = useMemo(() => {
    const typed = (quickIntakePickerNumber || '').trim();
    if (!typed) return { matchedPicker: null as HarvestPicker | null, nextTripNumber: 1 };
    const num = parseInt(typed, 10);
    const picker = pickersForCollection.find(
      (p) => p.pickerNumber === num || String(p.pickerNumber) === typed
    ) ?? null;
    const nextTripNumber = picker ? (nextTripForPicker[picker.id] ?? 1) : 1;
    return { matchedPicker: picker, nextTripNumber };
  }, [quickIntakePickerNumber, pickersForCollection, nextTripForPicker]);

  useEffect(() => {
    if (addWeighOpen && weighOpenedFromCard && weighPickerId) {
      const next = nextTripForPicker[weighPickerId] ?? 1;
      setWeighTrip(String(next));
    }
  }, [addWeighOpen, weighOpenedFromCard, weighPickerId, nextTripForPicker]);

  const tripCountForPicker = useMemo(() => {
    const counts: Record<string, number> = {};
    weighEntriesForCollection.forEach((e) => {
      const id = e.pickerId;
      counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  }, [weighEntriesForCollection]);

  const tripOverrideMessageForPicker = useMemo(() => {
    const overrides = weighEntriesForCollection.filter(
      (e) => e.suggestedTripNumber != null && Number(e.suggestedTripNumber) !== Number(e.tripNumber)
    );
    const byPicker: Record<string, { msg: string; at: number }> = {};
    overrides.forEach((e) => {
      const at = e.recordedAt != null ? toDate(e.recordedAt).getTime() : 0;
      const suggested = Number(e.suggestedTripNumber);
      const actual = Number(e.tripNumber);
      const msg = `Trip no ${suggested} changed to ${actual}`;
      const key = e.pickerId;
      if (!byPicker[key] || at > byPicker[key].at) byPicker[key] = { msg, at };
    });
    const map: Record<string, string> = {};
    Object.keys(byPicker).forEach((id) => { map[id] = byPicker[id].msg; });
    return map;
  }, [weighEntriesForCollection]);

  const totalsFromPickers = useMemo(() => {
    let totalKg = 0;
    let totalPay = 0;
    pickersForCollection.forEach((p) => {
      const totals = getPickerTotals(p.id);
      totalKg += totals.totalKg;
      totalPay += totals.totalPay;
    });
    return { totalKg, totalPay };
  }, [pickersForCollection, getPickerTotals]);

  const allPickersPaid = useMemo(
    () => pickersForCollection.length > 0 && pickersForCollection.every((p) => p.isPaid),
    [pickersForCollection]
  );

  /**
   * Outstanding picker balances:
   * - Only pickers with payable amount > 0 and unpaid are considered "outstanding".
   * - Zero-amount pickers are treated as settled so they do not block buyer payment.
   */
  const hasOutstandingPickerBalances = useMemo(() => {
    if (pickersForCollection.length === 0) return false;
    return pickersForCollection.some((p) => {
      const totals = getPickerTotals(p.id);
      const due = totals.totalPay;
      const paid = paidByPickerId[p.id] ?? 0;
      return due > 0 && paid < due;
    });
  }, [pickersForCollection, getPickerTotals, paidByPickerId]);

  const totalRevenue = useMemo(() => {
    const buyerPrice =
      selectedCollection?.pricePerKgBuyer != null && selectedCollection.pricePerKgBuyer > 0
        ? Number(selectedCollection.pricePerKgBuyer)
        : Number(buyerPricePerKg || 0) || 0;
    return (collectionFinancials.totalHarvestQty || 0) * buyerPrice;
  }, [collectionFinancials.totalHarvestQty, selectedCollection?.pricePerKgBuyer, buyerPricePerKg]);

  const profit = useMemo(
    () => (totalRevenue || 0) - (collectionFinancials.totalPaidOut || 0),
    [totalRevenue, collectionFinancials.totalPaidOut]
  );

  const handleCreateCollection = async () => {
    if (creating || createCollectionInFlightRef.current) return;
    if (!canCreateCollection) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to create harvest collections.',
        variant: 'destructive',
      });
      return;
    }
    if (!companyId || !effectiveProject) return;

    const harvestDate = new Date(newHarvestDate + 'T12:00:00');
    const price = Number(newPricePerKgPicker || 0);
    if (price <= 0) {
      toast({ title: 'Invalid rate', description: 'Price per kg (picker) must be > 0', variant: 'destructive' });
      return;
    }

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    createCollectionInFlightRef.current = true;
    setCreating(true);
    if (import.meta.env.DEV) {
      logger.log('[HC auth check]', { clerkUserId: user?.id, companyId: user?.companyId, role: user?.role });
    }
    try {
      const typedName = (newCollectionName || '').trim();
      const finalName = typedName;

      if (!finalName) {
        toast({ title: 'Name required', description: 'Give the collection a name.', variant: 'destructive' });
        return;
      }

      if (import.meta.env.DEV) {
        logger.log('[HarvestCollections] create attempt', {
          companyId,
          projectId: effectiveProject.id,
          finalName,
          isOffline,
        });
      }

      const id = await createHarvestCollection({
        companyId,
        projectId: effectiveProject.id,
        cropType: effectiveProject.cropType,
        name: finalName,
        harvestDate,
        pricePerKgPicker: price,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboardFinancialTotals', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['harvestSalesTotals', companyId, effectiveProjectId] }),
      ]);
      setSelectedCollectionId(id);
      setViewMode('intake');
      setNewCollectionOpen(false);
      setNewCollectionName('');
      setAutoSuggestedCollectionName('');
      newCollectionNameDirtyRef.current = false;
      setNewHarvestDate(format(new Date(), 'yyyy-MM-dd'));
      setNewPricePerKgPicker('20');
      toast({
        title: isOffline ? 'Collection saved offline' : 'Collection created',
        description: isOffline
          ? 'It will sync when online. Add pickers and weigh entries.'
          : 'Add pickers and weigh entries.',
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to create collection', variant: 'destructive' });
    } finally {
      setCreating(false);
      createCollectionInFlightRef.current = false;
    }
  };

  const handleAddPicker = async () => {
    if (!canManageIntake) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to add pickers.',
        variant: 'destructive',
      });
      return;
    }
    if (!companyId || !selectedCollectionId) return;
    const num = Number(newPickerNumber || nextPickerNumber || '0');
    const name = (newPickerName || '').trim();
    if (num <= 0 || !name) {
      toast({ title: 'Invalid input', description: 'Picker number and name required', variant: 'destructive' });
      return;
    }
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const numberTaken = pickersForCollection.some((p) => (p.pickerNumber ?? 0) === num);

    if (numberTaken) {
      const existing = pickersForCollection.find((p) => (p.pickerNumber ?? 0) === num);
      if (!existing) {
        toast({
          title: 'Number already used',
          description: 'One number can only have one picker in this collection. Use a different number.',
          variant: 'destructive',
        });
        return;
      }

      if (isOffline) {
        toast({
          title: 'Offline',
          description: 'Cannot update picker name while offline. Go online and try again.',
          variant: 'destructive',
        });
        return;
      }

      setAddingPicker(true);
      try {
        await updateHarvestPicker({
          companyId,
          pickerId: existing.id,
          pickerName: name,
        });
        if (import.meta.env.DEV) {
          logger.log('[Reload Debug] invalidate', { queryKey: ['harvestPickers', companyId, collectionIds] });
        }
        queryClient.invalidateQueries({ queryKey: ['harvestPickers', companyId, collectionIds] });
        toast({
          title: 'Picker updated',
          description: `Name updated for picker #${num}.`,
        });
        setNewPickerName('');
      } catch (e: any) {
        toast({ title: 'Error', description: e?.message ?? 'Failed to update picker', variant: 'destructive' });
      } finally {
        setAddingPicker(false);
      }
      return;
    }
    setAddingPicker(true);
    try {
      await addHarvestPicker({
        companyId,
        collectionId: selectedCollectionId,
        pickerNumber: num,
        pickerName: name,
      });
      if (import.meta.env.DEV) {
        logger.log('[Reload Debug] invalidate', { queryKey: ['harvestPickers', companyId, collectionIds] });
      }
      queryClient.invalidateQueries({ queryKey: ['harvestPickers', companyId, collectionIds] });
      toast({
        title: isOffline ? 'Picker saved offline' : 'Picker added',
        description: isOffline ? 'It will sync when online.' : undefined,
      });
      const nextNum = num + 1;
      setNewPickerNumber(String(nextNum));
      setNewPickerName('');
      setTimeout(() => {
        newPickerNumberRef.current?.focus();
      }, 0);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to add picker', variant: 'destructive' });
    } finally {
      setAddingPicker(false);
    }
  };

  const handleSaveWeighPickerName = async () => {
    if (!companyId || !weighPickerId) return;
    const name = editingWeighPickerName.trim();
    if (!name) {
      toast({ title: 'Invalid input', description: 'Picker name is required', variant: 'destructive' });
      return;
    }

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      toast({
        title: 'Offline',
        description: 'Cannot update picker name while offline. Go online and try again.',
        variant: 'destructive',
      });
      return;
    }

    setEditingWeighPickerSaving(true);
    try {
      await updateHarvestPicker({
        companyId,
        pickerId: weighPickerId,
        pickerName: name,
      });
      if (import.meta.env.DEV) {
        logger.log('[Reload Debug] invalidate', { queryKey: ['harvestPickers', companyId, collectionIds] });
      }
      queryClient.invalidateQueries({ queryKey: ['harvestPickers', companyId, collectionIds] });
      toast({
        title: 'Picker name updated',
        description: `Name updated for picker in this collection.`,
      });
      setIsEditingWeighPickerName(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to update picker', variant: 'destructive' });
    } finally {
      setEditingWeighPickerSaving(false);
    }
  };

  type SaveWeighMode = 'close' | 'stay' | 'next';

  const handleAddWeigh = async (saveMode: SaveWeighMode = 'close', bypassWeightCheck = false) => {
    if (isSavingWeight) return; // Prevent double submission

    if (!canManageIntake) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to record picker weight.',
        variant: 'destructive',
      });
      return;
    }
    if (!companyId || !selectedCollectionId || !weighPickerId || !selectedCollection) return;
    const kg = Number(weighKg || '0');
    const trip = Number(weighTrip || '1');
    if (kg <= 0) {
      toast({ title: 'Invalid weight', description: 'Weight must be > 0', variant: 'destructive' });
      return;
    }

    // Check for unusual weight and show confirmation if needed
    if (kg > UNUSUAL_WEIGHT_THRESHOLD_KG && !bypassWeightCheck) {
      setUnusualWeightConfirm({ kg, mode: saveMode });
      return;
    }

    const suggestedTrip = nextTripForPicker[weighPickerId] ?? 1;
    const tripOverridden = trip !== suggestedTrip;
    const savedPickerId = weighPickerId;

    setIsSavingWeight(true);

    try {
      await addPickerWeighEntry({
        companyId,
        pickerId: savedPickerId,
        collectionId: selectedCollectionId,
        weightKg: kg,
        tripNumber: trip,
        ...(tripOverridden && { suggestedTripNumber: suggestedTrip }),
      });

      logger.log('[Harvest] Intake save success', { pickerId: savedPickerId, kg, collectionId: selectedCollectionId });

      setLastWeighPickerId(savedPickerId);
      setRecentPickerIds((prev) => {
        const next = [savedPickerId, ...prev.filter((id) => id !== savedPickerId)].slice(0, 10);
        return next;
      });

      if (saveMode === 'close') {
        setAddWeighOpen(false);
        setWeighPickerId('');
        setWeighKg('');
        setWeighTrip('1');
        setWeighOpenedFromCard(false);
      } else {
        setWeighKg('');
        const nextTrip = nextTripForPicker[savedPickerId] ?? 1;
        setWeighTrip(String(saveMode === 'stay' ? nextTrip + 1 : nextTrip));
        if (saveMode === 'next') {
          const idx = filteredPickers.findIndex((p) => p.id === savedPickerId);
          const nextPicker = idx >= 0 && idx < filteredPickers.length - 1 ? filteredPickers[idx + 1] : null;
          if (nextPicker) {
            setWeighPickerId(nextPicker.id);
            setWeighTrip(String(nextTripForPicker[nextPicker.id] ?? 1));
            setWeighOpenedFromCard(true);
          } else {
            setAddWeighOpen(false);
            setWeighPickerId('');
            setWeighOpenedFromCard(false);
          }
        } else {
          // saveMode === 'stay' - auto-focus the kg input for next entry
          requestAnimationFrame(() => {
            weighKgInputRef.current?.focus();
          });
        }
      }

      toast({ title: 'Saved' });
      queryClient.invalidateQueries({ queryKey: ['pickerIntake'] });
      queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
    } catch (e: any) {
      const msg = e?.message ?? 'Could not save weight';
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
      if (import.meta.env.DEV) console.warn('[Harvest] Intake save failed', msg);
    } finally {
      setIsSavingWeight(false);
    }
  };

  const scrollQuickIntakeIntoView = () => {
    quickIntakeContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleQuickIntakeNextPicker = async (saveAndStay: boolean, bypassWeightCheck = false) => {
    if (isSavingQuickIntake) return; // Prevent double submission

    if (!canManageIntake || !companyId || !selectedCollectionId || !selectedCollection) return;
    const numStr = (quickIntakePickerNumber || '').trim();
    const kg = Number((quickIntakeKg || '').replace(',', '.'));
    if (!numStr) {
      toast({ title: 'Picker number required', variant: 'destructive' });
      quickIntakePickerNumberRef.current?.focus();
      return;
    }
    if (!Number.isFinite(kg) || kg <= 0) {
      toast({ title: 'KG must be greater than 0', variant: 'destructive' });
      quickIntakeKgRef.current?.focus();
      return;
    }

    // Check for unusual weight and show confirmation if needed
    if (kg > UNUSUAL_WEIGHT_THRESHOLD_KG && !bypassWeightCheck) {
      setUnusualQuickWeightConfirm({ kg, saveAndStay });
      return;
    }

    const pickerNum = parseInt(numStr, 10);
    if (Number.isNaN(pickerNum) || pickerNum < 1) {
      toast({ title: 'Invalid picker number', variant: 'destructive' });
      return;
    }
    const picker = pickersForCollection.find(
      (p) => p.pickerNumber === pickerNum || String(p.pickerNumber) === numStr
    );
    if (!picker) {
      toast({ title: 'Picker not found', description: `No picker #${numStr} in this collection.`, variant: 'destructive' });
      return;
    }

    setIsSavingQuickIntake(true);

    try {
      await addPickerWeighEntry({
        companyId,
        collectionId: selectedCollectionId,
        pickerId: picker.id,
        weightKg: kg,
        recordedBy: user?.id ?? undefined,
        pricePerKg: selectedCollection?.pricePerKgPicker,
      });

      queryClient.invalidateQueries({ queryKey: ['pickerIntake'] });
      queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });

      if (!saveAndStay) {
        setQuickIntakePickerNumber('');
        setQuickIntakeKg('');
        requestAnimationFrame(() => quickIntakePickerNumberRef.current?.focus());
      } else {
        setQuickIntakeKg('');
        requestAnimationFrame(() => quickIntakeKgRef.current?.focus());
      }
      toast({ title: 'Saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? 'Could not save intake', variant: 'destructive' });
    } finally {
      setIsSavingQuickIntake(false);
    }
  };

  const handleSaveEditIntake = async () => {
    if (!editIntakeEntry || !companyId || !editIntakePickerId || !editIntakeKg.trim()) return;
    const kg = Number(editIntakeKg.replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) {
      toast({ title: 'Invalid weight', description: 'Enter a valid kg (e.g. 5.2)', variant: 'destructive' });
      return;
    }
    setEditIntakeSaving(true);
    try {
      await updatePickerIntakeEntry({
        entryId: editIntakeEntry.id,
        collectionId: editIntakeEntry.collectionId,
        companyId,
        pickerId: editIntakePickerId,
        quantity: kg,
        unit: 'kg',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pickerIntake'] }),
        queryClient.invalidateQueries({ queryKey: ['harvestCollections'] }),
      ]);
      toast({ title: 'Entry updated', description: 'Picker total and collection totals recalculated.' });
      setEditIntakeEntry(null);
      setEditIntakePickerId('');
      setEditIntakeKg('');
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message ?? 'Could not update entry', variant: 'destructive' });
    } finally {
      setEditIntakeSaving(false);
    }
  };

  const handleDeleteIntakeEntryClick = (params: { id: string; collectionId: string }) => {
    if (!canDeleteIntakeEntry || selectedCollection?.status === 'closed') return;
    setDeleteIntakeConfirm({ entryId: params.id, collectionId: params.collectionId });
  };

  const handleDeleteIntakeEntryConfirm = async () => {
    if (!deleteIntakeConfirm) return;
    setDeletingIntakeEntry(true);
    try {
      await deletePickerIntakeEntry({ entryId: deleteIntakeConfirm.entryId, collectionId: deleteIntakeConfirm.collectionId });
      setDeleteIntakeConfirm(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pickerIntake'] }),
        queryClient.invalidateQueries({ queryKey: ['harvestCollections'] }),
      ]);
      toast({ title: 'Entry deleted', description: 'Totals recalculated.' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message ?? 'Could not delete entry', variant: 'destructive' });
    } finally {
      setDeletingIntakeEntry(false);
    }
  };

  const handleMarkPickerPaid = async (pickerId: string) => {
    if (!canPayPickers) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to mark picker payments.',
        variant: 'destructive',
      });
      return;
    }
    const picker = allPickers.find((p) => p.id === pickerId);
    if (!picker) return;

    if (picker.isPaid) {
      toast({
        title: 'Already paid',
        description: 'This picker is already marked as paid.',
      });
      return;
    }

    if (!effectiveProject?.id || !harvestFarmId) {
      toast({
        title: 'Farm or project missing',
        description: 'Select an active project with a farm, or open this harvest from a farm workspace.',
        variant: 'destructive',
      });
      return;
    }

    const payAmount = getPickerTotals(picker.id).totalPay;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const pendingSingleDebitId =
      isOffline && isFrenchBeansCollection && effectiveProject?.id && companyId
        ? `pending-debit-${Date.now()}`
        : null;
    if (pendingSingleDebitId) {
      setWalletLedgerEntries((prev) => [
        ...prev,
        {
          id: pendingSingleDebitId,
          companyId,
          projectId: effectiveProject!.id,
          type: 'DEBIT' as const,
          amount: payAmount,
          reason: 'Picker cash payout',
          createdAtLocal: Date.now(),
          createdByUid: user?.id ?? '',
          createdByName: user?.name ?? user?.email ?? 'System',
        } as ProjectWalletLedgerEntry,
      ]);
    }

    if (isFrenchBeansCollection && selectedCollectionId && effectiveProject && user?.companyId) {
      try {
        await applyHarvestCashPayment({
          companyId: user.companyId,
          projectId: effectiveProject.id,
          cropType: String(effectiveProject.cropType),
          collectionId: selectedCollectionId,
          amount: payAmount,
        });
      } catch (e: any) {
        if (pendingSingleDebitId) {
          setWalletLedgerEntries((prev) => prev.filter((e) => e.id !== pendingSingleDebitId));
        }
        const isPermissionDenied =
          e?.code === 'permission-denied' || (e?.message && (e.message.includes('permission') || e.message.includes('Permission')));
        toast({
          title: 'Payment failed',
          description: isPermissionDenied
            ? 'Insufficient permissions. You may not have access to update harvest payments.'
            : (e?.message ?? 'Not enough cash in Harvest Wallet.'),
          variant: 'destructive',
        });
        return;
      }
    }

    setSinglePickerPayWorkingId(pickerId);
    try {
      await markPickerCashPaid({
        collectionId: selectedCollectionId,
        companyId: companyId!,
        pickerId,
        amount: payAmount,
        farmId: harvestFarmId,
        projectId: effectiveProject.id,
      });
      queryClient.invalidateQueries({ queryKey: ['pickerPayments'] });
      queryClient.invalidateQueries({ queryKey: ['harvestPickers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardFinancialTotals', companyId] });
      queryClient.invalidateQueries({ queryKey: ['harvestSalesTotals', companyId, effectiveProjectId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['financeExpenses'] });
      if (effectiveProject?.id && companyId) {
        queryClient.invalidateQueries({ queryKey: ['projectWalletTotals', companyId, effectiveProject.id] });
        queryClient.invalidateQueries({ queryKey: ['projectWalletLedger', companyId, effectiveProject.id] });
        queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] });
        queryClient.invalidateQueries({ queryKey: ['pickerPayments', companyId, collectionIds] });
        if (!isFrenchBeansProject) {
          const refreshWallet = () =>
            getWalletLedgerEntries(effectiveProject.id!, companyId, { forceFromCache: isOffline })
              .then(setWalletLedgerEntries)
              .catch((err) => {
                if (import.meta.env.DEV) console.warn('[Harvest] Wallet ledger refresh after payment failed:', err?.message ?? err);
              });
          refreshWallet();
          if (isOffline) setTimeout(refreshWallet, 200);
        }
      }
      toast({
        title: isOffline ? 'Saved offline' : 'Payment successful ✅',
        description: isOffline ? 'Will finish when you are back online.' : undefined,
      });
    } catch (e: any) {
      if (pendingSingleDebitId) {
        setWalletLedgerEntries((prev) => prev.filter((e) => e.id !== pendingSingleDebitId));
      }
      toast({
        title: 'Payment did not go through',
        description: e?.message ?? 'Something went wrong. Try again.',
        variant: 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['harvestPickers'] });
      queryClient.invalidateQueries({ queryKey: ['pickerPayments'] });
    } finally {
      setSinglePickerPayWorkingId(null);
    }
  };

  const togglePaySelection = (pickerId: string) => {
    setPaySelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pickerId)) next.delete(pickerId);
      else next.add(pickerId);
      return next;
    });
  };

  const openQuickPay = (pickerId: string) => {
    const picker = pickersForCollection.find((p) => p.id === pickerId);
    if (!picker || picker.isPaid) return;
    setQuickPayPickerId(pickerId);
    setQuickPayAmount('');
    setQuickPayOpen(true);
  };

  const getNextQuickPayPickerId = (params: {
    currentPickerId: string;
    currentPickerNumber: number;
    removeCurrent: boolean;
  }): string | null => {
    const queue = quickPayQueueFiltered;
    const remaining = params.removeCurrent
      ? queue.filter((q) => q.pickerId !== params.currentPickerId)
      : queue;
    if (remaining.length === 0) return null;

    const currentIndex = remaining.findIndex((q) => q.pickerId === params.currentPickerId);
    if (currentIndex === -1) {
      return remaining[0]?.pickerId ?? null;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < remaining.length) {
      return remaining[nextIndex].pickerId;
    }

    return remaining[0]?.pickerId ?? null;
  };

  const handleQuickPaySubmit = async (amountOverride?: number) => {
    if (!quickPayPickerId || !companyId || !selectedCollectionId || !canPayPickers) return;
    const queueRow = quickPayQueue.find((q) => q.pickerId === quickPayPickerId);
    const balance = queueRow?.balance ?? 0;
    const amount = Math.round(Number(amountOverride ?? quickPayAmount ?? '0'));
    if (amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter an amount greater than 0.', variant: 'destructive' });
      return;
    }
    const picker = pickersForCollection.find((p) => p.id === quickPayPickerId);
    if (!picker || picker.isPaid) {
      toast({ title: 'Already paid', variant: 'destructive' });
      setQuickPayOpen(false);
      return;
    }
    if (!effectiveProject?.id || !harvestFarmId) {
      toast({
        title: 'Farm or project missing',
        description: 'Choose an active project tied to your farm first.',
        variant: 'destructive',
      });
      return;
    }
    const amountClamped = balance > 0 ? Math.min(amount, balance) : amount;
    setQuickPaySaving(true);
    try {
      if (isFrenchBeansCollection && effectiveProject?.id && user?.companyId) {
        await applyHarvestCashPayment({
          companyId: user.companyId,
          projectId: effectiveProject.id,
          cropType: String(effectiveProject.cropType),
          collectionId: selectedCollectionId,
          amount: amountClamped,
        });
      }
      await markPickerCashPaid({
        collectionId: selectedCollectionId,
        companyId,
        pickerId: quickPayPickerId,
        amount: amountClamped,
        farmId: harvestFarmId,
        projectId: effectiveProject.id,
        note: undefined,
        paidBy: user?.id ?? undefined,
      });
      setQuickPayLocalPaidByPickerId((prev) => ({
        ...prev,
        [quickPayPickerId]: (prev[quickPayPickerId] ?? 0) + amountClamped,
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pickerPayments'] }),
        queryClient.invalidateQueries({ queryKey: ['harvestPickers'] }),
        queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] }),
        queryClient.invalidateQueries({ queryKey: ['pickerPayments', companyId, collectionIds] }),
      ]);
      queryClient.invalidateQueries({ queryKey: ['dashboardFinancialTotals', companyId] });
      queryClient.invalidateQueries({ queryKey: ['harvestSalesTotals', companyId, effectiveProjectId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['financeExpenses'] });
      if (effectiveProject?.id) {
        queryClient.invalidateQueries({ queryKey: ['projectWalletTotals', companyId, effectiveProject.id] });
        queryClient.invalidateQueries({ queryKey: ['projectWalletLedger', companyId, effectiveProject.id] });
      }
      const remainingBalance = Math.max(0, balance - amountClamped);
      logger.log('[Quick Pay Save]', {
        pickerId: quickPayPickerId,
        amountPaid: amountClamped,
        remainingBalance,
      });
      logger.log('[Harvest] Payment save success', { pickerId: quickPayPickerId, amount: amountClamped, collectionId: selectedCollectionId });
      toast({ title: 'Payment successful ✅' });
      setQuickPayAmount('');
      const nextId = getNextQuickPayPickerId({
        currentPickerId: quickPayPickerId,
        currentPickerNumber: Number(picker.pickerNumber ?? 0),
        removeCurrent: remainingBalance <= 0,
      });
      if (nextId) {
        setQuickPayPickerId(nextId);
        setQuickPayOpen(true);
      } else {
        setQuickPayOpen(false);
        setQuickPayPickerId(null);
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Could not save payment';
      toast({ title: 'Payment failed', description: msg, variant: 'destructive' });
      if (import.meta.env.DEV) console.warn('[Harvest] Quick Pay save failed', msg);
    } finally {
      setQuickPaySaving(false);
    }
  };

  const handleQuickPaySkip = () => {
    if (!quickPayPickerId) return;
    const nextId = getNextQuickPayPickerId({
      currentPickerId: quickPayPickerId,
      currentPickerNumber: 0,
      removeCurrent: false,
    });
    if (nextId === quickPayPickerId || !nextId) {
      skipJustClickedRef.current = true;
      setQuickPayPickerId(null);
      return;
    }
    setQuickPayPickerId(nextId);
  };

  const handleMarkMultiplePaid = async (pickerIds: string[]) => {
    if (!canPayPickers) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to mark picker payments.',
        variant: 'destructive',
      });
      return;
    }
    if (pickerIds.length === 0 || !selectedCollectionId || !companyId || !effectiveProject) return;
    if (!harvestFarmId) {
      toast({
        title: 'Farm or project missing',
        description: 'Select an active project linked to your farm.',
        variant: 'destructive',
      });
      return;
    }
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const unpaidPickers = pickerIds
      .map((id) => allPickers.find((x) => x.id === id))
      .filter((p): p is HarvestPicker => Boolean(p && !p.isPaid));
    const unpaidIds = unpaidPickers.map((p) => p.id);

    const pickerAmountsById: Record<string, number> = {};
    let totalAmount = 0;
    unpaidIds.forEach((id) => {
      const payAmount = getPickerTotals(id).totalPay;
      if (payAmount > 0) {
        pickerAmountsById[id] = payAmount;
        totalAmount += payAmount;
      }
    });

    const payableIds = unpaidIds.filter((id) => Number(pickerAmountsById[id] ?? 0) > 0);

    if (payableIds.length === 0 || totalAmount <= 0) {
      toast({
        title: 'Nothing to pay',
        description: 'Selected pickers have no payable amount yet.',
      });
      setPaySelectedIds(new Set());
      return;
    }

    const alreadyPaidSelection = pickerIds.filter((id) => {
      const p = allPickers.find((x) => x.id === id);
      return p?.isPaid;
    });

    if (alreadyPaidSelection.length === pickerIds.length) {
      toast({
        title: 'Nothing to pay',
        description: 'All selected pickers are already marked as paid.',
      });
      setPaySelectedIds(new Set());
      return;
    }

    setPayingSelected(true);
    setPaySelectedIds(new Set());
    setPayingPickerIds(new Set(payableIds));
    toast({ title: `Paying ${payableIds.length} pickers…`, description: 'Please wait.' });

    const pendingDebitId = isOffline && isFrenchBeansCollection && effectiveProject?.id && companyId
      ? `pending-debit-${Date.now()}`
      : null;
    if (pendingDebitId) {
      setWalletLedgerEntries((prev) => [
        ...prev,
        {
          id: pendingDebitId,
          companyId,
          projectId: effectiveProject!.id,
          type: 'DEBIT' as const,
          amount: totalAmount,
          reason: 'Picker batch payout',
          createdAtLocal: Date.now(),
          createdByUid: user?.id ?? '',
          createdByName: user?.name ?? user?.email ?? 'System',
        } as ProjectWalletLedgerEntry,
      ]);
    }

    try {
      if (isFrenchBeansCollection && user?.companyId && effectiveProject) {
        await payPickersFromWalletBatch({
          companyId,
          projectId: effectiveProject.id,
          farmId: harvestFarmId,
          cropType: String(effectiveProject.cropType),
          collectionId: selectedCollectionId,
          pickerIds: payableIds,
          pickerAmountsById,
        });
      } else {
        await markPickersPaidInBatch({
          companyId,
          collectionId: selectedCollectionId,
          pickerIds: payableIds,
          totalAmount,
          pickerAmountsById,
          projectId: effectiveProject.id,
          farmId: harvestFarmId,
        });
      }

      setPayingPickerIds(null);
      queryClient.invalidateQueries({ queryKey: ['harvestPickers', companyId, collectionIds] });
      queryClient.invalidateQueries({ queryKey: ['pickerPayments', companyId, collectionIds] });
      queryClient.invalidateQueries({ queryKey: ['dashboardFinancialTotals', companyId] });
      queryClient.invalidateQueries({ queryKey: ['harvestSalesTotals', companyId, effectiveProjectId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['financeExpenses'] });
      if (effectiveProject?.id && companyId) {
        queryClient.invalidateQueries({ queryKey: ['projectWalletTotals', companyId, effectiveProject.id] });
        queryClient.invalidateQueries({ queryKey: ['projectWalletLedger', companyId, effectiveProject.id] });
        queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] });
        queryClient.invalidateQueries({ queryKey: ['pickerPayments', companyId, collectionIds] });
        if (!isFrenchBeansProject) {
          const refreshWallet = () =>
            getWalletLedgerEntries(effectiveProject.id!, companyId, { forceFromCache: isOffline })
              .then(setWalletLedgerEntries)
              .catch((err) => {
                if (import.meta.env.DEV) console.warn('[Harvest] Wallet ledger refresh after batch payment failed:', err?.message ?? err);
              });
          refreshWallet();
          if (isOffline) setTimeout(refreshWallet, 200);
        }
      }
      toast({
        title: isOffline ? `${payableIds.length} payments saved offline` : `${payableIds.length} marked paid`,
        description: isOffline ? 'They will sync when online.' : undefined,
      });
    } catch (e: any) {
      if (pendingDebitId) {
        setWalletLedgerEntries((prev) => prev.filter((e) => e.id !== pendingDebitId));
      }
      console.error('Batch payment failed', e);
      const isPermissionDenied =
        e?.code === 'permission-denied' || (e?.message && (e.message.includes('permission') || e.message.includes('Permission')));
      toast({
        title: 'Payment failed',
        description: isPermissionDenied
          ? 'Insufficient permissions. You may not have access to update harvest payments.'
          : (e?.message ?? 'Failed to persist picker payment batch.'),
        variant: 'destructive',
      });
    } finally {
      setPayingSelected(false);
      setPayingPickerIds(null);
    }
  };

  const handleSetBuyerPrice = async (markBuyerPaid: boolean) => {
    if (!canViewBuyerSection) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to buyer section actions.',
        variant: 'destructive',
      });
      return;
    }
    if (markBuyerPaid && !canCloseHarvest) {
      toast({
        title: 'Permission denied',
        description: 'You do not have access to close harvest collections.',
        variant: 'destructive',
      });
      return;
    }
    const collectionId = selectedCollectionId?.trim?.() || '';
    if (!collectionId) {
      toast({ title: 'Error', description: 'No collection selected.', variant: 'destructive' });
      return;
    }
    const price = Number(buyerPricePerKg || 0);
    if (price <= 0) {
      toast({ title: 'Invalid price', description: 'Buyer price per kg must be > 0', variant: 'destructive' });
      return;
    }
    setMarkingBuyerPaid(true);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    try {
      await setBuyerPriceAndMaybeClose({
        collectionId,
        pricePerKgBuyer: price,
        markBuyerPaid,
        totalHarvestKg: totalsFromPickers.totalKg,
        totalPickerCost: totalsFromPickers.totalPay,
        companyId: selectedCollection?.companyId,
        projectId: selectedCollection?.projectId,
        cropType: selectedCollection?.cropType ? String(selectedCollection.cropType) : undefined,
        harvestDate: selectedCollection?.harvestDate,
        collectionName: selectedCollection?.name,
        existingHarvestId: selectedCollection?.harvestId,
      });
      queryClient.invalidateQueries({ queryKey: ['harvestCollections', companyId, effectiveProjectId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardFinancialTotals', companyId] });
      queryClient.invalidateQueries({ queryKey: ['harvestSalesTotals', companyId, effectiveProjectId] });
      if (markBuyerPaid) {
        queryClient.invalidateQueries({ queryKey: ['harvests'] });
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        toast({
          title: isOffline ? 'Buyer payment saved offline' : 'Buyer paid – harvest closed',
          description: isOffline
            ? 'Will sync when back online.'
            : hasOutstandingPickerBalances
              ? 'Buyer marked as paid, but some pickers with outstanding balances are still unpaid.'
              : undefined,
        });
        setBuyerPricePerKg('');
      } else {
        toast({
          title: isOffline ? 'Buyer price saved offline' : 'Buyer price saved',
          description: isOffline ? 'Will sync when back online.' : undefined,
        });
      }
    } catch (e: any) {
      console.error('Mark buyer paid failed:', e?.message, e?.stack ?? e);
      toast({ title: 'Error', description: e?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setMarkingBuyerPaid(false);
    }
  };

  if (!canViewCollections) {
    return <AccessRestrictedPage title="Harvest collections restricted" />;
  }

  if (!effectiveProject) {
    return (
      <FeatureGate
        feature="frenchBeansCollections"
        title="This feature is available on Pro."
        description="Upgrade to Pro to continue using advanced tools and insights."
        className="p-4 md:p-6 space-y-4"
      >
        <div className="p-4 md:p-6 space-y-4" data-tour="staff-harvest-root">
          <h1 className="text-2xl font-bold text-foreground" data-tour="staff-harvest-header">
            Harvest Collections
          </h1>
          <div className="mt-2 max-w-xs">
            <p className="text-xs text-muted-foreground mb-1.5">Select project</p>
            <UiSelect
              value={activeProject?.id ?? undefined}
              onValueChange={(projectId) => switchHarvestProject(projectId)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {harvestProjectSelectOptions.map((project) => (
                  <SelectItem
                    key={project.id}
                    value={project.id}
                    disabled={isProjectClosed(project)}
                    className={isProjectClosed(project) ? 'opacity-70' : undefined}
                  >
                    {project.name}
                    {isProjectClosed(project) ? ' (closed)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
          </div>
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="pt-6">
              <p className="text-foreground">
                {routeProjectId
                  ? 'Project not found or you don’t have access. Select a project above or open Harvest Collections from the Harvest page for a French Beans project.'
                  : 'Select a project above to manage field harvest collections (pickers, weigh-in, cash payouts, buyer settlement).'}
              </p>
            </CardContent>
          </Card>
        </div>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate
      feature="frenchBeansCollections"
      title="This feature is available on Pro."
      description="Upgrade to Pro to continue using advanced tools and insights."
      className="w-full min-w-0"
    >
      <>
      <div
        className="px-2 sm:px-4 md:px-6 py-2 sm:py-4 md:py-6 space-y-3 sm:space-y-4 w-full min-w-0"
        data-tour="staff-harvest-root"
      >
        {/* Header */}
        <div
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0 w-full"
          data-tour="staff-harvest-header"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            {selectedCollectionId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg gap-1 text-sm shrink-0"
                onClick={() => {
                  setSelectedCollectionId(null);
                  setViewMode('list');
                }}
                data-tour="harvest-back"
              >
                <ChevronLeft className="h-5 w-5" />
                Back
              </Button>
            ) : null}
            <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate min-w-0" data-tour="harvest-collections-title">
              {selectedCollectionId ? (selectedCollection?.name ?? 'Collection') : 'Harvest Collections'}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={startHarvestTour}
              data-tour="harvest-take-tour"
              title="Take a Tour"
              aria-label="Take a Tour"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
          </div>
          <div className="w-full min-w-0 sm:max-w-[min(100%,320px)] shrink-0">
            <p className="text-xs text-muted-foreground mb-1.5">Project</p>
            <UiSelect
              value={effectiveProject?.id ?? undefined}
              onValueChange={(projectId) => switchHarvestProject(projectId)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {harvestProjectSelectOptions.map((project) => (
                  <SelectItem
                    key={project.id}
                    value={project.id}
                    disabled={isProjectClosed(project)}
                    className={isProjectClosed(project) ? 'opacity-70' : undefined}
                  >
                    {project.name}
                    {isProjectClosed(project) ? ' (closed)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {(hasPendingWrites || !isOnline) && (
              <Button
                size="sm"
                variant="outline"
                className="text-sm min-h-9 px-3 rounded-lg gap-1.5"
                data-tour="harvest-sync-offline"
                onClick={async () => {
                  const { synced, failed } = await triggerSync();
                  if (synced > 0 || failed > 0) {
                    queryClient.invalidateQueries({ queryKey: ['pickerIntake'] });
                    queryClient.invalidateQueries({ queryKey: ['pickerPayments'] });
                    queryClient.invalidateQueries({ queryKey: ['harvestCollections'] });
                    if (synced > 0) toast({ title: 'Synced', description: `${synced} offline entries synced.` });
                    if (failed > 0) toast({ title: 'Sync partial', description: `${failed} entries could not be synced.`, variant: 'destructive' });
                  }
                }}
                disabled={isSyncing}
              >
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                Sync Offline Data
              </Button>
            )}
            {!selectedCollectionId ? (
              <>
                {isFrenchBeansProject && isAdminUser && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs min-h-8 px-3 rounded-lg"
                    onClick={() => navigate('/harvest-sales')}
                  >
                    View More
                  </Button>
                )}
                {canCreateCollection && (
                  <Button
                    size="sm"
                    className="text-sm min-h-9 px-4 rounded-lg shadow bg-primary text-primary-foreground hover:bg-primary/90"
                    data-tour="harvest-new-collection"
                    onClick={() => setNewCollectionOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    New collection
                  </Button>
                )}
                {canViewFinancials && hasFrenchBeansCollections && (() => {
                  const fb = collections.find(
                    (c) => String(c.cropType).toLowerCase().replace('_', '-') === 'french-beans'
                  );
                  if (!fb) return null;
                  const totalPaidOut = walletSummary.cashPaidOutTotal;
                  const remaining = walletSummary.currentBalance;
                  const cashReceived = walletSummary.cashReceivedTotal;
                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs min-h-8 px-3 rounded-lg inline-flex items-center gap-1"
                          onClick={() => {
                            setCashDialogCollection(fb as any);
                            setCashAmount('');
                            setCashSource('bank');
                            setCashDialogVisible(false);
                          }}
                        >
                          <Banknote className="h-3 w-3" />
                          <span>Wallet</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 text-sm bg-emerald-950/70 backdrop-blur-lg border-emerald-400/80 shadow-lg rounded-2xl text-emerald-50" align="center" side="bottom">
                        <div className="space-y-4 text-center relative">
                          <button
                            type="button"
                            className="absolute right-1.5 top-1.5 h-5 w-5 rounded-full bg-emerald-800 text-emerald-50 flex items-center justify-center text-xs"
                            onClick={() => setCashDialogVisible(false)}
                          >
                            ×
                          </button>
                          <div className="flex flex-col items-center gap-2 pt-4">
                            <p className="text-xs font-semibold text-emerald-50">Harvest Cash Wallet</p>
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="text-[11px] text-emerald-100">Current balance</p>
                                <p
                                  className={cn(
                                    'text-xl font-extrabold tabular-nums text-emerald-50',
                                    !cashDialogVisible && 'blur-sm select-none'
                                  )}
                                >
                                  KES {remaining.toLocaleString()}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="mt-3 inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-800 text-emerald-50"
                                onClick={() => setCashDialogVisible((v) => !v)}
                              >
                                {cashDialogVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            <div className="flex items-center justify-center gap-4 mt-1">
                              <div>
                                <p className="text-[11px] text-emerald-100">Paid out</p>
                                <p
                                  className={cn(
                                    'font-semibold tabular-nums text-emerald-50',
                                    !cashDialogVisible && 'blur-sm select-none'
                                  )}
                                >
                                  KES {totalPaidOut.toLocaleString()}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] text-emerald-100">Cash received</p>
                                <p
                                  className={cn(
                                    'font-semibold tabular-nums text-emerald-50',
                                    !cashDialogVisible && 'blur-sm select-none'
                                  )}
                                >
                                  KES {cashReceived.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="pt-3 border-t border-emerald-500/70 space-y-3 mt-2 text-left">
                            <div className="space-y-1">
                              <p className="text-[11px] text-emerald-100">Current cash received</p>
                              <p
                                className={cn(
                                  'text-sm font-semibold text-emerald-50 tabular-nums',
                                  !cashDialogVisible && 'blur-sm select-none'
                                )}
                              >
                                KES {cashReceived.toLocaleString()}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-emerald-100">Set cash received (KES)</Label>
                              <Input
                                type="number"
                                min="0"
                                value={cashAmount}
                                onChange={(e) => setCashAmount(e.target.value)}
                                className="min-h-9 rounded-xl bg-emerald-900/60 border-emerald-400/80 text-emerald-50 placeholder:text-emerald-300"
                                placeholder="e.g. 150000"
                              />
                              <Label className="mt-2 text-xs text-emerald-100">Source</Label>
                              <UiSelect
                                value={cashSource}
                                onValueChange={(val) => setCashSource(val as 'bank' | 'custom')}
                              >
                                <SelectTrigger className="w-full min-h-9 rounded-xl border border-emerald-400/80 bg-emerald-900/60 px-3 py-1.5 text-xs text-emerald-50">
                                  <SelectValue placeholder="Select source" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="bank">Bank</SelectItem>
                                  <SelectItem value="custom">Custom…</SelectItem>
                                </SelectContent>
                              </UiSelect>
                              {cashSource === 'custom' && (
                                <Input
                                  value={cashSourceCustom}
                                  onChange={(e) => setCashSourceCustom(e.target.value)}
                                  className="min-h-9 rounded-xl bg-emerald-900/60 border-emerald-400/80 text-emerald-50 placeholder:text-emerald-300 mt-2"
                                  placeholder="Enter custom source (e.g. Mpesa float)"
                                />
                              )}
                              <Button
                                size="sm"
                                className="mt-3 rounded-full bg-amber-100 text-emerald-900 border border-emerald-500 hover:bg-amber-200 hover:text-emerald-950 font-semibold shadow-sm"
                                disabled={cashDialogSaving}
                                onClick={() => {
                                  setCashDialogCollection(fb as any);
                                  handleSaveCash();
                                }}
                              >
                                {cashDialogSaving ? (
                                  <>
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  'Add / Update Cash'
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })()}
              </>
            ) : null}
          </div>
        </div>

        {isFrenchBeansProject && !selectedCollectionId && canViewFinancials && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 max-w-xl">
            <Card className="border-primary/10 bg-card/60 backdrop-blur">
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">Total KG collected</p>
                <p className="text-base sm:text-lg font-bold tabular-nums text-foreground">
                  {collectionsSummary.totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
                </p>
              </CardContent>
            </Card>
            <Card className="border-primary/10 bg-card/60 backdrop-blur">
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">Total revenue</p>
                <p className="text-base sm:text-lg font-bold tabular-nums text-foreground">
                  KES {Math.round(collectionsSummary.totalRevenue).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* List of collections */}
        {!selectedCollectionId && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-sm mr-2">
                Project: <span className="font-medium text-foreground">{effectiveProject.name}</span>
              </p>
              {collections.length > 0 && (
                <div className="flex gap-1.5">
                  <Button
                    variant={collectionFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCollectionFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={collectionFilter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCollectionFilter('pending')}
                    title="Buyer not yet marked as paid"
                  >
                    Pending
                  </Button>
                  <Button
                    variant={collectionFilter === 'closed' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCollectionFilter('closed')}
                    title="Buyer paid, harvest completed"
                  >
                    Completed
                  </Button>
                </div>
              )}
            </div>
            {loadingCollections ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : collections.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground text-center py-4">
                    No collections yet. Start a day session with &quot;New collection&quot;.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6" data-tour="harvest-collection-cards">
                {(collectionFilter === 'all' || collectionFilter === 'pending') && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Pending — buyer not yet paid {collectionFilter === 'all' && pendingCollections.length > 0 && `(${pendingCollections.length})`}
                    </h3>
                    {pendingCollections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No pending collections. Mark buyer paid to complete a harvest.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-3">
                        {pendingCollections.map((c, index) => {
                          const displayName = c.name?.trim() || formatDate(c.harvestDate);
                          const derivedTotals = collectionTotalsById[c.id];
                          const totalPay = derivedTotals?.totalPickerCost ?? (c.totalPickerCost ?? 0);
                          const totalWeight = derivedTotals?.totalHarvestKg ?? (c.totalHarvestKg ?? 0);
                          const pickersCount = pickersCountByCollectionId[c.id] ?? 0;
                          const harvestDateStr = c.harvestDate != null ? formatDate(c.harvestDate) : (c as { createdAt?: unknown }).createdAt != null ? formatDate((c as { createdAt: unknown }).createdAt) : '—';
                          const Icon = COLLECTION_ICONS[index % COLLECTION_ICONS.length];
                          return (
                            <Card
                              key={c.id}
                              className="cursor-pointer hover:bg-muted/50 active:scale-[0.98] transition-all rounded-2xl flex flex-col overflow-hidden min-h-[160px] sm:min-h-[150px] md:min-h-[140px] relative"
                              onClick={() => {
                                setSelectedCollectionId(c.id);
                                setViewMode(defaultDetailMode);
                              }}
                            >
                              <CardContent className="p-4 sm:p-3 md:p-3 flex flex-col flex-1 justify-center items-center text-center min-h-0 relative">
                                <span
                                  className={cn(
                                    'absolute top-1.5 right-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded',
                                    c.status === 'collecting' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                                    c.status === 'payout_complete' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                                    c.status === 'sold' && 'bg-slate-100 text-slate-700 dark:bg-slate-800/30 dark:text-slate-300'
                                  )}
                                >
                                  {c.status}
                                </span>
                                <div className="absolute top-1.5 right-9 sm:right-10 z-20" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="p-1.5 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label="Collection actions"
                                      >
                                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onClick={() => {
                                          setSelectedCollectionId(c.id);
                                          setViewMode(defaultDetailMode);
                                        }}
                                      >
                                        View Details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        disabled={!canRenameCollection}
                                        onClick={() => {
                                          setRenameTargetCollection(c);
                                          setRenameCollectionDialogOpen(true);
                                        }}
                                      >
                                        Rename Collection
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer text-destructive focus:text-destructive"
                                        disabled={!canDeleteCollection}
                                        onClick={() => {
                                          setDeleteCollectionConfirm(c);
                                        }}
                                      >
                                        Delete Collection
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                <div className="w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-muted flex items-center justify-center mb-2 shrink-0">
                                  <Icon className="h-5 w-5 sm:h-5 sm:w-5 text-muted-foreground" />
                                </div>
                                <div className="w-full flex-1 flex flex-col justify-center min-h-0">
                                  <span className="font-bold text-foreground text-base sm:text-sm leading-tight line-clamp-2 block">
                                    {displayName}
                                  </span>
                                </div>
                                <div className="w-full space-y-0.5 text-center mt-auto pt-1.5 border-t border-border">
                                  <div className="text-[10px] text-muted-foreground tabular-nums">{harvestDateStr}</div>
                                  <div className="text-sm font-bold text-foreground tabular-nums">Total: {totalWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</div>
                                  <div className="text-[10px] text-muted-foreground tabular-nums">Pickers: {pickersCount}</div>
                                  {canViewPaymentAmounts && (
                                    <div className="text-[10px] text-muted-foreground tabular-nums">KES {totalPay.toLocaleString()}</div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {(collectionFilter === 'all' || collectionFilter === 'closed') && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Completed — buyer paid {collectionFilter === 'all' && closedCollections.length > 0 && `(${closedCollections.length})`}
                    </h3>
                    {closedCollections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No completed collections yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-3">
                        {closedCollections.map((c, index) => {
                          const displayName = c.name?.trim() || formatDate(c.harvestDate);
                          const derivedTotals = collectionTotalsById[c.id];
                          const totalPay = derivedTotals?.totalPickerCost ?? (c.totalPickerCost ?? 0);
                          const totalWeight = derivedTotals?.totalHarvestKg ?? (c.totalHarvestKg ?? 0);
                          const pickersCount = pickersCountByCollectionId[c.id] ?? 0;
                          const harvestDateStr = c.harvestDate != null ? formatDate(c.harvestDate) : (c as { createdAt?: unknown }).createdAt != null ? formatDate((c as { createdAt: unknown }).createdAt) : '—';
                          const Icon = COLLECTION_ICONS[(pendingCollections.length + index) % COLLECTION_ICONS.length];
                          return (
                            <Card
                              key={c.id}
                              className="cursor-pointer hover:bg-muted/50 active:scale-[0.98] transition-all rounded-2xl flex flex-col overflow-hidden min-h-[160px] sm:min-h-[150px] md:min-h-[140px] relative"
                              onClick={() => {
                                setSelectedCollectionId(c.id);
                                setViewMode(defaultDetailMode);
                              }}
                            >
                              <div
                                className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-2xl overflow-hidden"
                                aria-hidden
                              >
                                <span
                                  className="text-2xl sm:text-xl font-bold text-red-500/35 dark:text-red-400/30 select-none whitespace-nowrap"
                                  style={{ transform: 'rotate(-22deg)' }}
                                >
                                  CLOSED
                                </span>
                              </div>
                              <CardContent className="p-4 sm:p-3 md:p-3 flex flex-col flex-1 justify-center items-center text-center min-h-0 relative">
                                <span className="absolute top-1.5 right-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                  closed
                                </span>
                                <div className="absolute top-1.5 right-9 sm:right-10 z-20" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="p-1.5 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label="Collection actions"
                                      >
                                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onClick={() => {
                                          setSelectedCollectionId(c.id);
                                          setViewMode(defaultDetailMode);
                                        }}
                                      >
                                        View Details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        disabled={!canRenameCollection}
                                        onClick={() => {
                                          setRenameTargetCollection(c);
                                          setRenameCollectionDialogOpen(true);
                                        }}
                                      >
                                        Rename Collection
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="cursor-pointer text-destructive focus:text-destructive"
                                        disabled={!canDeleteCollection}
                                        onClick={() => {
                                          setDeleteCollectionConfirm(c);
                                        }}
                                      >
                                        Delete Collection
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                <div className="w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-muted flex items-center justify-center mb-2 shrink-0">
                                  <Icon className="h-5 w-5 sm:h-5 sm:w-5 text-muted-foreground" />
                                </div>
                                <div className="w-full flex-1 flex flex-col justify-center min-h-0">
                                  <span className="font-bold text-foreground text-base sm:text-sm leading-tight line-clamp-2 block">
                                    {displayName}
                                  </span>
                                </div>
                                <div className="w-full space-y-0.5 text-center mt-auto pt-1.5 border-t border-border">
                                  <div className="text-[10px] text-muted-foreground tabular-nums">{harvestDateStr}</div>
                                  <div className="text-sm font-bold text-foreground tabular-nums">Total: {totalWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</div>
                                  <div className="text-[10px] text-muted-foreground tabular-nums">Pickers: {pickersCount}</div>
                                  {canViewPaymentAmounts && (
                                    <div className="text-[10px] text-muted-foreground tabular-nums">KES {totalPay.toLocaleString()}</div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Collection detail: Intake / Pay / Buyer */}
        {selectedCollection && selectedCollectionId ? (
          <div className="space-y-3">
            <div className="space-y-2">
              {statsExpanded && (
                <div className="min-w-0 space-y-2" data-tour="harvest-stats">
                  <div
                    className={cn(
                      'grid gap-2 sm:gap-3',
                      (() => {
                        const statCount =
                          2 +
                          (canViewPaymentAmounts ? 1 : 0) +
                          (showBuyerSale ? 1 : 0);
                        if (statCount <= 1) return 'grid-cols-1';
                        if (statCount === 2) return 'grid-cols-2';
                        if (statCount === 3) return 'grid-cols-2 sm:grid-cols-3';
                        return 'grid-cols-2 sm:grid-cols-3';
                      })()
                    )}
                  >
                    <div data-tour="harvest-total-kg">
                      <SimpleStatCard
                        layout="mobile-compact"
                        title={
                          <>
                            Total kg
                            {selectedCollection?.pricePerKgPicker != null && (
                              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-normal normal-case tracking-normal ml-0.5">
                                (@{selectedCollection.pricePerKgPicker}/kg)
                              </span>
                            )}
                          </>
                        }
                        value={(collectionFinancials.totalHarvestQty ?? 0).toFixed(1)}
                        icon={Scale}
                        iconVariant="primary"
                        className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
                      />
                    </div>
                    <div data-tour="harvest-avg-kg-per-picker">
                      <SimpleStatCard
                        layout="mobile-compact"
                        title="Avg Kg / Picker"
                        value={`${avgKgPerPickerStats.avgKgPerPicker} kg`}
                        icon={Users}
                        iconVariant="primary"
                        className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
                      />
                    </div>
                    {canViewPaymentAmounts && (
                      <div data-tour="harvest-total-picker-due">
                        <SimpleStatCard
                          layout="mobile-compact"
                          title="Total picker due"
                          value={`KES ${(collectionFinancials.totalPickerDue ?? 0).toLocaleString()}`}
                          icon={Banknote}
                          iconVariant="primary"
                          className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
                        />
                      </div>
                    )}
                    {showBuyerSale && (
                      <div className="rounded-xl border border-border bg-card py-3 px-3 sm:py-2 sm:px-2 flex flex-col justify-center gap-2 min-h-[3.25rem] col-span-2 sm:col-span-1 shadow-sm" data-tour="harvest-buyer-sale-card">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CircleDollarSign className="h-4 w-4 shrink-0 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground">
                              Buyer sale · {(collectionFinancials.totalHarvestQty ?? 0).toFixed(1)} kg
                              {(selectedCollection.pricePerKgBuyer != null && selectedCollection.pricePerKgBuyer > 0) && (
                                <> @ {Number(selectedCollection.pricePerKgBuyer).toLocaleString()} Ksh</>
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowPaidAndProfit((v) => !v)}
                            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted touch-manipulation"
                            title={showPaidAndProfit ? 'Hide amounts' : 'Show amounts'}
                            aria-label={showPaidAndProfit ? 'Hide amounts' : 'Show amounts'}
                          >
                            {showPaidAndProfit ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-2 mt-0.5">
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Revenue</p>
                            <p className={cn('text-base sm:text-sm font-semibold tabular-nums', !showPaidAndProfit && 'select-none blur-sm')}>
                              {showPaidAndProfit ? `KES ${Number(totalRevenue ?? 0).toLocaleString()}` : '•••'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Profit</p>
                            <p className={cn('text-base sm:text-sm font-semibold tabular-nums', !showPaidAndProfit && 'select-none blur-sm', Number(profit ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                              {showPaidAndProfit ? `KES ${Number(profit ?? 0).toLocaleString()}` : '•••'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStatsExpanded((e) => !e)}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted touch-manipulation"
                  aria-expanded={statsExpanded}
                  title={statsExpanded ? 'Hide totals' : 'Show totals'}
                >
                  {statsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setQuickMode((q) => !q)}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold shadow-md border-2 transition-all touch-manipulation',
                      quickMode
                        ? 'bg-sky-500 text-white border-sky-600 ring-1 ring-sky-400/60'
                        : 'bg-muted/80 text-muted-foreground border-border hover:bg-muted'
                    )}
                    title={quickMode ? 'Quick Mode on' : 'Quick Mode off'}
                    aria-pressed={quickMode}
                    data-tour="harvest-quick-mode"
                  >
                    <Zap className="h-3.5 w-3.5 shrink-0" />
                    Quick Mode
                  </button>
                  {canViewFinancials && isFrenchBeansCollection && selectedCollection && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                          data-tour="harvest-wallet-btn"
                          onClick={() => {
                            setCashDialogCollection(selectedCollection as any);
                            setCashAmount('');
                            setCashSource('bank');
                            setCashDialogVisible(false);
                          }}
                        >
                          <Banknote className="h-3 w-3" />
                          <span>Wallet</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-80 md:w-[420px] text-sm bg-emerald-950/70 backdrop-blur-lg border-emerald-400/80 shadow-lg rounded-2xl text-emerald-50"
                        align="center"
                        side="bottom"
                      >
                        <div className="space-y-4 text-center py-3">
                          <div className="flex flex-col items-center gap-3">
                            <p className="text-xs font-semibold text-emerald-50">Harvest Cash Wallet</p>
                            <div className="flex flex-col items-center justify-center gap-2">
                              <p className="text-[11px] text-emerald-100">Amount paid out (this collection)</p>
                              <div className="flex items-center justify-center gap-2">
                                <p
                                  className={cn(
                                    'text-xl font-extrabold tabular-nums text-emerald-50',
                                    !cashDialogVisible && 'blur-sm select-none'
                                  )}
                                >
                                  KES {(Number(amountPaidOutThisCollection) || 0).toLocaleString()}
                                </p>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-800 text-emerald-50"
                                  onClick={() => setCashDialogVisible((v) => !v)}
                                >
                                  {cashDialogVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                              <p className="text-[11px] text-emerald-100">Remaining picker balance</p>
                              <p className={cn('text-sm font-semibold tabular-nums text-emerald-50', !cashDialogVisible && 'blur-sm select-none')}>
                                KES {(Number(collectionFinancials.pickerBalance) || 0).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </div>

            {detailModes.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Access restricted. Your account can view collections but cannot access intake, payout, or buyer actions.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-full">
                  <div className="flex flex-nowrap gap-2 sm:gap-3 overflow-x-auto pb-1 min-w-0 -mx-1 px-1 scrollbar-app">
                    {isAdminUser && canViewPickerEntries && (
                      <button
                        type="button"
                        onClick={() => setViewMode('view_pickers')}
                        className={cn(
                          'flex-shrink-0 min-h-11 sm:min-h-10 px-4 sm:px-5 rounded-xl font-semibold text-sm sm:text-xs flex items-center justify-center gap-2 shadow-md border-2 transition-all touch-manipulation active:scale-[0.98]',
                          viewMode === 'view_pickers'
                            ? 'bg-slate-700 text-white border-slate-800 ring-2 ring-slate-400/50'
                            : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200 dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700'
                        )}
                      >
                        <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                        View Pickers
                      </button>
                    )}
                    {isAdminUser && canViewBuyerSection && (
                      <button
                        type="button"
                        onClick={() => setViewMode('buyer')}
                        className={cn(
                          'flex-shrink-0 min-h-11 sm:min-h-10 px-4 sm:px-5 rounded-xl font-semibold text-sm sm:text-xs flex items-center justify-center gap-2 shadow-md border-2 transition-all touch-manipulation active:scale-[0.98]',
                          viewMode === 'buyer'
                            ? 'bg-violet-500 text-white border-violet-600 ring-2 ring-violet-400/50'
                            : 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800'
                        )}
                        data-tour="harvest-tab-buyer"
                      >
                        <ShoppingCart className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                        Buyer
                      </button>
                    )}
                    {canManageIntake && (
                      <button
                        type="button"
                        onClick={() => setViewMode('intake')}
                        className={cn(
                          'flex-shrink-0 min-h-11 sm:min-h-10 px-4 sm:px-5 rounded-xl font-semibold text-sm sm:text-xs flex items-center justify-center gap-2 shadow-md border-2 transition-all touch-manipulation active:scale-[0.98]',
                          viewMode === 'intake'
                            ? 'bg-emerald-500 text-white border-emerald-600 ring-2 ring-emerald-400/50'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
                        )}
                        data-tour="harvest-tab-intake"
                      >
                        <Scale className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                        Intake
                      </button>
                    )}
                    {canPayPickers && (
                      <button
                        type="button"
                        onClick={() => setViewMode('pay')}
                        className={cn(
                          'flex-shrink-0 min-h-11 sm:min-h-10 px-4 sm:px-5 rounded-xl font-semibold text-sm sm:text-xs flex items-center justify-center gap-2 shadow-md border-2 transition-all touch-manipulation active:scale-[0.98]',
                          viewMode === 'pay'
                            ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400/50'
                            : 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800'
                        )}
                        data-tour="harvest-tab-pay"
                      >
                        <Banknote className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                        Pay
                      </button>
                    )}
                    {!isAdminUser && canViewBuyerSection && (
                      <button
                        type="button"
                        onClick={() => setViewMode('buyer')}
                        className={cn(
                          'flex-shrink-0 min-h-11 sm:min-h-10 px-4 sm:px-5 rounded-xl font-semibold text-sm sm:text-xs flex items-center justify-center gap-2 shadow-md border-2 transition-all touch-manipulation active:scale-[0.98]',
                          viewMode === 'buyer'
                            ? 'bg-violet-500 text-white border-violet-600 ring-2 ring-violet-400/50'
                            : 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800'
                        )}
                        data-tour="harvest-tab-buyer"
                      >
                        <ShoppingCart className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                        Buyer
                      </button>
                    )}
                    {!isAdminUser && canViewPickerEntries && (
                      <button
                        type="button"
                        onClick={() => setViewMode('view_pickers')}
                        className={cn(
                          'flex-shrink-0 min-h-11 sm:min-h-10 px-4 sm:px-5 rounded-xl font-semibold text-sm sm:text-xs flex items-center justify-center gap-2 shadow-md border-2 transition-all touch-manipulation active:scale-[0.98]',
                          viewMode === 'view_pickers'
                            ? 'bg-slate-700 text-white border-slate-800 ring-2 ring-slate-400/50'
                            : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200 dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700'
                        )}
                      >
                        <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
                        View Pickers
                      </button>
                    )}
                  </div>

                  {canViewPickerEntries && (
                    <TabsContent value="view_pickers" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold text-foreground">View Pickers</h3>
                            <p className="text-xs text-muted-foreground">Read-only picker entries and totals.</p>
                          </div>
                          {isAdminUser && (
                            <div className="inline-flex items-center rounded-lg border border-border p-1 bg-muted/30">
                              <button
                                type="button"
                                onClick={() => setViewPickersLayout('list')}
                                className={cn(
                                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                                  viewPickersLayout === 'list'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                List
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewPickersLayout('cards')}
                                className={cn(
                                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                                  viewPickersLayout === 'cards'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                Cards
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input
                            value={viewPickersSearch}
                            onChange={(e) => setViewPickersSearch(e.target.value)}
                            className="pl-9 min-h-10"
                            placeholder="Search picker number (e.g. 69)"
                          />
                        </div>

                        {filteredViewPickerRows.length === 0 ? (
                          <div className="rounded-lg border border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>No picker entries match &quot;{viewPickersSearch}&quot;.</span>
                          </div>
                        ) : (
                          <>
                            {(isAdminUser ? viewPickersLayout : 'list') === 'cards' ? (
                              <div className="grid grid-cols-2 gap-2">
                                {filteredViewPickerRows.map((row) => {
                                  const expanded = expandedViewPickerIds.has(row.pickerId);
                                  return (
                                    <Card
                                      key={row.pickerId}
                                      className="relative min-h-[132px] flex flex-col overflow-hidden touch-manipulation rounded-xl"
                                    >
                                      <CardContent className="p-2 flex flex-col flex-1 justify-between min-h-0 text-center">
                                        <div className="absolute top-1 right-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedViewPickerIds((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(row.pickerId)) next.delete(row.pickerId);
                                                else next.add(row.pickerId);
                                                return next;
                                              })
                                            }
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted border border-border text-muted-foreground hover:text-foreground"
                                            aria-label={expanded ? `Collapse #${row.pickerNumber}` : `Expand #${row.pickerNumber}`}
                                          >
                                            {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                                          </button>
                                        </div>
                                        <div className="flex justify-center flex-shrink-0 pt-1">
                                          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold tabular-nums shadow-lg ring-2 ring-background">
                                            {row.pickerNumber}
                                          </div>
                                        </div>
                                        <div className="font-semibold text-foreground text-xs sm:text-sm leading-tight line-clamp-2 mt-1 px-1">
                                          {row.pickerName}
                                        </div>
                                        <div className="text-[11px] sm:text-xs font-semibold text-muted-foreground tabular-nums mt-0.5">
                                          {row.totalKg.toFixed(1)} kg
                                        </div>
                                        <div className="text-[11px] sm:text-xs font-semibold text-muted-foreground tabular-nums">
                                          KES {row.totalAmount.toLocaleString()}
                                        </div>
                                      </CardContent>
                                      {expanded && (
                                        <div className="border-t border-border">
                                          <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground">
                                            <span>Time</span>
                                            <span>Kg</span>
                                            <span>Amount</span>
                                          </div>
                                          <div className="max-h-56 overflow-y-auto">
                                            {row.entries.length === 0 ? (
                                              <p className="px-3 py-2 text-sm text-muted-foreground">No entries yet.</p>
                                            ) : (
                                              row.entries.map((entry) => (
                                                <div key={entry.rowKey} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm border-t border-border/70 first:border-t-0">
                                                  <span>{entry.timeLabel}</span>
                                                  <span className="tabular-nums">{entry.kg.toFixed(1)}</span>
                                                  <span className="tabular-nums">KES {entry.amount.toLocaleString()}</span>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </Card>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {filteredViewPickerRows.map((row) => {
                                  const expanded = expandedViewPickerIds.has(row.pickerId);
                                  return (
                                    <div key={row.pickerId} className="rounded-xl border border-border overflow-hidden bg-card">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedViewPickerIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(row.pickerId)) next.delete(row.pickerId);
                                            else next.add(row.pickerId);
                                            return next;
                                          })
                                        }
                                        className="w-full px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold tabular-nums shadow ring-2 ring-background shrink-0">
                                            {row.pickerNumber}
                                          </div>
                                          <p className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate">
                                            {row.pickerName}
                                          </p>
                                          <p className="text-xs sm:text-sm font-semibold text-muted-foreground tabular-nums shrink-0">
                                            {row.totalKg.toFixed(1)} kg
                                          </p>
                                          {expanded ? (
                                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                          )}
                                        </div>
                                      </button>
                                      {expanded && (
                                        <div className="border-t border-border">
                                          <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground">
                                            <span>Entry</span>
                                            <span>Kg</span>
                                            <span>Amount</span>
                                            <span>Time</span>
                                          </div>
                                          <div className="max-h-56 overflow-y-auto">
                                            {row.entries.length === 0 ? (
                                              <p className="px-3 py-2 text-sm text-muted-foreground">No entries yet.</p>
                                            ) : (
                                              row.entries.map((entry, index) => (
                                                <div key={entry.rowKey} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm border-t border-border/70 first:border-t-0">
                                                  <span className="tabular-nums">#{index + 1}</span>
                                                  <span className="tabular-nums">{entry.kg.toFixed(1)}</span>
                                                  <span className="tabular-nums">KES {entry.amount.toLocaleString()}</span>
                                                  <span>{entry.timeLabel}</span>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </TabsContent>
                  )}

                  {canManageIntake && (
                    <TabsContent value="intake" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
                      {quickMode ? (
                        <>
                          <div
                            ref={quickIntakeContainerRef}
                            style={{ scrollMarginBottom: 'min(20rem, 50vh)' }}
                          >
                            <div className="space-y-0.5">
                              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <Zap className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                Quick Intake
                              </h3>
                              <p className="text-xs text-muted-foreground max-w-sm">
                                Enter picker number and kg, then move to the next picker.
                              </p>
                            </div>

                            <div className="rounded-md border border-sky-200/80 dark:border-sky-800/80 bg-card shadow-sm p-3 space-y-3 mt-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label htmlFor="quick-intake-picker-num" className="text-sm font-medium text-foreground">
                                    Picker number
                                  </Label>
                                  <Input
                                    id="quick-intake-picker-num"
                                    ref={quickIntakePickerNumberRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={quickIntakePickerNumber}
                                    onChange={(e) => setQuickIntakePickerNumber(e.target.value)}
                                    onFocus={scrollQuickIntakeIntoView}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') quickIntakeKgRef.current?.focus();
                                    }}
                                    placeholder="e.g. 5"
                                    className="min-h-12 text-lg font-bold tabular-nums touch-manipulation rounded-md border border-input focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 transition-colors"
                                    autoFocus
                                    disabled={isSavingQuickIntake}
                                  />
                                  {quickIntakePickerNumber.trim() !== '' && (
                                    <div className="mt-1.5">
                                      {quickIntakePickerLookup.matchedPicker ? (
                                        <div className="rounded-md border border-sky-200 dark:border-sky-700 bg-sky-50/80 dark:bg-sky-950/40 px-2.5 py-1.5">
                                          <p className="text-sm font-semibold text-sky-900 dark:text-sky-100 truncate">
                                            #{quickIntakePickerLookup.matchedPicker.pickerNumber} {quickIntakePickerLookup.matchedPicker.pickerName}
                                          </p>
                                          <p className="text-xs text-muted-foreground mt-0.5">
                                            Trip #{quickIntakePickerLookup.nextTripNumber}
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/40 px-2.5 py-1.5">
                                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                                            Picker not found
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="quick-intake-kg" className="text-sm font-medium text-foreground">
                                    KG
                                  </Label>
                                  <Input
                                    id="quick-intake-kg"
                                    ref={quickIntakeKgRef}
                                    type="number"
                                    inputMode="decimal"
                                    min="0.1"
                                    step="0.1"
                                    value={quickIntakeKg}
                                    onChange={(e) => setQuickIntakeKg(e.target.value)}
                                    onFocus={scrollQuickIntakeIntoView}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !isSavingQuickIntake) void handleQuickIntakeNextPicker(false);
                                    }}
                                    placeholder="e.g. 4.5"
                                    className="min-h-12 text-xl font-bold tabular-nums touch-manipulation rounded-md border border-input focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20 transition-colors"
                                    disabled={isSavingQuickIntake}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <Button
                                  onClick={() => void handleQuickIntakeNextPicker(false)}
                                  disabled={
                                    isSavingQuickIntake ||
                                    !quickIntakePickerNumber.trim() ||
                                    !quickIntakeKg.trim() ||
                                    selectedCollection?.status === 'closed' ||
                                    (quickIntakePickerNumber.trim() !== '' && !quickIntakePickerLookup.matchedPicker)
                                  }
                                  className="min-h-12 w-full font-bold text-sm bg-sky-600 hover:bg-sky-700 active:scale-[0.99] rounded-md shadow-sm touch-manipulation"
                                >
                                  {isSavingQuickIntake ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  Next Picker
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => void handleQuickIntakeNextPicker(true)}
                                  disabled={
                                    isSavingQuickIntake ||
                                    !quickIntakePickerNumber.trim() ||
                                    !quickIntakeKg.trim() ||
                                    selectedCollection?.status === 'closed' ||
                                    (quickIntakePickerNumber.trim() !== '' && !quickIntakePickerLookup.matchedPicker)
                                  }
                                  className="min-h-10 sm:min-h-12 sm:flex-shrink-0 font-medium rounded-md border-sky-300 text-sky-800 dark:border-sky-700 dark:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/30 touch-manipulation"
                                >
                                  {isSavingQuickIntake ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  Save & Stay
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <h4 className="text-sm font-semibold text-foreground">Entries</h4>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                Entered: <strong className="text-foreground">{uniqueEnteredPickersCount}</strong>
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                Remaining: <strong className="text-foreground">{remainingPickersCount}</strong>
                              </span>
                            </div>
                            <div className="space-y-1 max-h-[280px] overflow-y-auto overscroll-contain scrollbar-app">
                              {quickIntakeEntriesByPicker.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-3 text-center rounded-md border border-dashed border-border">
                                  No entries yet.
                                </p>
                              ) : (
                                quickIntakeEntriesByPicker.map((group) => {
                                  const isExpanded = expandedQuickIntakePickerId === group.pickerId;
                                  return (
                                    <div key={group.pickerId} className="rounded-md border border-border bg-card overflow-hidden">
                                      <button
                                        type="button"
                                        className="w-full px-2.5 py-2 flex items-center gap-2 min-w-0 text-left hover:bg-muted/50 active:bg-muted/70 transition-colors"
                                        onClick={() => setExpandedQuickIntakePickerId((id) => (id === group.pickerId ? null : group.pickerId))}
                                      >
                                        <span className="text-sm font-bold tabular-nums text-foreground shrink-0">#{group.pickerNumber}</span>
                                        <span className="text-sm text-foreground truncate min-w-0 flex-1">{group.pickerName}</span>
                                        <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                                          {group.totalKg.toFixed(1)} kg
                                        </span>
                                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                          {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                                        </span>
                                        <span className={cn('shrink-0 transition-transform', isExpanded && 'rotate-180')}>
                                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        </span>
                                      </button>
                                      {isExpanded && (() => {
                                        const pickerRate = Number(selectedCollection?.pricePerKgPicker ?? 0) || 20;
                                        return (
                                          <div className="border-t border-border bg-muted/20">
                                            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2.5 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50">
                                              <span>Entry</span>
                                              <span>KG</span>
                                              {canViewFinancials && <span>Price</span>}
                                              <span>Time</span>
                                              <span className="w-14" />
                                            </div>
                                            {group.entries.map((entry, idx) => {
                                              const price = Math.round(entry.kg * pickerRate);
                                              const timeStr = entry.recordedAt != null ? format(toDate(entry.recordedAt) ?? new Date(), 'h:mm a') : '—';
                                              return (
                                                <div
                                                  key={entry.id}
                                                  className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2.5 py-1.5 items-center text-sm min-w-0 pl-4 border-b border-border last:border-b-0"
                                                >
                                                  <span className="tabular-nums text-muted-foreground">{idx + 1}</span>
                                                  <span className="tabular-nums text-foreground">{entry.kg.toFixed(1)} kg</span>
                                                  {canViewFinancials && (
                                                    <span className="tabular-nums text-foreground">KES {price}</span>
                                                  )}
                                                  <span className="text-xs text-muted-foreground tabular-nums">{timeStr}</span>
                                                  {(canManageIntake || canDeleteIntakeEntry) && selectedCollection?.status !== 'closed' ? (
                                                    <div className="flex items-center justify-end gap-0.5 w-14">
                                                      {canManageIntake && (
                                                        <Button
                                                          type="button"
                                                          variant="ghost"
                                                          size="sm"
                                                          className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                                                          onClick={(ev) => {
                                                            ev.stopPropagation();
                                                            setEditIntakeEntry({
                                                              id: entry.id,
                                                              pickerId: entry.pickerId,
                                                              pickerNumber: entry.pickerNumber,
                                                              pickerName: entry.pickerName,
                                                              kg: entry.kg,
                                                              collectionId: entry.collectionId,
                                                            });
                                                            setEditIntakePickerId(entry.pickerId);
                                                            setEditIntakeKg(String(entry.kg));
                                                          }}
                                                          aria-label="Edit entry"
                                                        >
                                                          <Pencil className="h-3 w-3" />
                                                        </Button>
                                                      )}
                                                      {canDeleteIntakeEntry && (
                                                        <Button
                                                          type="button"
                                                          variant="ghost"
                                                          size="sm"
                                                          className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                                          onClick={(ev) => {
                                                            ev.stopPropagation();
                                                            handleDeleteIntakeEntryClick({ id: entry.id, collectionId: entry.collectionId });
                                                          }}
                                                          aria-label="Delete entry"
                                                        >
                                                          <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <span className="w-14" />
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 items-stretch">
                            <Button
                              size="sm"
                              className="min-h-9 rounded-lg touch-manipulation flex-shrink-0 text-xs"
                              disabled={selectedCollection?.status === 'closed'}
                              data-tour="harvest-add-picker"
                              onClick={() => {
                                setNewPickerNumber(String(nextPickerNumber));
                                setAddPickerOpen(true);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1.5" />
                              Add picker
                            </Button>
                            {lastWeighPickerId && pickersForCollection.some((x) => x.id === lastWeighPickerId) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-9 rounded-lg touch-manipulation flex-shrink-0 text-xs border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700"
                                disabled={selectedCollection?.status === 'closed'}
                                onClick={() => {
                                  const p = pickersForCollection.find((x) => x.id === lastWeighPickerId);
                                  if (!p) return;
                                  setWeighPickerId(p.id);
                                  setWeighTrip(String(nextTripForPicker[p.id] ?? 1));
                                  setWeighKg('');
                                  setWeighOpenedFromCard(true);
                                  setAddWeighOpen(true);
                                }}
                              >
                                Repeat last
                              </Button>
                            )}
                            {pickersForCollection.length > 0 && (
                              <div className="relative max-w-xs flex-1 min-w-[180px]">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                  placeholder="Search name or number..."
                                  value={pickerSearch}
                                  onChange={(e) => setPickerSearch(e.target.value)}
                                  className="pl-7 min-h-9 rounded-lg text-sm bg-muted/50 border-muted-foreground/20 w-full"
                                />
                              </div>
                            )}
                          </div>
                          <div data-tour="harvest-picker-cards" className="min-h-[80px]">
                            {pickersForCollection.length === 0 ? (
                              <p className="text-muted-foreground text-sm">Add pickers, then tap a card to add weight.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  {filteredPickers.length === 0 ? (
                                    <p className="col-span-2 text-muted-foreground text-sm">No picker matches &quot;{pickerSearch}&quot;</p>
                                  ) : (
                                    filteredPickers.map((p) => {
                                    const tripCount = tripCountForPicker[p.id] ?? 0;
                                    const nextTrip = nextTripForPicker[p.id] ?? 1;
                                    const isPaid = p.isPaid;
                                    const pickerTotals = getPickerTotals(p.id);
                                    return (
                                      <Card
                                        key={p.id}
                                        className="relative transition-all min-h-[132px] flex flex-col overflow-hidden touch-manipulation rounded-xl cursor-pointer hover:bg-muted/50 active:scale-[0.98]"
                                        onClick={() => {
                                          setWeighPickerId(p.id);
                                          setWeighTrip(String(nextTrip));
                                          setWeighKg('');
                                          setWeighOpenedFromCard(true);
                                          setAddWeighOpen(true);
                                          setRecentPickerIds((prev) => {
                                            const next = [p.id, ...prev.filter((id) => id !== p.id)].slice(0, 10);
                                            return next;
                                          });
                                        }}
                                      >
                                        <CardContent className="p-2 flex flex-col flex-1 justify-between min-h-0 text-center">
                                          <div className="absolute top-1 right-1 px-1.5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
                                            {tripCount}
                                          </div>
                                          <div className="flex justify-center flex-shrink-0 pt-1">
                                            <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold tabular-nums shadow-lg ring-2 ring-background">
                                              {p.pickerNumber}
                                            </div>
                                          </div>
                                          <div className="font-semibold text-foreground text-xs sm:text-sm leading-tight line-clamp-2 mt-1">
                                            {p.pickerName}
                                          </div>
                                          <div className="text-[11px] sm:text-xs font-semibold text-muted-foreground tabular-nums mt-0.5">
                                            {pickerTotals.totalKg.toFixed(1)} kg
                                            {canViewPaymentAmounts ? ` - KES ${pickerTotals.totalPay.toLocaleString()}` : ''}
                                          </div>
                                          <div className="flex flex-col items-center gap-0.5">
                                            {isPaid && (
                                              <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                                PAID
                                              </span>
                                            )}
                                            <div className={cn(
                                              'text-[10px] border-t border-border pt-1.5 mt-1',
                                              isPaid ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'
                                            )}>
                                              {isPaid ? 'View' : '+ add'}
                                            </div>
                                          </div>
                                          {tripOverrideMessageForPicker[p.id] && (
                                            <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 text-center leading-tight">
                                              {tripOverrideMessageForPicker[p.id]}
                                            </p>
                                          )}
                                        </CardContent>
                                      </Card>
                                    );
                                  })
                                )}
                              </div>
                            </>
                          )}
                          </div>
                        </>
                      )}
                    </TabsContent>
                  )}

                  {canPayPickers && (
                    <TabsContent value="pay" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
                      {quickMode ? (
                        <>
                          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 space-y-2">
                            <button
                              type="button"
                              onClick={() => setQuickPaySummaryExpanded((e) => !e)}
                              className="w-full flex items-center justify-between gap-2 text-left rounded-md hover:bg-amber-100/50 dark:hover:bg-amber-900/20 -mx-1 px-1 py-0.5 transition-colors"
                              aria-expanded={quickPaySummaryExpanded}
                              title={quickPaySummaryExpanded ? 'Hide summary' : 'Show summary'}
                            >
                              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                                <Banknote className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                Quick Pay
                              </h3>
                              {quickPaySummaryExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                            </button>
                            {quickPaySummaryExpanded && (
                              <>
                                <p className="text-sm text-muted-foreground">
                                  Pay pickers in number order. Use Pay Full or Pay Partial, then move to the next unpaid picker.
                                </p>
                                {quickPayQueue.length === 0 ? (
                                  <p className="text-sm font-medium text-foreground">No unpaid pickers — queue is empty.</p>
                                ) : (
                                  <p className="text-sm font-medium text-foreground tabular-nums">
                                    {quickPayQueue.length} picker{quickPayQueue.length !== 1 ? 's' : ''} in queue · KES{' '}
                                    {(collectionFinancials.pickerBalance ?? 0).toLocaleString()} remaining
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          {pickersForCollection.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <Input
                                type="text"
                                placeholder="Search by picker number or name..."
                                value={quickPaySearch}
                                onChange={(e) => setQuickPaySearch(e.target.value)}
                                className="min-h-10 rounded-lg border-border bg-background"
                              />
                            </div>
                          )}

                          <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-4 relative">
                            {quickPayPickerId && pickersForCollection.some((p) => p.id === quickPayPickerId) && (() => {
                              const picker = pickersForCollection.find((p) => p.id === quickPayPickerId);
                              if (!picker) return null;
                              const queueRow = quickPayQueueFiltered.find((q) => q.pickerId === quickPayPickerId);
                              const pickerRate = Number(selectedCollection?.pricePerKgPicker ?? 0) || 20;
                              const due = queueRow?.totalDue ?? getPickerTotals(quickPayPickerId).totalPay;
                              const paid = queueRow?.totalPaid ?? ((paidByPickerId[quickPayPickerId] ?? 0) + (quickPayLocalPaidByPickerId[quickPayPickerId] ?? 0));
                              const balance = Math.max(0, queueRow?.balance ?? (due - paid));
                              const remainingKg = pickerRate > 0 ? balance / pickerRate : 0;

                              const toTime = (t: any): number => {
                                if (t == null) return 0;
                                if (typeof t === 'object' && 'toMillis' in t) return (t as { toMillis: () => number }).toMillis();
                                if (t instanceof Date) return t.getTime();
                                return Number(t) || 0;
                              };

                              const entries = weighEntriesForCollection
                                .filter((e) => String(e.pickerId ?? '') === quickPayPickerId)
                                .slice()
                                .sort((a, b) => toTime(b.recordedAt) - toTime(a.recordedAt))
                                .map((e, idx) => {
                                  const kg = Number(e.weightKg ?? 0);
                                  const amt = Math.round(kg * pickerRate);
                                  const timeStr = e.recordedAt != null ? format(toDate(e.recordedAt) ?? new Date(), 'h:mm a') : '—';
                                  return {
                                    rowKey: e.id ?? `qp-${idx}`,
                                    entryId: e.id ?? '',
                                    collectionId: e.collectionId,
                                    kg,
                                    amount: amt,
                                    timeStr,
                                    pickerId: e.pickerId,
                                  };
                                })
                                .filter((x) => Number.isFinite(x.kg) && x.kg > 0);

                              const isPaid = balance <= 0;

                              return (
                                <>
                                  {isPaid && (
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 rounded-lg overflow-hidden">
                                      <span className="text-6xl font-black text-muted-foreground/25 rotate-[-18deg] select-none">
                                        PAID
                                      </span>
                                    </div>
                                  )}
                                  <div className={cn('flex flex-col items-center text-center gap-2', isPaid && 'opacity-90')}>
                                    <div className="h-14 w-14 rounded-full bg-emerald-600 text-emerald-50 flex items-center justify-center text-2xl font-extrabold tabular-nums shadow">
                                      {picker.pickerNumber}
                                    </div>
                                    <p className="text-base font-semibold text-foreground leading-tight truncate w-full">
                                      #{picker.pickerNumber} {picker.pickerName}
                                    </p>
                                  </div>

                                  <div className={cn('rounded-lg border border-border bg-muted/30 p-3', isPaid && 'opacity-90')}>
                                    <p className="text-xs text-muted-foreground">Balance</p>
                                    <p className="text-2xl font-extrabold tabular-nums text-foreground">KES {balance.toLocaleString()}</p>
                                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                                      ({remainingKg.toFixed(1)} kg remaining)
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                      <div className="rounded-md bg-background/60 border border-border p-2">
                                        <p className="text-[10px] text-muted-foreground uppercase">Total due</p>
                                        <p className="font-semibold tabular-nums">KES {due.toLocaleString()}</p>
                                      </div>
                                      <div className="rounded-md bg-background/60 border border-border p-2">
                                        <p className="text-[10px] text-muted-foreground uppercase">Paid</p>
                                        <p className="font-semibold tabular-nums">KES {paid.toLocaleString()}</p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className={cn('space-y-2', isPaid && 'opacity-90')}>
                                    <div className="grid grid-cols-2 gap-2">
                                      <Button
                                        onClick={() => handleQuickPaySubmit(balance)}
                                        disabled={quickPaySaving || isPaid}
                                        className="min-h-12 w-full font-semibold touch-manipulation"
                                      >
                                        {quickPaySaving ? (
                                          <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Saving…
                                          </>
                                        ) : (
                                          'Pay Full'
                                        )}
                                      </Button>
                                      <Button
                                        variant="outline"
                                        onClick={() => {
                                          setQuickPayPartialBalance(balance);
                                          setQuickPayAmount('');
                                          setQuickPayPartialOpen(true);
                                        }}
                                        disabled={quickPaySaving || isPaid}
                                        className="min-h-12 w-full font-semibold touch-manipulation"
                                      >
                                        Pay Partial
                                      </Button>
                                    </div>
                                    <Button
                                      variant="outline"
                                      onClick={handleQuickPaySkip}
                                      disabled={quickPaySaving || isPaid}
                                      className="min-h-12 w-full touch-manipulation"
                                    >
                                      Skip
                                    </Button>
                                  </div>

                                  {quickPayPartialOpen && (
                                    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                                      <Label htmlFor="quick-pay-partial-amount-inline">Enter amount (KES)</Label>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        Max: KES {quickPayPartialBalance.toLocaleString()}
                                      </p>
                                      <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                                        Remaining after pay: KES{' '}
                                        {Math.max(0, quickPayPartialBalance - Math.round(Number(quickPayAmount || '0'))).toLocaleString()}
                                      </p>
                                      <Input
                                        id="quick-pay-partial-amount-inline"
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={quickPayPartialBalance}
                                        value={quickPayAmount}
                                        onChange={(e) => setQuickPayAmount(e.target.value)}
                                        className="mt-1 min-h-11 text-base font-semibold tabular-nums touch-manipulation"
                                        autoFocus
                                      />
                                      <div className="flex gap-2 mt-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => {
                                            setQuickPayPartialOpen(false);
                                            setQuickPayAmount('');
                                            setQuickPayPartialBalance(0);
                                          }}
                                          disabled={quickPaySaving}
                                          className="min-h-10 flex-1 touch-manipulation"
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          type="button"
                                          onClick={async () => {
                                            const raw = Math.round(Number(quickPayAmount || '0'));
                                            const amt =
                                              quickPayPartialBalance > 0 ? Math.min(raw, quickPayPartialBalance) : raw;
                                            if (amt <= 0) {
                                              toast({
                                                title: 'Invalid amount',
                                                description: 'Enter an amount greater than 0.',
                                                variant: 'destructive',
                                              });
                                              return;
                                            }
                                            await handleQuickPaySubmit(amt);
                                            setQuickPayPartialOpen(false);
                                            setQuickPayAmount('');
                                            setQuickPayPartialBalance(0);
                                          }}
                                          disabled={quickPaySaving || !quickPayAmount || Number(quickPayAmount) <= 0}
                                          className="min-h-10 flex-1 font-semibold touch-manipulation"
                                        >
                                          {quickPaySaving ? (
                                            <>
                                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                              Paying…
                                            </>
                                          ) : (
                                            'Confirm'
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <p className="text-sm font-semibold text-foreground">Entries</p>
                                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                                      {entries.length === 0 ? (
                                        <p className="text-sm text-muted-foreground px-3 py-3">No intake entries yet.</p>
                                      ) : (
                                        <div className="max-h-[220px] overflow-y-auto scrollbar-app">
                                          {entries.map((e, idx) => (
                                            <div
                                              key={e.rowKey}
                                              className="px-3 py-2 border-b border-border last:border-b-0 flex items-center gap-3 flex-wrap"
                                            >
                                              <span className="text-sm tabular-nums text-foreground shrink-0">
                                                {e.kg.toFixed(1)} kg
                                              </span>
                                              <span className="text-sm tabular-nums font-semibold text-foreground shrink-0">
                                                {e.amount}
                                              </span>
                                              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                                {e.timeStr}
                                              </span>
                                              <span className="flex-1 min-w-0" />
                                              {(canManageIntake || canDeleteIntakeEntry) && selectedCollection?.status !== 'closed' && (
                                                <>
                                                  {canManageIntake && (
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                                                      onClick={() => {
                                                        setEditIntakeEntry({
                                                          id: e.entryId,
                                                          pickerId: e.pickerId,
                                                          pickerNumber: picker?.pickerNumber ?? '?',
                                                          pickerName: picker?.pickerName ?? '—',
                                                          kg: e.kg,
                                                          collectionId: e.collectionId,
                                                        });
                                                        setEditIntakePickerId(e.pickerId);
                                                        setEditIntakeKg(String(e.kg));
                                                      }}
                                                      aria-label="Edit entry"
                                                    >
                                                      <Pencil className="h-3 w-3" />
                                                    </Button>
                                                  )}
                                                  {canDeleteIntakeEntry && (
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                                      onClick={() => handleDeleteIntakeEntryClick({ id: e.entryId, collectionId: e.collectionId })}
                                                      aria-label="Delete entry"
                                                    >
                                                      <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                            {!(quickPayPickerId && pickersForCollection.some((p) => p.id === quickPayPickerId)) && (
                              <>
                                <div className="flex flex-col items-center text-center gap-2 opacity-70">
                                  <div className="h-14 w-14 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-2xl font-extrabold tabular-nums shadow-inner">
                                    –
                                  </div>
                                  <p className="text-base font-semibold text-muted-foreground leading-tight">
                                    {(quickPaySearch ?? '').trim()
                                      ? 'No pickers match your search'
                                      : 'No unpaid pickers in queue'}
                                  </p>
                                </div>

                                <div className="rounded-lg border border-border bg-muted/30 p-3 opacity-70">
                                  <p className="text-xs text-muted-foreground">Balance</p>
                                  <p className="text-2xl font-extrabold tabular-nums text-muted-foreground">KES 0</p>
                                  <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                                    (0.0kg remaining)
                                  </p>
                                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                    <div className="rounded-md bg-background/60 border border-border p-2">
                                      <p className="text-[10px] text-muted-foreground uppercase">Total due</p>
                                      <p className="font-semibold tabular-nums text-muted-foreground">KES 0</p>
                                    </div>
                                    <div className="rounded-md bg-background/60 border border-border p-2">
                                      <p className="text-[10px] text-muted-foreground uppercase">Paid</p>
                                      <p className="font-semibold tabular-nums text-muted-foreground">KES 0</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2 opacity-70">
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      disabled
                                      className="min-h-12 w-full font-semibold touch-manipulation"
                                    >
                                      Pay Full
                                    </Button>
                                    <Button
                                      variant="outline"
                                      disabled
                                      className="min-h-12 w-full font-semibold touch-manipulation"
                                    >
                                      Pay Partial
                                    </Button>
                                  </div>
                                  <Button
                                    variant="outline"
                                    disabled
                                    className="min-h-12 w-full touch-manipulation"
                                  >
                                    Skip
                                  </Button>
                                </div>

                                <div className="space-y-2 opacity-70">
                                  <p className="text-sm font-semibold text-muted-foreground">Entries</p>
                                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                                    <p className="text-sm text-muted-foreground px-3 py-3">No intake entries yet.</p>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {payUnpaidAndGroups.unpaid.length > 0 && (
                            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="font-medium text-muted-foreground">
                                Unpaid: {payUnpaidAndGroups.unpaid.length} picker{payUnpaidAndGroups.unpaid.length !== 1 ? 's' : ''}
                              </span>
                              <span className="tabular-nums font-semibold text-foreground">
                                KES {(collectionFinancials.pickerBalance ?? 0).toLocaleString()} remaining
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                Paid out: KES {(collectionFinancials.totalPaidOut ?? 0).toLocaleString()}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            {pickersForCollection.length > 0 && (
                              <div className="relative max-w-xs">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                  placeholder="Search name or number..."
                                  value={pickerSearch}
                                  onChange={(e) => setPickerSearch(e.target.value)}
                                  className="pl-7 min-h-9 rounded-lg text-sm bg-muted/50 border-muted-foreground/20"
                                />
                              </div>
                            )}
                            {paySelectedIds.size > 0 && (
                              <Button
                                size="sm"
                                className="min-h-9 rounded-lg font-semibold"
                                onClick={() => handleMarkMultiplePaid(Array.from(paySelectedIds))}
                              >
                                Pay selected ({paySelectedIds.size}) — KES {selectedTotalPay.toLocaleString()}
                              </Button>
                            )}
                          </div>
                          <div className="space-y-4">
                            {pickersForCollection.length === 0 ? (
                              <p className="w-full text-muted-foreground text-sm">Add pickers in Intake first.</p>
                            ) : filteredPickersForPay.length === 0 ? (
                              <p className="w-full text-muted-foreground text-sm">No picker matches &quot;{pickerSearch}&quot;</p>
                            ) : (
                              <>
                                {unpaidPickersByBalance.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Unpaid (tap to pay)</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {unpaidPickersByBalance.map((p) => {
                                        const isPaying = payingPickerIds?.has(p.id);
                                        const selected = paySelectedIds.has(p.id);
                                        const tripCount = tripCountForPicker[p.id] ?? 0;
                                        const pickerTotals = getPickerTotals(p.id);
                                        const paid = paidByPickerId[p.id] ?? 0;
                                        const balance = Math.max(0, pickerTotals.totalPay - paid);
                                        return (
                                          <Card
                                            key={p.id}
                                            className={cn(
                                              'relative min-h-[132px] flex flex-col overflow-hidden transition-all active:scale-[0.98] cursor-pointer hover:bg-muted/50 bg-card touch-manipulation rounded-xl',
                                              selected && 'ring-2 ring-primary ring-offset-2',
                                              quickPayOpen && quickPayPickerId === p.id && 'ring-2 ring-amber-500 ring-offset-2',
                                              isPaying && 'ring-2 ring-amber-500 ring-offset-2 bg-amber-50/50 dark:bg-amber-950/20'
                                            )}
                                            onClick={() => !isPaying && openQuickPay(p.id)}
                                          >
                                            <CardContent className="p-2 flex flex-col flex-1 justify-between min-h-0 text-center">
                                              <div className="absolute top-1 right-1 flex items-center gap-1">
                                                <input
                                                  type="checkbox"
                                                  checked={selected}
                                                  onChange={(e) => { e.stopPropagation(); togglePaySelection(p.id); }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="rounded border-input h-4 w-4"
                                                  aria-label={`Select ${p.pickerName} for batch pay`}
                                                />
                                                <span className="px-1.5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
                                                  {tripCount}
                                                </span>
                                              </div>
                                              <div className="flex justify-center flex-shrink-0 pt-1">
                                                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold tabular-nums shadow-lg ring-2 ring-background">
                                                  {p.pickerNumber}
                                                </div>
                                              </div>
                                              <div className="font-medium text-foreground text-xs leading-tight line-clamp-2 mt-1">
                                                {p.pickerName}
                                              </div>
                                              <div className="border-t border-border pt-1.5 mt-1 space-y-0.5">
                                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                                  {pickerTotals.totalKg.toFixed(1)} kg · KES {pickerTotals.totalPay.toLocaleString()} due
                                                </div>
                                                {paid > 0 && (
                                                  <div className="text-[10px] text-muted-foreground tabular-nums">
                                                    Paid KES {paid.toLocaleString()} · balance KES {balance.toLocaleString()}
                                                  </div>
                                                )}
                                                {paid === 0 && (
                                                  <div className="text-base font-bold text-foreground tabular-nums">
                                                    KES {balance.toLocaleString()}
                                                  </div>
                                                )}
                                              </div>
                                              <div className="min-h-8 flex items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 font-medium text-[10px] pt-1 touch-manipulation">
                                                {isPaying ? (
                                                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                                    Paying…
                                                  </span>
                                                ) : `Tap to pay · KES ${balance.toLocaleString()}`}
                                              </div>
                                              {tripOverrideMessageForPicker[p.id] && (
                                                <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 text-center leading-tight">
                                                  {tripOverrideMessageForPicker[p.id]}
                                                </p>
                                              )}
                                            </CardContent>
                                          </Card>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {payUnpaidAndGroups.individuals.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Individuals</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {payUnpaidAndGroups.individuals.map(({ label, pickers }) => {
                                        const p = pickers[0];
                                        const tripCount = tripCountForPicker[p.id] ?? 0;
                                        const pickerTotals = getPickerTotals(p.id);
                                        return (
                                          <Card
                                            key={p.id}
                                            className="relative aspect-square flex flex-col overflow-hidden bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                          >
                                            <CardContent className="p-2 flex flex-col flex-1 justify-between min-h-0 text-center">
                                              <div className="absolute top-1 right-1 px-1.5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold tabular-nums text-foreground">
                                                {tripCount}
                                              </div>
                                              <div className="flex justify-center flex-shrink-0 pt-1">
                                                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base font-bold tabular-nums shadow ring-2 ring-background">
                                                  {p.pickerNumber}
                                                </div>
                                              </div>
                                              <p className="font-medium text-foreground text-xs leading-tight line-clamp-2 mt-0.5">{p.pickerName}</p>
                                              <div className="border-t border-border pt-1 mt-1 space-y-0.5">
                                                <div className="text-sm font-bold text-foreground tabular-nums leading-none">
                                                  KES {pickerTotals.totalPay.toLocaleString()}
                                                </div>
                                                <div className="inline-flex items-center justify-center gap-0.5 text-[10px] text-green-700 dark:text-green-400 font-medium">
                                                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                                                  <span>PAID</span>
                                                </div>
                                              </div>
                                            </CardContent>
                                          </Card>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {payUnpaidAndGroups.groups.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Groups</p>
                                    <div className="grid grid-cols-2 gap-3">
                                      {payUnpaidAndGroups.groups.map(({ label, pickers }) => (
                                        <div
                                          key={label}
                                          className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-2 min-w-0"
                                        >
                                          <p className="text-xs font-semibold text-foreground mb-2 text-center">{label}</p>
                                          <div className="grid grid-cols-2 gap-2">
                                            {pickers.map((p) => {
                                              const tripCount = tripCountForPicker[p.id] ?? 0;
                                              const pickerTotals = getPickerTotals(p.id);
                                              return (
                                                <Card
                                                  key={p.id}
                                                  className="relative aspect-square flex flex-col overflow-hidden bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                                >
                                                  <CardContent className="p-1.5 flex flex-col flex-1 justify-between min-h-0 text-center">
                                                    <div className="absolute top-0.5 right-0.5 px-1 h-4 rounded-full bg-muted border border-border flex items-center justify-center text-[9px] font-bold tabular-nums text-foreground">
                                                      {tripCount}
                                                    </div>
                                                    <div className="flex justify-center flex-shrink-0">
                                                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold tabular-nums shadow ring-2 ring-background">
                                                        {p.pickerNumber}
                                                      </div>
                                                    </div>
                                                    <p className="font-medium text-foreground text-[10px] leading-tight line-clamp-2">{p.pickerName}</p>
                                                    <div className="text-[10px] font-bold tabular-nums text-foreground">
                                                      KES {pickerTotals.totalPay.toLocaleString()}
                                                    </div>
                                                    <div className="inline-flex items-center justify-center gap-0.5 text-[9px] text-green-700 dark:text-green-400 font-medium">
                                                      <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                                      <span>PAID</span>
                                                    </div>
                                                  </CardContent>
                                                </Card>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </TabsContent>
                  )}

                  {canViewBuyerSection && (
                    <TabsContent value="buyer" className="mt-4 space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Buyer sale</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {selectedCollection.status === 'closed' && (
                            <div className="space-y-1 text-sm text-muted-foreground">
                              {selectedCollection.pricePerKgBuyer != null && selectedCollection.pricePerKgBuyer > 0 && (
                                <p>Price they bought with: <strong className="text-foreground">KES {Number(selectedCollection.pricePerKgBuyer).toLocaleString()} per kg</strong></p>
                              )}
                              {canViewFinancials ? (
                                <p>Revenue and profit are in the Buyer sale card when the sale is complete. Paid out is in the Wallet button above.</p>
                              ) : (
                                <p>Buyer pricing is shown here. Financial totals are restricted for your account.</p>
                              )}
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label>Price per kg (buyer) — KES</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 180"
                              value={buyerPricePerKg}
                              onChange={(e) => setBuyerPricePerKg(e.target.value)}
                              className="text-lg min-h-12 rounded-xl"
                              disabled={selectedCollection.status === 'closed'}
                            />
                          </div>
                          {selectedCollection.status !== 'closed' && Number(buyerPricePerKg || 0) > 0 && (
                            <div className="space-y-1 text-sm">
                              <p>
                                Total revenue: <strong>KES {(Number(totalRevenue) || 0).toLocaleString()}</strong>
                              </p>
                              <p>
                                Total paid out: <strong>KES {(Number(collectionFinancials.totalPaidOut) || 0).toLocaleString()}</strong>
                              </p>
                              <p>
                                Profit: <strong className={(Number(profit) || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  KES {(Number(profit) || 0).toLocaleString()}
                                </strong>
                              </p>
                            </div>
                          )}
                          {selectedCollection.status !== 'closed' && (
                            <>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <Button
                                  size="lg"
                                  variant="outline"
                                  className="min-h-12 rounded-xl flex-1"
                                  disabled={!buyerPricePerKg || markingBuyerPaid}
                                  onClick={() => handleSetBuyerPrice(false)}
                                >
                                  Save buyer price
                                </Button>
                                <Button
                                  size="lg"
                                  className="min-h-12 rounded-xl flex-1 bg-green-600 hover:bg-green-700"
                                  disabled={!buyerPricePerKg || markingBuyerPaid || !canCloseHarvest}
                                  onClick={() => handleSetBuyerPrice(true)}
                                >
                                  MARK BUYER PAID
                                </Button>
                              </div>
                              {hasOutstandingPickerBalances && pickersForCollection.length > 0 && (
                                <p className="text-amber-600 dark:text-amber-400 text-sm">
                                  Buyer can be marked as paid even if some pickers still have outstanding balances. Remember
                                  to finish picker payouts later.
                                </p>
                              )}
                              {!canCloseHarvest && (
                                <p className="text-muted-foreground text-sm">
                                  You can save buyer pricing, but only users with close access can mark buyer paid.
                                </p>
                              )}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  )}
                </Tabs>
              </>
            )}
          </div>
        ) : null}

        {/* Edit recent intake entry dialog */}
        <Dialog
          open={!!editIntakeEntry}
          onOpenChange={(open) => {
            if (!open) {
              setEditIntakeEntry(null);
              setEditIntakePickerId('');
              setEditIntakeKg('');
            }
          }}
        >
          <DialogContent className="w-full max-w-sm rounded-2xl mx-2">
            <DialogHeader>
              <DialogTitle>Edit entry</DialogTitle>
              <DialogDescription>Change picker or weight. Totals will update after save.</DialogDescription>
            </DialogHeader>
            {editIntakeEntry && (
              <div className="space-y-4 py-2">
                <div>
                  <Label>Picker</Label>
                  <UiSelect
                    value={editIntakePickerId}
                    onValueChange={setEditIntakePickerId}
                  >
                    <SelectTrigger className="mt-1 min-h-11 rounded-xl">
                      <SelectValue placeholder="Select picker" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickersForCollection.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          #{p.pickerNumber} {p.pickerName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </UiSelect>
                </div>
                <div>
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    step="0.1"
                    value={editIntakeKg}
                    onChange={(e) => setEditIntakeKg(e.target.value)}
                    placeholder="e.g. 5.2"
                    className="mt-1 min-h-11 rounded-xl"
                  />
                </div>
                <DialogFooter className="gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditIntakeEntry(null);
                      setEditIntakePickerId('');
                      setEditIntakeKg('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSaveEditIntake()}
                    disabled={editIntakeSaving || !editIntakePickerId || !editIntakeKg.trim()}
                  >
                    {editIntakeSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin shrink-0 mr-2" />
                        Saving…
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* New collection dialog */}
        <Dialog
          open={newCollectionOpen}
          onOpenChange={(open) => {
            if (creating && !open) return;
            setNewCollectionOpen(open);
            if (!open) {
              setAutoSuggestedCollectionName('');
              newCollectionNameDirtyRef.current = false;
              setNewCollectionName('');
            }
          }}
        >
          <DialogContent className="w-full max-w-sm sm:max-w-md rounded-2xl mx-2 max-h-[85vh] sm:max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
              <DialogTitle>New collection</DialogTitle>
              <DialogDescription>Name the collection, set date and rate. Totals auto-calculate from weights.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 space-y-4 py-2 scrollbar-app">
              <div>
                <Label>Collection name</Label>
                <Input
                  autoFocus
                  value={newCollectionName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewCollectionName(v);
                    const dirty = v.trim() !== (autoSuggestedCollectionName ?? '').trim();
                    newCollectionNameDirtyRef.current = dirty;
                  }}
                  placeholder="e.g. Morning shift, Block A"
                  className="mt-1 min-h-11 rounded-xl"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  A name has been suggested automatically based on the project and harvest sequence. You can edit it.
                </p>
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={newHarvestDate}
                  onChange={(e) => setNewHarvestDate(e.target.value)}
                  className="mt-1 min-h-11 rounded-xl"
                />
              </div>
              <div>
                <Label>Price per kg (picker) — KES</Label>
                <Input
                  type="number"
                  min="1"
                  value={newPricePerKgPicker}
                  onChange={(e) => setNewPricePerKgPicker(e.target.value)}
                  placeholder="20"
                  className="mt-1 min-h-11 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter className="shrink-0 px-4 pb-4 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setNewCollectionOpen(false)} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreateCollection} disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add picker dialog */}
        <Dialog
          open={addPickerOpen}
          onOpenChange={(open) => {
            setAddPickerOpen(open);
            if (!open) {
              setNewPickerNumber('');
              setNewPickerName('');
              setAddingPicker(false);
            }
          }}
        >
          <DialogContent className="w-[88vw] max-w-xs sm:max-w-md rounded-2xl mx-auto max-h-[85vh] sm:max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
              <DialogTitle>Add picker</DialogTitle>
              <DialogDescription>Number auto-fills (next in sequence). One number per picker in this collection.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 space-y-4 py-2 scrollbar-app">
              <div>
                <Label>Picker number</Label>
                <Input
                  ref={newPickerNumberRef}
                  type="number"
                  min="1"
                  value={newPickerNumber}
                  onChange={(e) => setNewPickerNumber(e.target.value)}
                  placeholder={String(nextPickerNumber)}
                  className="mt-1 min-h-11 rounded-xl"
                />
              </div>
              <div>
                <Label>Picker name</Label>
                <Input
                  value={newPickerName}
                  onChange={(e) => setNewPickerName(e.target.value)}
                  placeholder="e.g. John"
                  className="mt-1 min-h-11 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter className="shrink-0 px-4 pb-4 pt-2 border-t border-border">
              <Button onClick={handleAddPicker} disabled={addingPicker} className="min-h-11 w-full font-semibold touch-manipulation">
                {addingPicker ? 'Saving…' : 'Next'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add weigh entry dialog */}
        <Dialog
          open={addWeighOpen}
          onOpenChange={(open) => {
            setAddWeighOpen(open);
            if (!open) setWeighOpenedFromCard(false);
          }}
        >
          <DialogContent className="w-[88vw] max-w-xs sm:max-w-md rounded-2xl mx-auto max-h-[85vh] sm:max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
              <DialogTitle>Add weight</DialogTitle>
              <DialogDescription>
                {weighOpenedFromCard && weighPickerId
                  ? `Trip #${nextTripForPicker[weighPickerId] ?? weighTrip}. Totals update when you save.`
                  : 'Weight and trip for the picker.'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 space-y-4 py-2 scrollbar-app">
              {weighOpenedFromCard && weighPickerId ? (
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">
                    #{pickersForCollection.find((x) => x.id === weighPickerId)?.pickerNumber}{' '}
                    {isEditingWeighPickerName ? '' : pickersForCollection.find((x) => x.id === weighPickerId)?.pickerName}
                  </p>
                  {isEditingWeighPickerName ? (
                    <>
                      <Input
                        ref={editingWeighPickerNameRef}
                        value={editingWeighPickerName}
                        onChange={(e) => setEditingWeighPickerName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSaveWeighPickerName();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsEditingWeighPickerName(false);
                          }
                        }}
                        placeholder="Edit name"
                        className="h-8 w-32 rounded-lg text-sm"
                        disabled={editingWeighPickerSaving}
                      />
                      <button
                        type="button"
                        className="inline-flex h-7 px-2 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                        onClick={() => void handleSaveWeighPickerName()}
                        disabled={editingWeighPickerSaving || !editingWeighPickerName.trim()}
                        title="Save picker name"
                      >
                        {editingWeighPickerSaving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-7 px-2 items-center justify-center rounded-md border border-border bg-background text-muted-foreground text-xs font-medium hover:bg-muted disabled:opacity-50"
                        onClick={() => setIsEditingWeighPickerName(false)}
                        disabled={editingWeighPickerSaving}
                        title="Cancel editing"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background hover:bg-muted text-muted-foreground"
                      onClick={() => {
                        const current = pickersForCollection.find((x) => x.id === weighPickerId);
                        setEditingWeighPickerName(current?.pickerName ?? '');
                        setIsEditingWeighPickerName(true);
                        setTimeout(() => {
                          editingWeighPickerNameRef.current?.focus();
                        }, 0);
                      }}
                      title="Edit picker name"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <Label>Picker</Label>
                  <select
                    value={weighPickerId}
                    onChange={(e) => {
                      setWeighPickerId(e.target.value);
                      const pid = e.target.value;
                      setWeighTrip(String(nextTripForPicker[pid] ?? 1));
                    }}
                    className="w-full mt-1 min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select picker</option>
                    {pickersForCollection.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.pickerNumber} {p.pickerName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label>Weight (kg)</Label>
                <Input
                  ref={weighKgInputRef}
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="0.1"
                  value={weighKg}
                  onChange={(e) => setWeighKg(e.target.value)}
                  placeholder="e.g. 5.2"
                  className="mt-1 min-h-14 rounded-xl text-lg font-semibold tabular-nums touch-manipulation"
                  autoFocus
                  disabled={isSavingWeight}
                />
              </div>
              <div>
                <Label>Trip number</Label>
                <Input
                  type="number"
                  min="1"
                  value={weighTrip}
                  onChange={(e) => setWeighTrip(e.target.value)}
                  className="mt-1 min-h-11 rounded-xl"
                  disabled={isSavingWeight}
                />
              </div>

              {(weighPickerId && weighKg.trim()) && (
                <div className="flex gap-2 w-full">
                  <Button 
                    onClick={() => void handleAddWeigh('stay')} 
                    disabled={isSavingWeight}
                    className="min-h-12 flex-1 font-semibold text-base bg-primary text-primary-foreground hover:bg-primary/90 touch-manipulation"
                  >
                    {isSavingWeight ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save & Stay
                  </Button>
                  <Button 
                    onClick={() => void handleAddWeigh('next')} 
                    disabled={isSavingWeight}
                    className="min-h-12 flex-1 font-semibold text-base bg-primary text-primary-foreground hover:bg-primary/90 touch-manipulation"
                  >
                    {isSavingWeight ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save & Next
                  </Button>
                </div>
              )}

              {weighPickerId && selectedCollectionId && (() => {
                const pickerEntries = weighEntriesForCollection
                  .filter((e) => e.pickerId === weighPickerId)
                  .slice()
                  .sort((a, b) => {
                    const at = (a.recordedAt != null ? toDate(a.recordedAt)?.getTime() : 0) ?? 0;
                    const bt = (b.recordedAt != null ? toDate(b.recordedAt)?.getTime() : 0) ?? 0;
                    return bt - at;
                  });
                const rate = Number(selectedCollection?.pricePerKgPicker ?? 0) || 20;
                const totalKg = pickerEntries.reduce((s, e) => s + Number(e.weightKg ?? 0), 0);
                const totalPrice = Math.round(totalKg * rate);
                return (
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-sm font-semibold text-foreground">Entries</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border">
                        <span>#</span>
                        <span>KG</span>
                        {canViewFinancials && <span>Price</span>}
                        <span>Time</span>
                        <span className="w-14 text-right" />
                      </div>
                      <div className="max-h-[180px] overflow-y-auto scrollbar-app">
                        {pickerEntries.length === 0 ? (
                          <p className="text-sm text-muted-foreground px-2 py-3">No entries yet.</p>
                        ) : (
                          pickerEntries.map((e, idx) => {
                            const kg = Number(e.weightKg ?? 0);
                            const price = Math.round(kg * rate);
                            const timeStr = e.recordedAt != null ? format(toDate(e.recordedAt) ?? new Date(), 'h:mm a') : '—';
                            const picker = pickersForCollection.find((p) => p.id === e.pickerId);
                            return (
                              <div
                                key={e.id ?? `ledger-${idx}`}
                                className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2 py-1.5 items-center text-sm border-b border-border last:border-b-0"
                              >
                                <span className="tabular-nums text-foreground">{idx + 1}</span>
                                <span className="tabular-nums text-foreground">{kg.toFixed(1)} kg</span>
                                {canViewFinancials && (
                                  <span className="tabular-nums text-foreground">{price}</span>
                                )}
                                <span className="text-muted-foreground tabular-nums text-xs">{timeStr}</span>
                                <div className="flex items-center justify-end gap-0.5 w-14">
                                  {(canManageIntake || canDeleteIntakeEntry) && selectedCollection?.status !== 'closed' && (
                                    <>
                                      {canManageIntake && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                          onClick={() => {
                                            setEditIntakeEntry({
                                              id: e.id ?? '',
                                              pickerId: e.pickerId,
                                              pickerNumber: picker?.pickerNumber ?? '?',
                                              pickerName: picker?.pickerName ?? '—',
                                              kg,
                                              collectionId: e.collectionId,
                                            });
                                            setEditIntakePickerId(e.pickerId);
                                            setEditIntakeKg(String(kg));
                                            setAddWeighOpen(false);
                                          }}
                                          aria-label="Edit"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      )}
                                      {canDeleteIntakeEntry && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                          onClick={() => handleDeleteIntakeEntryClick({ id: e.id ?? '', collectionId: e.collectionId })}
                                          aria-label="Delete"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                      {pickerEntries.length > 0 && (
                        <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2 py-2 bg-muted/30 text-sm font-semibold border-t border-border">
                          <span>Total</span>
                          <span className="tabular-nums">{totalKg.toFixed(1)} kg</span>
                          <span className="tabular-nums">{totalPrice}</span>
                          <span />
                          <span />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <HarvestCollectionsTour
        run={harvestTourRun}
        steps={harvestTourSteps}
        stepIndex={harvestTourStepIndex}
        onCallback={handleHarvestTourCallback}
      />

      {/* Unusual Weight Confirmation Dialog - Add Weight Form */}
      <Dialog open={unusualWeightConfirm !== null} onOpenChange={(open) => !open && setUnusualWeightConfirm(null)}>
        <DialogContent className="w-[90vw] max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Unusual crate weight
            </DialogTitle>
            <DialogDescription>
              This crate weight ({unusualWeightConfirm?.kg}kg) is above the expected range ({UNUSUAL_WEIGHT_THRESHOLD_KG}kg). Please confirm before saving.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setUnusualWeightConfirm(null);
                requestAnimationFrame(() => weighKgInputRef.current?.focus());
              }}
              className="min-h-11 w-full sm:w-auto"
            >
              Edit Weight
            </Button>
            <Button
              onClick={() => {
                if (unusualWeightConfirm) {
                  void handleAddWeigh(unusualWeightConfirm.mode, true);
                }
                setUnusualWeightConfirm(null);
              }}
              className="min-h-11 w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
            >
              Save Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unusual Weight Confirmation Dialog - Quick Intake Form */}
      <Dialog open={unusualQuickWeightConfirm !== null} onOpenChange={(open) => !open && setUnusualQuickWeightConfirm(null)}>
        <DialogContent className="w-[90vw] max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Unusual crate weight
            </DialogTitle>
            <DialogDescription>
              This crate weight ({unusualQuickWeightConfirm?.kg}kg) is above the expected range ({UNUSUAL_WEIGHT_THRESHOLD_KG}kg). Please confirm before saving.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setUnusualQuickWeightConfirm(null);
                requestAnimationFrame(() => quickIntakeKgRef.current?.focus());
              }}
              className="min-h-11 w-full sm:w-auto"
            >
              Edit Weight
            </Button>
            <Button
              onClick={() => {
                if (unusualQuickWeightConfirm) {
                  void handleQuickIntakeNextPicker(unusualQuickWeightConfirm.saveAndStay, true);
                }
                setUnusualQuickWeightConfirm(null);
              }}
              className="min-h-11 w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
            >
              Save Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename collection (audit logged) */}
      <RenameHarvestCollectionModal
        open={renameCollectionDialogOpen}
        onOpenChange={handleRenameDialogOpenChange}
        currentName={renameTargetCollection?.name ?? ''}
        onSave={handleRenameCollectionSave}
      />

      <HarvestCollectionTransferModal
        open={transferCollectionDialogOpen}
        onOpenChange={handleTransferDialogOpenChange}
        currentProjectId={transferTargetCollection?.projectId ?? ''}
        currentProjectName={
          transferTargetCollection?.projectId
            ? (companyProjectNameById.get(transferTargetCollection.projectId) ?? 'Current project')
            : 'Current project'
        }
        targetProjects={transferTargetProjects}
        onSubmit={handleTransferCollectionSubmit}
      />

      {/* Delete collection confirmation */}
      <AlertDialog
        open={!!deleteCollectionConfirm}
        onOpenChange={(open) => !open && !deletingCollection && setDeleteCollectionConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the collection and all its pickers, intake weights, and payment records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCollection} className="min-h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteCollectionConfirm();
              }}
              disabled={deletingCollection}
              className="min-h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingCollection ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete intake entry confirmation - system UI modal */}
      <AlertDialog open={!!deleteIntakeConfirm} onOpenChange={(open) => !open && !deletingIntakeEntry && setDeleteIntakeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete intake entry</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this weight entry? Picker and collection totals will update after delete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingIntakeEntry} className="min-h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteIntakeEntryConfirm();
              }}
              disabled={deletingIntakeEntry}
              className="min-h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingIntakeEntry ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    </FeatureGate>
  );
}