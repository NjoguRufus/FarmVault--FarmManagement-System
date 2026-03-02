import { describe, it, expect } from 'vitest';
import type { ProjectWalletLedgerEntry } from '@/services/projectWalletService';
import { computeWalletSummary } from '@/services/projectWalletService';

describe('computeWalletSummary', () => {
  const baseEntry: ProjectWalletLedgerEntry = {
    id: 'e1',
    companyId: 'c1',
    projectId: 'p1',
    type: 'CREDIT',
    amount: 0,
    reason: 'test',
    createdAtLocal: Date.now(),
    createdByUid: 'u1',
    createdByName: 'User',
  };

  it('returns zeros for empty ledger', () => {
    const summary = computeWalletSummary([]);
    expect(summary).toEqual({
      cashReceivedTotal: 0,
      cashPaidOutTotal: 0,
      currentBalance: 0,
    });
  });

  it('accumulates credits and debits correctly', () => {
    const ledger: ProjectWalletLedgerEntry[] = [
      { ...baseEntry, id: 'c1', type: 'CREDIT', amount: 100 },
      { ...baseEntry, id: 'd1', type: 'DEBIT', amount: 40 },
      { ...baseEntry, id: 'd2', type: 'DEBIT', amount: 60 },
      // invalid / non-positive amounts should be ignored
      { ...baseEntry, id: 'ignore1', type: 'CREDIT', amount: 0 },
      { ...baseEntry, id: 'ignore2', type: 'DEBIT', amount: -10 },
    ];

    const summary = computeWalletSummary(ledger);
    expect(summary.cashReceivedTotal).toBe(100);
    expect(summary.cashPaidOutTotal).toBe(100);
    expect(summary.currentBalance).toBe(0);
  });

  it('never returns negative received or paid-out totals', () => {
    const ledger: ProjectWalletLedgerEntry[] = [
      { ...baseEntry, id: 'd1', type: 'DEBIT', amount: 50 },
    ];

    const summary = computeWalletSummary(ledger);
    expect(summary.cashReceivedTotal).toBe(0);
    expect(summary.cashPaidOutTotal).toBe(50);
    expect(summary.currentBalance).toBe(-50);
  });
});

