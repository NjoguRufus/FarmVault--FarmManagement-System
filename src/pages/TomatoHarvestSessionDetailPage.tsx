import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  LayoutGrid,
  ListOrdered,
  RotateCcw,
  Search,
  Plus,
  Truck,
  UserPlus,
  Users,
  Layers,
  Package,
  TrendingUp,
  Wallet,
  Banknote,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { TallyMarksDisplay } from '@/components/tomato-harvest/TallyMarksDisplay';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateUtils';
import { useToast } from '@/hooks/use-toast';
import { readStoredNotificationPrefs } from '@/hooks/useNotificationPreferences';
import { useTomatoHarvestLogsRealtime } from '@/hooks/useTomatoHarvestLogsRealtime';
import { playNotificationSound } from '@/services/notificationSoundService';
import { fetchDisplayNamesByClerkUserIds } from '@/services/profileClerkDisplayNames';
import { listEmployees } from '@/services/employeesSupabaseService';
import type { Employee } from '@/types';
import { useHarvestNavPrefix } from '@/hooks/useHarvestNavPrefix';
import {
  addTomatoBucketLog,
  addTomatoPicker,
  computeNet,
  computePickerCost,
  computeRevenue,
  deleteTomatoMarketDispatchForSession,
  fetchLogsForSession,
  fetchPickersForSession,
  fetchTomatoMarketDispatchBySession,
  fetchTomatoSession,
  insertTomatoCustomMarket,
  listTomatoCustomMarkets,
  mergePickersWithBuckets,
  sessionDisplayTitle,
  undoLastTomatoBucketLog,
  updateTomatoSessionPackaging,
  updateTomatoSessionPickerRate,
  updateTomatoSessionSales,
  updateTomatoSessionStatus,
  upsertTomatoMarketDispatch,
  type PickerWithBuckets,
  type TomatoHarvestPickerLogRow,
  type TomatoPackagingType,
  type TomatoSaleMode,
} from '@/services/tomatoHarvestService';

const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

const PRESET_TOMATO_MARKETS = ['Muthurwa', 'Githurai', 'Kangemi'] as const;

const EMPTY_RECORDER_NAMES = new Map<string, string>();

function isSalesBrokerEmployee(e: Employee): boolean {
  const r = String(e.employeeRole ?? e.role ?? '').toLowerCase();
  return r === 'sales-broker' || r.includes('broker');
}

type PickerView = 'search' | 'grid';

type TomatoSessionSection = 'pickers' | 'destination' | 'activity' | 'rate';

export default function TomatoHarvestSessionDetailPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { can: canKey } = useEmployeeAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const harvestNavPrefix = useHarvestNavPrefix();

  const canEdit =
    canKey('harvest_collections.edit') ||
    can('harvest', 'edit') ||
    can('harvest', 'recordIntake') ||
    can('harvest', 'create');

  /** Harvest financials: collection financials key, global financials.view, or legacy harvest.viewFinancials. */
  const canViewHarvestFinancials =
    canKey('harvest_collections.financials') ||
    canKey('financials.view') ||
    can('harvest', 'viewFinancials');

  const invalidate = useCallback(() => {
    if (!companyId || !sessionId || !projectId) return;
    void queryClient.invalidateQueries({ queryKey: ['tomato-harvest-session', companyId, sessionId] });
    void queryClient.invalidateQueries({ queryKey: ['tomato-harvest-sessions', companyId, projectId] });
    void queryClient.invalidateQueries({ queryKey: ['tomato-harvest-dispatch', companyId, sessionId] });
  }, [companyId, sessionId, projectId, queryClient]);

  const { data: session, isLoading: loadingSession } = useQuery({
    queryKey: ['tomato-harvest-session', companyId, sessionId, 'meta'],
    queryFn: () => fetchTomatoSession({ companyId: companyId!, sessionId: sessionId! }),
    enabled: Boolean(companyId && sessionId),
  });

  const { data: dispatch = null } = useQuery({
    queryKey: ['tomato-harvest-dispatch', companyId, sessionId],
    queryFn: () => fetchTomatoMarketDispatchBySession({ companyId: companyId!, sessionId: sessionId! }),
    enabled: Boolean(companyId && sessionId),
  });

  const { data: customMarkets = [] } = useQuery({
    queryKey: ['tomato-custom-markets', companyId],
    queryFn: () => listTomatoCustomMarkets(companyId!),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', companyId],
    queryFn: () => listEmployees(companyId!),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const brokerEmployees = useMemo(() => employees.filter(isSalesBrokerEmployee), [employees]);

  const marketOptions = useMemo(() => {
    const names = new Set<string>([...PRESET_TOMATO_MARKETS]);
    for (const m of customMarkets) {
      if (m.name.trim()) names.add(m.name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [customMarkets]);

  const { data: pickers = [], isLoading: loadingPickers } = useQuery({
    queryKey: ['tomato-harvest-session', companyId, sessionId, 'pickers'],
    queryFn: () => fetchPickersForSession({ companyId: companyId!, sessionId: sessionId! }),
    enabled: Boolean(companyId && sessionId),
  });

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['tomato-harvest-session', companyId, sessionId, 'logs'],
    queryFn: () => fetchLogsForSession({ companyId: companyId!, sessionId: sessionId! }),
    enabled: Boolean(companyId && sessionId),
  });

  const logRecorderIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const l of logs) {
      const id = l.recorded_by?.trim();
      if (id) ids.add(id);
    }
    return [...ids].sort().join('|');
  }, [logs]);

  const { data: recorderNames = EMPTY_RECORDER_NAMES } = useQuery({
    queryKey: ['tomato-harvest-recorder-names', companyId, sessionId, logRecorderIdsKey],
    queryFn: async () => {
      const ids = logRecorderIdsKey ? logRecorderIdsKey.split('|').filter(Boolean) : [];
      return fetchDisplayNamesByClerkUserIds(ids, { companyId });
    },
    enabled: Boolean(companyId && sessionId && logRecorderIdsKey.length > 0),
    staleTime: 60_000,
  });

  useTomatoHarvestLogsRealtime(sessionId, invalidate);

  const pickersMerged: PickerWithBuckets[] = useMemo(
    () => mergePickersWithBuckets(pickers, logs),
    [pickers, logs],
  );

  const totalBuckets = useMemo(() => pickersMerged.reduce((s, p) => s + p.bucketCount, 0), [pickersMerged]);
  const pickerCost = session ? computePickerCost(totalBuckets, Number(session.picker_rate_per_bucket)) : 0;
  const revenue = session ? computeRevenue(session, dispatch) : 0;
  const marketExpensesTotal =
    dispatch?.market_expenses_total != null ? Number(dispatch.market_expenses_total) : 0;
  const net =
    session && session.sale_mode === 'market' && dispatch
      ? Math.round(revenue - pickerCost - marketExpensesTotal)
      : computeNet(revenue, pickerCost);
  const revenuePendingDisplay =
    session?.sale_mode === 'market' &&
    dispatch?.status === 'pending' &&
    (dispatch?.total_revenue == null || Number(dispatch.total_revenue) <= 0);

  const marketPathCommitted = useMemo(
    () => Boolean(session?.sale_mode === 'market' && dispatch != null),
    [session?.sale_mode, dispatch],
  );

  const farmPathCommitted = useMemo(() => {
    if (!session || session.sale_mode !== 'farm_gate') return false;
    const rev = Number(session.total_revenue);
    const price = Number(session.price_per_container);
    const units = Math.max(0, Math.floor(Number(session.sale_units) || 0));
    return (Number.isFinite(rev) && rev > 0) || (Number.isFinite(price) && price > 0 && units > 0);
  }, [session]);

  const [pickerView, setPickerView] = useState<PickerView>('search');
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pickerModal, setPickerModal] = useState<PickerWithBuckets | null>(null);
  const [expandedPickerLogId, setExpandedPickerLogId] = useState<string | null>(null);
  const [bucketInFlight, setBucketInFlight] = useState(false);

  const [activeSection, setActiveSection] = useState<TomatoSessionSection>('pickers');

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addPickerNumber, setAddPickerNumber] = useState('');
  const [addPickerName, setAddPickerName] = useState('');
  const [addPickerNumberLocked, setAddPickerNumberLocked] = useState(false);
  const [savingPicker, setSavingPicker] = useState(false);

  const [packType, setPackType] = useState<TomatoPackagingType | ''>('');
  const [packCount, setPackCount] = useState('');

  const [saleMode, setSaleMode] = useState<TomatoSaleMode | ''>('market');
  const [pricePer, setPricePer] = useState('');
  const [saleUnits, setSaleUnits] = useState('');
  const [farmSoldSync, setFarmSoldSync] = useState(true);
  const [marketSelect, setMarketSelect] = useState('');
  const [brokerEmployeeId, setBrokerEmployeeId] = useState('');
  const [marketContainersSent, setMarketContainersSent] = useState('');
  const [addMarketOpen, setAddMarketOpen] = useState(false);
  const [newMarketName, setNewMarketName] = useState('');
  const [newMarketLocation, setNewMarketLocation] = useState('');
  const [savingNewMarket, setSavingNewMarket] = useState(false);
  const [marketUpdatePrice, setMarketUpdatePrice] = useState('');
  const [marketUpdateTotalRev, setMarketUpdateTotalRev] = useState('');
  const [savingMarketPricing, setSavingMarketPricing] = useState(false);
  const [savingDestination, setSavingDestination] = useState(false);

  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  const formHydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!session) return;
    const hydrateKey = `${session.id}|${dispatch?.id ?? 'x'}|${dispatch?.updated_at ?? ''}|${session.updated_at}`;
    if (formHydratedFor.current === hydrateKey) return;
    formHydratedFor.current = hydrateKey;
    setPackType((session.packaging_type as TomatoPackagingType) ?? '');
    setPackCount(String(session.packaging_count ?? 0));
    const sm = (session.sale_mode as TomatoSaleMode) ?? 'farm_gate';
    setSaleMode(sm === 'market' ? 'market' : 'farm_gate');
    setPricePer(session.price_per_container != null ? String(session.price_per_container) : '');
    setSaleUnits(session.sale_units != null ? String(session.sale_units) : String(session.packaging_count ?? 0));
    const synced =
      sm === 'market' ||
      session.sale_units == null ||
      Number(session.sale_units) === Number(session.packaging_count ?? 0);
    setFarmSoldSync(synced);
    setMarketSelect(dispatch?.market_name ?? '');
    setBrokerEmployeeId(dispatch?.broker_employee_id ?? '');
    setMarketContainersSent(
      dispatch != null ? String(dispatch.containers_sent) : String(session.packaging_count ?? 0),
    );
    setMarketUpdatePrice(dispatch?.price_per_container != null ? String(dispatch.price_per_container) : '');
    setMarketUpdateTotalRev(dispatch?.total_revenue != null ? String(dispatch.total_revenue) : '');
    setRateInput(String(session.picker_rate_per_bucket ?? 30));
  }, [session, dispatch]);

  useEffect(() => {
    formHydratedFor.current = null;
  }, [sessionId]);

  useEffect(() => {
    if (saleMode !== 'farm_gate' || !farmSoldSync) return;
    const n = Math.max(0, Math.floor(Number(packCount) || 0));
    setSaleUnits(String(n));
  }, [packCount, saleMode, farmSoldSync]);

  useEffect(() => {
    setExpandedPickerLogId(null);
  }, [pickerModal?.id]);

  const flash = useCallback((pickerId: string) => {
    setHighlightId(pickerId);
    window.setTimeout(() => setHighlightId((cur) => (cur === pickerId ? null : cur)), 1600);
  }, []);

  const handleAddBucket = async (picker: PickerWithBuckets) => {
    if (!companyId || !sessionId || !canEdit || bucketInFlight) return;
    setBucketInFlight(true);
    try {
      await addTomatoBucketLog({ companyId, sessionId, pickerId: picker.id, units: 1 });
      invalidate();
      flash(picker.id);
      toast({
        title: '+1 bucket',
        description: `→ ${picker.name || 'Picker'} (${picker.picker_number}) — ${picker.bucketCount + 1} total`,
      });
      const nPrefs = readStoredNotificationPrefs(user?.id);
      if (nPrefs.notificationsEnabled && nPrefs.soundEnabled) {
        void playNotificationSound(nPrefs.soundFile, { force: true });
      }
    } catch (e) {
      toast({
        title: 'Could not add bucket',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setBucketInFlight(false);
    }
  };

  const openAddPicker = (presetNumber?: string) => {
    const n = presetNumber?.trim() ?? '';
    setAddPickerNumber(n);
    setAddPickerName('');
    setAddPickerNumberLocked(Boolean(n));
    setAddPickerOpen(true);
  };

  const saveNewPicker = async () => {
    if (!companyId || !sessionId) return;
    const numVal = Number(addPickerNumber);
    if (!Number.isFinite(numVal) || numVal <= 0) {
      toast({ title: 'Invalid picker number', variant: 'destructive' });
      return;
    }
    setSavingPicker(true);
    try {
      await addTomatoPicker({
        companyId,
        sessionId,
        pickerNumber: Math.floor(numVal),
        name: addPickerName.trim() || `Picker ${Math.floor(numVal)}`,
      });
      invalidate();
      setAddPickerOpen(false);
      toast({ title: 'Picker added' });
    } catch (e) {
      toast({
        title: 'Could not add picker',
        description: e instanceof Error ? e.message : 'Number may already exist.',
        variant: 'destructive',
      });
    } finally {
      setSavingPicker(false);
    }
  };

  const handleUndo = async () => {
    if (!companyId || !sessionId || !canEdit) return;
    try {
      const { deleted } = await undoLastTomatoBucketLog({ companyId, sessionId });
      if (!deleted) {
        toast({ title: 'Nothing to undo' });
        return;
      }
      invalidate();
      toast({ title: 'Undid last bucket' });
    } catch (e) {
      toast({
        title: 'Undo failed',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const filteredPickers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pickersMerged;
    return pickersMerged.filter((p) => {
      const numStr = String(p.picker_number);
      const name = (p.name ?? '').toLowerCase();
      return numStr.includes(q) || name.includes(q);
    });
  }, [pickersMerged, search]);

  const searchSuggestNewNumber = useMemo(() => {
    const digits = search.replace(/\D/g, '');
    if (!digits) return '';
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '';
  }, [search]);

  const saveDestination = async () => {
    if (!companyId || !sessionId || !canEdit) return;
    const mode: TomatoSaleMode = saleMode === 'market' ? 'market' : 'farm_gate';
    if (mode === 'market') {
      const mName = marketSelect.trim();
      if (!mName) {
        toast({ title: 'Choose a market', variant: 'destructive' });
        return;
      }
    }
    setSavingDestination(true);
    try {
      const packagingCount = Math.max(0, Math.floor(Number(packCount) || 0));
      await updateTomatoSessionPackaging({
        companyId,
        sessionId,
        packagingType: packType === '' ? null : packType,
        packagingCount,
      });

      if (mode === 'farm_gate') {
        try {
          await deleteTomatoMarketDispatchForSession({ companyId, sessionId });
        } catch {
          /* no row */
        }
        if (canViewHarvestFinancials) {
          const price = pricePer.trim() === '' ? null : Number(pricePer);
          const units = Math.max(0, Math.floor(Number(saleUnits) || 0));
          const total =
            price != null && units > 0 ? Math.round(price * units) : null;
          await updateTomatoSessionSales({
            companyId,
            sessionId,
            saleMode: 'farm_gate',
            pricePerContainer: price,
            saleUnits: units,
            totalRevenue: total,
          });
        }
      } else {
        const mName = marketSelect.trim();
        const sent = Math.max(
          0,
          Math.floor(Number(marketContainersSent) || packagingCount || 0),
        );
        await updateTomatoSessionSales({
          companyId,
          sessionId,
          saleMode: 'market',
          pricePerContainer: null,
          saleUnits: null,
          totalRevenue: null,
        });
        await upsertTomatoMarketDispatch({
          companyId,
          sessionId,
          marketName: mName,
          brokerEmployeeId: brokerEmployeeId.trim() || null,
          containersSent: sent,
          pricePerContainer: null,
          totalRevenue: null,
          status: 'pending',
        });
      }

      invalidate();
      toast({ title: 'Saved' });
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    } finally {
      setSavingDestination(false);
    }
  };

  const saveMarketPricing = async () => {
    if (!companyId || !sessionId || !canEdit || !dispatch) return;
    if (marketUpdatePrice.trim() === '' && marketUpdateTotalRev.trim() === '') {
      toast({ title: 'Enter price per container and/or total revenue', variant: 'destructive' });
      return;
    }
    setSavingMarketPricing(true);
    try {
      const p = marketUpdatePrice.trim() === '' ? null : Number(marketUpdatePrice);
      const t = marketUpdateTotalRev.trim() === '' ? null : Math.round(Number(marketUpdateTotalRev));
      let totalRevenue = t;
      const sent = dispatch.containers_sent;
      if (totalRevenue == null && p != null && sent > 0) {
        totalRevenue = Math.round(p * sent);
      }
      await upsertTomatoMarketDispatch({
        companyId,
        sessionId,
        marketName: dispatch.market_name,
        brokerEmployeeId: dispatch.broker_employee_id,
        containersSent: sent,
        pricePerContainer: p,
        totalRevenue,
        status: 'completed',
      });
      invalidate();
      toast({ title: 'Market sale updated' });
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    } finally {
      setSavingMarketPricing(false);
    }
  };

  const handleAddCustomMarket = async () => {
    if (!companyId) return;
    setSavingNewMarket(true);
    try {
      const row = await insertTomatoCustomMarket({
        companyId,
        name: newMarketName,
        location: newMarketLocation || null,
      });
      setMarketSelect(row.name);
      setAddMarketOpen(false);
      setNewMarketName('');
      setNewMarketLocation('');
      void queryClient.invalidateQueries({ queryKey: ['tomato-custom-markets', companyId] });
      toast({ title: 'Market added' });
    } catch (e) {
      toast({
        title: 'Could not add market',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    } finally {
      setSavingNewMarket(false);
    }
  };

  const saveRate = async () => {
    if (!companyId || !sessionId || !canEdit) return;
    const r = Number(rateInput);
    if (!Number.isFinite(r) || r < 0) {
      toast({ title: 'Invalid rate', variant: 'destructive' });
      return;
    }
    setSavingRate(true);
    try {
      await updateTomatoSessionPickerRate({ companyId, sessionId, pickerRatePerBucket: r });
      invalidate();
      toast({ title: 'Picker rate updated' });
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    } finally {
      setSavingRate(false);
    }
  };

  const toggleStatus = async () => {
    if (!companyId || !sessionId || !session || !canEdit) return;
    const next = session.status === 'completed' ? 'collecting' : 'completed';
    try {
      await updateTomatoSessionStatus({ companyId, sessionId, status: next });
      invalidate();
      toast({ title: next === 'completed' ? 'Marked complete' : 'Reopened for collecting' });
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    }
  };

  const recentLogs = useMemo(() => {
    const byPicker = new Map(pickersMerged.map((p) => [p.id, p]));
    return [...logs]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 25)
      .map((log) => {
        const p = byPicker.get(log.picker_id);
        return {
          log,
          label: p ? `${p.name || 'Picker'} (${p.picker_number})` : log.picker_id,
        };
      });
  }, [logs, pickersMerged]);

  /** Picker shown in modal — keep bucket count in sync after +Bucket / realtime. */
  const activePickerModal = useMemo(() => {
    if (!pickerModal) return null;
    return pickersMerged.find((p) => p.id === pickerModal.id) ?? pickerModal;
  }, [pickerModal, pickersMerged]);

  const modalPickerLogs = useMemo((): TomatoHarvestPickerLogRow[] => {
    if (!pickerModal) return [];
    return [...logs]
      .filter((l) => l.picker_id === pickerModal.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [logs, pickerModal]);

  if (!projectId || !sessionId) {
    return <p className="text-muted-foreground p-4">Missing route.</p>;
  }

  if (!companyId) {
    return <p className="text-muted-foreground p-4">Sign in to continue.</p>;
  }

  if (loadingSession || !session) {
    return <p className="text-muted-foreground p-4">{loadingSession ? 'Loading…' : 'Session not found.'}</p>;
  }

  const loadingPick = loadingPickers || loadingLogs;

  return (
    <div className="space-y-5 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 animate-fade-in w-full">
      <button
        type="button"
        className="fv-btn fv-btn--secondary flex items-center gap-2"
        onClick={() => navigate(`${harvestNavPrefix}/tomato-harvest/${projectId}`)}
      >
        <ChevronLeft className="h-4 w-4" />
        All tomato harvests
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{sessionDisplayTitle(session)}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(session.session_date)}</p>
        </div>
        <span
          className={cn(
            'fv-badge',
            session.status === 'completed' ? 'fv-badge--active' : 'fv-badge--warning',
          )}
        >
          {session.status === 'completed' ? 'Completed' : 'Collecting'}
        </span>
      </div>

      <div
        className={cn(
          'grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3',
          canViewHarvestFinancials ? 'lg:grid-cols-5' : 'lg:grid-cols-3',
        )}
      >
          <SimpleStatCard
            layout="mobile-compact"
            title="Buckets"
            value={totalBuckets.toLocaleString()}
            icon={Layers}
            iconVariant="primary"
            className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
          />
          <SimpleStatCard
            layout="mobile-compact"
            title="Crates"
            value={String(session.packaging_count ?? 0)}
            icon={Package}
            iconVariant="primary"
            className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
          />
          {canViewHarvestFinancials && (
            <SimpleStatCard
              layout="mobile-compact"
              title="Revenue"
              value={revenuePendingDisplay ? 'Pending' : formatKes(revenue)}
              subtitle={
                revenuePendingDisplay
                  ? 'To be updated after market sale'
                  : session.sale_mode === 'market' && dispatch?.status === 'pending'
                    ? 'Live total from broker sales'
                    : undefined
              }
              icon={TrendingUp}
              iconVariant="gold"
              valueVariant={revenuePendingDisplay ? 'warning' : 'success'}
              className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
            />
          )}
          <SimpleStatCard
            layout="mobile-compact"
            title="Picker cost"
            value={formatKes(pickerCost)}
            icon={Banknote}
            iconVariant="primary"
            className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation"
          />
          {canViewHarvestFinancials && (
            <SimpleStatCard
              layout="mobile-compact"
              title="Net profit"
              value={formatKes(net)}
              icon={Wallet}
              iconVariant="muted"
              valueVariant={net >= 0 ? 'info' : 'destructive'}
              className="py-3 px-3 text-sm sm:py-2 sm:px-2 min-h-[3.25rem] touch-manipulation col-span-2 sm:col-span-1 lg:col-span-1"
            />
          )}
        </div>

      <div className="mt-1 border-t border-border/50 pt-3">
        <div
          className={cn(
            'flex w-full rounded-lg bg-muted/60 p-0.5 gap-0.5',
            'overflow-x-auto [scrollbar-width:thin]',
          )}
          role="tablist"
          aria-label="Session sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'pickers'}
            onClick={() => setActiveSection('pickers')}
            className={cn(
              'flex shrink-0 items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors touch-manipulation sm:px-3 sm:text-sm',
              activeSection === 'pickers'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Users className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
            Pickers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'destination'}
            onClick={() => setActiveSection('destination')}
            className={cn(
              'flex shrink-0 items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors touch-manipulation sm:px-3 sm:text-sm',
              activeSection === 'destination'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Truck className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
            Sales
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'activity'}
            onClick={() => setActiveSection('activity')}
            className={cn(
              'flex shrink-0 items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors touch-manipulation sm:px-3 sm:text-sm',
              activeSection === 'activity'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ListOrdered className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
            Activity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'rate'}
            onClick={() => setActiveSection('rate')}
            className={cn(
              'flex shrink-0 items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors touch-manipulation sm:px-3 sm:text-sm',
              activeSection === 'rate'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Banknote className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
            Rate
          </button>
        </div>

        <div className="pt-3 space-y-3">
          {activeSection === 'pickers' && (
            <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9 rounded-lg touch-manipulation"
                  disabled={!canEdit}
                  onClick={() => openAddPicker()}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Add picker
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9 rounded-lg touch-manipulation"
                  disabled={!canEdit || bucketInFlight}
                  onClick={() => void handleUndo()}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Undo last bucket
                </Button>
                <div className="flex rounded-lg border border-border overflow-hidden ml-auto sm:ml-0">
                  {(
                    [
                      ['search', Search, 'Search & list'],
                      ['grid', LayoutGrid, 'Grid'],
                    ] as const
                  ).map(([key, Icon, title]) => (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        'p-2.5 transition-colors touch-manipulation',
                        pickerView === key ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground',
                      )}
                      onClick={() => setPickerView(key)}
                      title={title}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {pickerView === 'search' && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Search picker number or name</Label>
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="e.g. 12 or Mary"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-7 min-h-9 rounded-lg text-sm bg-muted/50 border-muted-foreground/20 text-base"
                  />
                </div>
                <div className="space-y-2 max-h-[min(28rem,55vh)] overflow-y-auto pr-0.5">
                  {loadingPick ? (
                    <p className="text-sm text-muted-foreground">Loading pickers…</p>
                  ) : filteredPickers.length === 0 ? (
                    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                      <p className="text-sm text-muted-foreground">No matching picker.</p>
                      {canEdit && searchSuggestNewNumber && (
                        <Button type="button" size="sm" onClick={() => openAddPicker(searchSuggestNewNumber)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add picker #{searchSuggestNewNumber}
                        </Button>
                      )}
                      {canEdit && !searchSuggestNewNumber && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => openAddPicker()}>
                          Add picker
                        </Button>
                      )}
                    </div>
                  ) : (
                    filteredPickers.map((p) => (
                      <Card
                        key={p.id}
                        className={cn(
                          'relative overflow-hidden rounded-xl transition-all',
                          highlightId === p.id && 'ring-2 ring-emerald-500/50',
                        )}
                      >
                        <CardContent className="flex items-stretch gap-2 p-2 sm:p-3">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left hover:bg-muted/50 transition-colors touch-manipulation"
                            onClick={() => setPickerModal(p)}
                          >
                            <div className="relative shrink-0">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-base font-bold tabular-nums text-primary-foreground shadow-lg ring-2 ring-background">
                                {p.picker_number}
                              </div>
                              <div className="absolute -right-1 -top-1 flex h-4 min-w-[1.125rem] items-center justify-center rounded-full border border-border bg-muted px-1 text-[9px] font-bold tabular-nums">
                                {p.bucketCount}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1 py-0.5">
                              <p className="truncate text-sm font-semibold text-foreground">{p.name || '—'}</p>
                              <div className="mt-1 max-w-full overflow-x-auto">
                                <TallyMarksDisplay count={p.bucketCount} />
                              </div>
                            </div>
                          </button>
                          <Button
                            type="button"
                            size="sm"
                            className="shrink-0 self-center touch-manipulation"
                            disabled={!canEdit || bucketInFlight}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleAddBucket(p);
                            }}
                          >
                            {bucketInFlight ? 'Adding…' : '+ Bucket'}
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )}

            {pickerView === 'grid' && (
              <div data-tour="tomato-picker-cards" className="min-h-[80px]">
                {loadingPick ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : pickersMerged.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Add pickers, then use the card or + Bucket.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {pickersMerged.map((p) => (
                      <Card
                        key={p.id}
                        className={cn(
                          'relative flex min-h-[148px] flex-col overflow-hidden rounded-xl transition-all touch-manipulation',
                          highlightId === p.id && 'ring-2 ring-emerald-500/50',
                        )}
                      >
                        <CardContent className="flex min-h-0 flex-1 flex-col p-2 text-center">
                          <button
                            type="button"
                            className="flex min-h-0 flex-1 flex-col text-center hover:bg-muted/40 active:scale-[0.99] rounded-lg transition-transform touch-manipulation"
                            onClick={() => setPickerModal(p)}
                          >
                            <div className="absolute right-1 top-1 flex h-5 items-center justify-center rounded-full border border-border bg-muted px-1.5 text-[10px] font-bold tabular-nums text-foreground">
                              {p.bucketCount}
                            </div>
                            <div className="flex flex-shrink-0 justify-center pt-1">
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold tabular-nums text-primary-foreground shadow-lg ring-2 ring-background">
                                {p.picker_number}
                              </div>
                            </div>
                            <div className="mt-1 line-clamp-2 px-1 text-xs font-semibold leading-tight text-foreground sm:text-sm">
                              {p.name || '—'}
                            </div>
                            <div className="mt-1 flex flex-shrink-0 justify-center px-1">
                              <TallyMarksDisplay count={p.bucketCount} className="justify-center" />
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">Details</div>
                          </button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="mt-2 h-8 w-full shrink-0 touch-manipulation text-xs"
                            disabled={!canEdit || bucketInFlight}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleAddBucket(p);
                            }}
                          >
                            {bucketInFlight ? 'Adding…' : '+ Bucket'}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
            </>
          )}

          {activeSection === 'destination' && (
            <div className="space-y-3 max-w-lg">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                  Destination
                </p>
                <div
                  className={cn(
                    'inline-flex w-full max-w-md rounded-md border border-border overflow-hidden',
                    !canEdit && 'pointer-events-none opacity-60',
                  )}
                  role="group"
                  aria-label="Sale destination"
                >
                  <button
                    type="button"
                    title={
                      farmPathCommitted
                        ? 'This session is recorded as sold from the farm — switch destination only after clearing farm sale data'
                        : 'Going to market — dispatch & broker'
                    }
                    className={cn(
                      'min-h-9 min-w-0 flex-1 px-2 py-2 text-xs font-medium transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm',
                      saleMode === 'market'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground',
                    )}
                    disabled={!canEdit || farmPathCommitted}
                    onClick={() => {
                      setSaleMode('market');
                      const n = Math.max(0, Math.floor(Number(packCount) || 0));
                      setMarketContainersSent(String(n));
                    }}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    title={
                      marketPathCommitted
                        ? 'Produce is committed to a market dispatch — switch destination only after removing that dispatch'
                        : 'Sold from farm — price × containers sold'
                    }
                    className={cn(
                      'min-h-9 min-w-0 flex-1 border-l border-border px-2 py-2 text-xs font-medium transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm',
                      saleMode !== 'market'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground',
                    )}
                    disabled={!canEdit || marketPathCommitted}
                    onClick={() => {
                      setSaleMode('farm_gate');
                      setFarmSoldSync(true);
                    }}
                  >
                    Farm
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={packType === '' ? 'none' : packType}
                    onValueChange={(v) => setPackType(v === 'none' ? '' : (v as TomatoPackagingType))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="min-h-10 rounded-lg">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="crates">Crates</SelectItem>
                      <SelectItem value="wooden_boxes">Wooden boxes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total</Label>
                  <Input
                    inputMode="numeric"
                    value={packCount}
                    onChange={(e) => setPackCount(e.target.value)}
                    disabled={!canEdit}
                    className="min-h-10 rounded-lg"
                  />
                </div>
              </div>

              {saleMode === 'farm_gate' && canViewHarvestFinancials && (
                <div className="space-y-2 rounded-lg border border-border/50 bg-muted/15 p-2.5 sm:p-3">
                  <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Price / container (KES)</Label>
                      <Input
                        inputMode="decimal"
                        value={pricePer}
                        onChange={(e) => setPricePer(e.target.value)}
                        disabled={!canEdit}
                        className="min-h-10 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sold (containers)</Label>
                      <Input
                        inputMode="numeric"
                        value={saleUnits}
                        onChange={(e) => {
                          setFarmSoldSync(false);
                          setSaleUnits(e.target.value);
                        }}
                        disabled={!canEdit}
                        className="min-h-10 rounded-lg"
                      />
                    </div>
                  </div>
                  {!farmSoldSync && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      {Math.max(
                        0,
                        Math.floor(Number(packCount) || 0) - Math.floor(Number(saleUnits) || 0),
                      ).toLocaleString()}{' '}
                      left
                    </p>
                  )}
                  {pricePer.trim() !== '' && saleUnits.trim() !== '' && (
                    <p className="text-[11px] text-muted-foreground">
                      ≈{' '}
                      <span className="font-medium text-foreground">
                        {formatKes(
                          Math.round(
                            Math.max(0, Number(pricePer) || 0) * Math.max(0, Math.floor(Number(saleUnits) || 0)),
                          ),
                        )}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {saleMode === 'market' && (
                <div className="space-y-2 rounded-lg border border-border/50 bg-muted/15 p-2.5 sm:p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Market</Label>
                    <Select
                      value={marketSelect || '__none__'}
                      onValueChange={(v) => setMarketSelect(v === '__none__' ? '' : v)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="min-h-10 rounded-lg">
                        <SelectValue placeholder="Select market" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {marketOptions.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full sm:w-auto touch-manipulation text-xs"
                    disabled={!canEdit}
                    onClick={() => setAddMarketOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                  <div className="space-y-1">
                    <Label className="text-xs">Broker</Label>
                    <Select
                      value={brokerEmployeeId || '__none__'}
                      onValueChange={(v) => setBrokerEmployeeId(v === '__none__' ? '' : v)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="min-h-10 rounded-lg">
                        <SelectValue placeholder={brokerEmployees.length ? 'Select broker' : 'No brokers yet'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {brokerEmployees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {brokerEmployees.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">Add Sales (Broker) on Employees.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sent</Label>
                    <Input
                      inputMode="numeric"
                      value={marketContainersSent}
                      onChange={(e) => setMarketContainersSent(e.target.value)}
                      disabled={!canEdit}
                      className="min-h-10 rounded-lg"
                    />
                  </div>
                  {canViewHarvestFinancials &&
                    (dispatch ? (
                      <div className="rounded-md border border-border/60 bg-background/80 p-2 text-[11px] space-y-1">
                        <p className="font-semibold text-foreground">Broker market (live)</p>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
                          <span>Sales</span>
                          <span className="text-right font-medium text-foreground tabular-nums">
                            {formatKes(Number(dispatch.broker_sales_revenue ?? 0))}
                          </span>
                          <span>Market expenses</span>
                          <span className="text-right font-medium text-foreground tabular-nums">
                            {formatKes(Number(dispatch.market_expenses_total ?? 0))}
                          </span>
                          <span>Net (market)</span>
                          <span className="text-right font-medium text-foreground tabular-nums">
                            {formatKes(Number(dispatch.net_market_profit ?? 0))}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Buyers and market costs are recorded by the assigned broker.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">Revenue pending</p>
                    ))}
                </div>
              )}

              {canViewHarvestFinancials &&
                saleMode === 'market' &&
                dispatch &&
                dispatch.status === 'pending' && (
                  <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.05] p-2.5 sm:p-3">
                    <p className="text-xs font-medium">After sale — price / total</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Price / container</Label>
                        <Input
                          inputMode="decimal"
                          value={marketUpdatePrice}
                          onChange={(e) => setMarketUpdatePrice(e.target.value)}
                          disabled={!canEdit}
                          className="min-h-10 rounded-lg"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total (KES)</Label>
                        <Input
                          inputMode="decimal"
                          value={marketUpdateTotalRev}
                          onChange={(e) => setMarketUpdateTotalRev(e.target.value)}
                          disabled={!canEdit}
                          placeholder="Optional"
                          className="min-h-10 rounded-lg"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-9 touch-manipulation"
                      disabled={!canEdit || savingMarketPricing}
                      onClick={() => void saveMarketPricing()}
                    >
                      {savingMarketPricing ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                )}

              <Button
                type="button"
                size="sm"
                className="min-h-10 rounded-lg touch-manipulation w-full sm:w-auto font-medium"
                disabled={!canEdit || savingDestination}
                onClick={() => void saveDestination()}
              >
                {savingDestination ? 'Saving…' : 'Save'}
              </Button>

              <Dialog open={addMarketOpen} onOpenChange={setAddMarketOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add market</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1">
                      <Label htmlFor="th-new-market-name">Market name</Label>
                      <Input
                        id="th-new-market-name"
                        value={newMarketName}
                        onChange={(e) => setNewMarketName(e.target.value)}
                        placeholder="e.g. Wakulima"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="th-new-market-loc">Location (optional)</Label>
                      <Input
                        id="th-new-market-loc"
                        value={newMarketLocation}
                        onChange={(e) => setNewMarketLocation(e.target.value)}
                        placeholder="Area / notes"
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => setAddMarketOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={savingNewMarket || !newMarketName.trim()}
                      onClick={() => void handleAddCustomMarket()}
                    >
                      {savingNewMarket ? 'Saving…' : 'Save'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {activeSection === 'activity' && (
            <ScrollArea className="h-[min(24rem,50vh)] pr-3">
              <ul className="text-sm space-y-1">
                {recentLogs.length === 0 ? (
                  <li className="text-muted-foreground">No actions yet.</li>
                ) : (
                  recentLogs.map(({ log, label }) => (
                    <li key={log.id} className="flex justify-between gap-2 border-b border-border/60 py-1">
                      <span>
                        +{log.units} bucket → {label}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </ScrollArea>
          )}

          {activeSection === 'rate' && (
            <div className="space-y-3 max-w-md">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">KES / bucket</Label>
                <Input
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  inputMode="decimal"
                  disabled={!canEdit}
                  className="min-h-10 rounded-lg"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="min-h-10 rounded-lg touch-manipulation"
                disabled={!canEdit || savingRate}
                onClick={() => void saveRate()}
              >
                {savingRate ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <Button type="button" variant="secondary" className="w-full" onClick={() => void toggleStatus()}>
          {session.status === 'completed' ? 'Reopen session (collecting)' : 'Mark session complete'}
        </Button>
      )}

      <Dialog
        open={Boolean(pickerModal)}
        onOpenChange={(open) => {
          if (!open) {
            setPickerModal(null);
            setExpandedPickerLogId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[min(90vh,640px)] flex flex-col gap-0 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              #{activePickerModal?.picker_number} {activePickerModal?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden py-2">
            <div className="shrink-0 flex flex-wrap items-center gap-2">
              <TallyMarksDisplay count={activePickerModal?.bucketCount ?? 0} />
            </div>
            <p className="shrink-0 text-2xl font-bold tabular-nums">{activePickerModal?.bucketCount ?? 0} buckets</p>
            <Button
              className="shrink-0 w-full touch-manipulation"
              disabled={!canEdit || bucketInFlight}
              onClick={() => activePickerModal && void handleAddBucket(activePickerModal)}
            >
              {bucketInFlight ? 'Adding…' : '+ Add bucket'}
            </Button>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Entries</p>
              <ScrollArea className="min-h-[8rem] flex-1 pr-3">
                {loadingLogs && modalPickerLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading entries…</p>
                ) : modalPickerLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bucket entries yet for this picker.</p>
                ) : (
                  <ul className="space-y-1 pb-1">
                    {modalPickerLogs.map((log) => {
                      const at = new Date(log.created_at);
                      const shortWhen = Number.isNaN(at.getTime())
                        ? '—'
                        : at.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                      const expanded = expandedPickerLogId === log.id;
                      return (
                        <li key={log.id}>
                          <button
                            type="button"
                            className={cn(
                              'w-full rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/45',
                              expanded && 'ring-1 ring-primary/30 bg-muted/35',
                            )}
                            onClick={() =>
                              setExpandedPickerLogId((cur) => (cur === log.id ? null : log.id))
                            }
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium tabular-nums">
                                +{log.units} bucket{log.units !== 1 ? 's' : ''}
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{shortWhen}</span>
                            </div>
                            {expanded && (
                              <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                                <p>
                                  {Number.isNaN(at.getTime())
                                    ? '—'
                                    : at.toLocaleString(undefined, {
                                        dateStyle: 'medium',
                                        timeStyle: 'medium',
                                      })}
                                </p>
                                {log.recorded_by ? (
                                  <p className="text-[11px] opacity-90">
                                    Recorded by{' '}
                                    <span className="font-medium text-foreground">
                                      {recorderNames.get(log.recorded_by.trim()) ?? '…'}
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addPickerOpen} onOpenChange={setAddPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New picker</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Picker number</Label>
              <Input
                value={addPickerNumber}
                onChange={(e) => setAddPickerNumber(e.target.value)}
                disabled={addPickerNumberLocked}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={addPickerName} onChange={(e) => setAddPickerName(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" type="button" onClick={() => setAddPickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={savingPicker} onClick={() => void saveNewPicker()}>
              {savingPicker ? 'Saving…' : 'Save picker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
