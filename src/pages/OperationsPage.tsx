import React, { useMemo, useState } from 'react';
import { Plus, Search, Wrench, MoreHorizontal, CheckCircle, Clock, CalendarDays, X } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { useCollection } from '@/hooks/useCollection';
import { WorkLog, Employee, CropStage, InventoryItem, InventoryCategory, InventoryCategoryItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentStageForProject } from '@/services/stageService';
import { syncTodaysLabourExpenses } from '@/services/workLogService';
import { recordInventoryUsage } from '@/services/inventoryService';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

export default function OperationsPage() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const { data: allWorkLogs = [], isLoading } = useCollection<WorkLog>('workLogs', 'workLogs');
  const { data: allEmployees = [] } = useCollection<Employee>('employees', 'employees');
  const { data: allStages = [] } = useCollection<CropStage>('projectStages', 'projectStages');
  const { data: allInventoryItems = [] } = useCollection<InventoryItem>('inventoryItems', 'inventoryItems');
  const { data: allCategories = [] } = useCollection<InventoryCategoryItem>(
    'inventoryCategories',
    'inventoryCategories',
  );
  
  // Get categories for the company
  const categories = useMemo(() => {
    if (!user?.companyId) return [];
    return allCategories.filter((cat) => cat.companyId === user.companyId);
  }, [allCategories, user?.companyId]);
  
  // Default categories if none exist
  const defaultCategories = ['fertilizer', 'chemical', 'diesel', 'materials'];
  const availableCategories = useMemo(() => {
    const categoryNames = categories.map((cat) => cat.name.toLowerCase());
    const defaults = defaultCategories.filter((def) => !categoryNames.includes(def));
    return [
      ...categories.map((cat) => cat.name),
      ...defaults,
    ].sort();
  }, [categories]);

  const [search, setSearch] = useState('');

  const workLogs = useMemo(() => {
    const scoped = activeProject
      ? allWorkLogs.filter((w) => w.projectId === activeProject.id)
      : allWorkLogs;

    if (!search) return scoped;
    return scoped.filter((w) =>
      w.workCategory.toLowerCase().includes(search.toLowerCase()) ||
      (w.notes ?? '').toLowerCase().includes(search.toLowerCase()),
    );
  }, [allWorkLogs, activeProject, search]);

  const getPaidBadge = (paid?: boolean) =>
    paid ? 'fv-badge--active' : 'fv-badge--warning';

  const getPaidIcon = (paid?: boolean) =>
    paid ? <CheckCircle className="h-5 w-5 text-fv-success" /> : <Clock className="h-5 w-5 text-fv-warning" />;

  const getAssigneeName = (employeeId?: string) => {
    if (!employeeId) return 'Unassigned';
    const employee = allEmployees.find(e => e.id === employeeId);
    return employee?.name || 'Unknown';
  };

  const [addOpen, setAddOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [workCategory, setWorkCategory] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('');
  const [ratePerPerson, setRatePerPerson] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  type InputUsageItem = {
    id: string;
    type: InventoryCategory;
    itemId: string;
    quantity: string;
    drumsSprayed?: string;
  };

  const [inputUsages, setInputUsages] = useState<InputUsageItem[]>([]);

  const currentStage = useMemo(() => {
    if (!activeProject) return null;
    const stages = allStages.filter(
      (s) =>
        s.projectId === activeProject.id &&
        s.companyId === activeProject.companyId &&
        s.cropType === activeProject.cropType,
    );
    return getCurrentStageForProject(stages);
  }, [allStages, activeProject]);

  const companyInventory = useMemo(
    () =>
      activeProject
        ? allInventoryItems.filter((i) => i.companyId === activeProject.companyId)
        : allInventoryItems,
    [allInventoryItems, activeProject],
  );

  const chemicalItems = useMemo(
    () => companyInventory.filter((i) => i.category === 'chemical'),
    [companyInventory],
  );
  const fertilizerItems = useMemo(
    () => companyInventory.filter((i) => i.category === 'fertilizer'),
    [companyInventory],
  );
  const fuelItems = useMemo(
    () => companyInventory.filter((i) => i.category === 'diesel'),
    [companyInventory],
  );

  const addInputUsage = (type?: InventoryCategory) => {
    setInputUsages([
      ...inputUsages,
      { id: Date.now().toString(), type: type || 'fertilizer', itemId: '', quantity: '' },
    ]);
  };

  const removeInputUsage = (id: string) => {
    setInputUsages(inputUsages.filter((item) => item.id !== id));
  };

  const updateInputUsage = (id: string, field: keyof InputUsageItem, value: string) => {
    setInputUsages(
      inputUsages.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // If category changes, clear the selected item
          if (field === 'type') {
            updated.itemId = '';
          }
          return updated;
        }
        return item;
      }),
    );
  };

  const getItemsForCategory = (category: InventoryCategory) => {
    return companyInventory.filter((i) => i.category === category);
  };

  const handleAddWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    if (!date || !currentStage) return;
    setSaving(true);
    try {
      const workLogRef = await addDoc(collection(db, 'workLogs'), {
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        cropType: activeProject.cropType,
        stageIndex: currentStage.stageIndex,
        stageName: currentStage.stageName,
        date,
        workCategory,
        numberOfPeople: Number(numberOfPeople || '0'),
        ratePerPerson: ratePerPerson ? Number(ratePerPerson) : undefined,
        notes: notes || undefined,
        managerId: user?.id,
        adminName: user?.name,
        paid: false,
        createdAt: serverTimestamp(),
      });
      const workLogId = workLogRef.id;

      const usageDate = date instanceof Date ? date : new Date(date);

      const recordIfNeeded = async (
        category: InventoryCategory,
        inventoryItemId: string,
        quantityStr: string,
        extra?: { drumsSprayed?: number },
      ) => {
        const quantityVal = Number(quantityStr || '0');
        if (!inventoryItemId || !quantityVal) return;
        const item = companyInventory.find((i) => i.id === inventoryItemId);
        if (!item) return;
        await recordInventoryUsage({
          companyId: activeProject.companyId,
          projectId: activeProject.id,
          inventoryItemId,
          category,
          quantity: quantityVal,
          unit: item.unit,
          source: 'workLog',
          workLogId,
          stageIndex: currentStage.stageIndex,
          stageName: currentStage.stageName,
          date: usageDate,
        });
      };

      await Promise.all(
        inputUsages
          .filter((usage) => usage.itemId && usage.quantity)
          .map((usage) =>
            recordIfNeeded(
              usage.type,
              usage.itemId,
              usage.quantity,
              usage.type === 'chemical' && usage.drumsSprayed
                ? { drumsSprayed: Number(usage.drumsSprayed || '0') || undefined }
                : undefined,
            ),
          ),
      );

      // Clear form but keep modal open for multiple entries
      setWorkCategory('');
      setNumberOfPeople('');
      setRatePerPerson('');
      setNotes('');
      setInputUsages([]);
      setDate(new Date());
    } finally {
      setSaving(false);
    }
  };

  const handleSyncTodaysLabour = async () => {
    if (!activeProject || !user) return;
    setSyncing(true);
    try {
      await syncTodaysLabourExpenses({
        companyId: activeProject.companyId,
        projectId: activeProject.id,
        date: new Date(),
        paidByUserId: user.id,
        paidByName: user.name,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daily Work Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Capture daily work for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'Record labour and input usage per day'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="fv-btn fv-btn--secondary"
            disabled={syncing}
            onClick={handleSyncTodaysLabour}
          >
            {syncing ? 'Syncing…' : "Sync Today's Labour"}
          </button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button className="fv-btn fv-btn--primary">
                <Plus className="h-4 w-4" />
                Log Daily Work
              </button>
            </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log Daily Work</DialogTitle>
            </DialogHeader>
            {!activeProject ? (
              <p className="text-sm text-muted-foreground">
                Select a project first to log work.
              </p>
            ) : (
              <form onSubmit={handleAddWorkLog} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'fv-input w-full justify-start text-left font-normal',
                            !date && 'text-muted-foreground',
                          )}
                        >
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {date ? format(date, 'PPP') : <span>Pick a date</span>}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={setDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Work type</label>
                    <input
                      className="fv-input"
                      value={workCategory}
                      onChange={(e) => setWorkCategory(e.target.value)}
                      required
                      placeholder="Spraying, Fertilizer application, Watering..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Number of people</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={numberOfPeople}
                      onChange={(e) => setNumberOfPeople(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Rate per person (optional)</label>
                    <input
                      type="number"
                      min={0}
                      className="fv-input"
                      value={ratePerPerson}
                      onChange={(e) => setRatePerPerson(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Notes</label>
                  <textarea
                    className="fv-input resize-none"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Input usage sections */}
                <div className="space-y-3 border-t pt-3 mt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Inputs used (optional)
                    </p>
                  </div>

                  {inputUsages.map((usage) => (
                    <div key={usage.id} className="flex flex-col sm:flex-row gap-2 p-3 border rounded-lg bg-muted/20">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Category</label>
                          <Select
                            value={usage.type}
                            onValueChange={(value) => updateInputUsage(usage.id, 'type', value as InventoryCategory)}
                          >
                            <SelectTrigger className="w-full text-sm h-9">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableCategories.map((cat) => (
                                <SelectItem key={cat} value={cat.toLowerCase()}>
                                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Item</label>
                          <Select
                            value={usage.itemId}
                            onValueChange={(value) => updateInputUsage(usage.id, 'itemId', value)}
                            disabled={!usage.type}
                          >
                            <SelectTrigger className="w-full text-sm h-9">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {getItemsForCategory(usage.type).length === 0 ? (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                  No {usage.type} items available
                                </div>
                              ) : (
                                getItemsForCategory(usage.type).map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name} ({item.unit})
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">Quantity</label>
                          <input
                            type="number"
                            min={0}
                            className="fv-input text-sm h-9"
                            value={usage.quantity}
                            onChange={(e) => updateInputUsage(usage.id, 'quantity', e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        {usage.type === 'chemical' && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground">Drums sprayed</label>
                            <input
                              type="number"
                              min={0}
                              className="fv-input text-sm h-9"
                              value={usage.drumsSprayed || ''}
                              onChange={(e) => updateInputUsage(usage.id, 'drumsSprayed', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInputUsage(usage.id)}
                        className="p-2 hover:bg-destructive/10 rounded-md transition-colors self-start sm:self-center"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addInputUsage()}
                      className="fv-btn fv-btn--secondary text-xs py-1.5 px-3"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Input
                    </button>
                  </div>
                </div>
                <DialogFooter>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="fv-btn fv-btn--primary"
                  >
                    {saving ? 'Saving…' : 'Save Work Log'}
                  </button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-success/10">
            <CheckCircle className="h-6 w-6 text-fv-success" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Paid logs</p>
            <p className="text-2xl font-bold">{workLogs.filter((w) => w.paid).length}</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-warning/10">
            <Clock className="h-6 w-6 text-fv-warning" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Unpaid logs</p>
            <p className="text-2xl font-bold">{workLogs.filter((w) => !w.paid).length}</p>
          </div>
        </div>
        <div className="fv-card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fv-info/10">
            <CalendarDays className="h-6 w-6 text-fv-info" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total logs</p>
            <p className="text-2xl font-bold">{workLogs.length}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search work logs..."
            className="fv-input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Work Logs List */}
      <div className="fv-card">
        <div className="space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading work logs…</p>
          )}
          {workLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-4 p-4 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="shrink-0 mt-1">
                {getPaidIcon(log.paid)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{log.workCategory}</h3>
                      <span className={cn('fv-badge capitalize text-xs', getPaidBadge(log.paid))}>
                        {log.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {log.numberOfPeople} people
                      {log.ratePerPerson ? ` @ KES ${log.ratePerPerson.toLocaleString()}` : ''}
                    </p>
                    {log.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {log.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    {new Date(log.date as any).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span>•</span>
                  <span>Stage: {log.stageName}</span>
                  <span>•</span>
                  <span>Manager: {getAssigneeName(log.managerId)}</span>
                </div>
              </div>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ))}

          {workLogs.length === 0 && (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Work Logged</h3>
              <p className="text-sm text-muted-foreground">
                Click "Log Daily Work" to capture today&apos;s activities.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
