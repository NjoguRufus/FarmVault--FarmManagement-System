import React, { useState, useCallback } from 'react';
import { collection, getDocs, writeBatch, doc, limit, query } from '@/lib/firestore-stub';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Database, Loader2 } from 'lucide-react';

const COLLECTIONS_TO_SCAN = [
  'projects',
  'projectStages',
  'workLogs',
  'operationsWorkCards',
  'expenses',
  'seasonChallenges',
  'inventoryItems',
  'inventoryCategories',
  'inventoryUsage',
  'inventoryPurchases',
  'harvests',
  'harvestCollections',
  'harvestPickers',
  'pickerWeighEntries',
  'harvestPaymentBatches',
  'sales',
  'suppliers',
  'deliveries',
  'neededItems',
  'feedback',
] as const;

const LIMIT_PER_COLLECTION = 200;

export default function AdminMigrationPage() {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<Record<string, { total: number; missing: number; docIds: string[] }>>({});
  const [backfilling, setBackfilling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDeveloper = user?.role === 'developer';
  const companyId = user?.companyId ?? null;
  const canRun = isDeveloper || (user?.role === 'company-admin' && companyId);

  const handleScan = useCallback(async () => {
    if (!canRun) return;
    setError(null);
    setScanning(true);
    const next: Record<string, { total: number; missing: number; docIds: string[] }> = {};
    try {
      for (const collName of COLLECTIONS_TO_SCAN) {
        const ref = collection(db, collName);
        const q = query(ref, limit(LIMIT_PER_COLLECTION));
        const snap = await getDocs(q);
        const docIds: string[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.companyId == null || data.companyId === '') {
            docIds.push(d.id);
          }
        });
        next[collName] = { total: snap.size, missing: docIds.length, docIds };
      }
      setResults(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, [canRun]);

  const handleBackfill = useCallback(
    async (collName: string) => {
      if (!companyId || !canRun) return;
      const r = results[collName];
      if (!r || r.missing === 0) return;
      setError(null);
      setBackfilling(collName);
      try {
        const batch = writeBatch(db);
        for (const id of r.docIds) {
          const ref = doc(db, collName, id);
          batch.update(ref, { companyId });
        }
        await batch.commit();
        setResults((prev) => ({
          ...prev,
          [collName]: { ...r, missing: 0, docIds: [] },
        }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBackfilling(null);
      }
    },
    [companyId, canRun, results]
  );

  if (!canRun) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Only developer or company-admin can access this tool.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="h-6 w-6" />
          Backfill companyId (migration)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scan collections for documents missing companyId and optionally claim them to your company. Irreversible.
        </p>
      </div>

      <Card className="border-amber-500/40">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            This tool updates documents in bulk. Only use if you need to fix legacy data. Documents with missing
            companyId will not appear in company-scoped queries until backfilled.
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button onClick={handleScan} disabled={scanning}>
        {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Scan collections (limit {LIMIT_PER_COLLECTION} per collection)
      </Button>

      {Object.keys(results).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {Object.entries(results).map(([coll, { total, missing, docIds }]) => (
                <li key={coll} className="flex items-center justify-between gap-4 py-1 border-b border-border/50 last:border-0">
                  <span className="font-medium">{coll}</span>
                  <span className="text-muted-foreground">
                    {total} docs, {missing} missing companyId
                  </span>
                  {missing > 0 && companyId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBackfill(coll)}
                      disabled={backfilling !== null}
                    >
                      {backfilling === coll ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Claim & backfill ({docIds.length})
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
