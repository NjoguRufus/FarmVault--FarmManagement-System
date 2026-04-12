import { describe, expect, it } from 'vitest';
import {
  ConcurrentUpdateConflictError,
  CONCURRENT_UPDATE_MESSAGE,
  isConcurrentUpdateConflict,
  throwIfUpdateReturnedNoRows,
} from '@/lib/concurrentUpdate';

describe('concurrentUpdate', () => {
  it('throwIfUpdateReturnedNoRows throws when data empty', () => {
    expect(() => throwIfUpdateReturnedNoRows([], null)).toThrow(ConcurrentUpdateConflictError);
  });

  it('throwIfUpdateReturnedNoRows throws when data null', () => {
    expect(() => throwIfUpdateReturnedNoRows(null, null)).toThrow(ConcurrentUpdateConflictError);
  });

  it('throwIfUpdateReturnedNoRows passes when a row returned', () => {
    expect(() => throwIfUpdateReturnedNoRows([{ id: '1' }], null)).not.toThrow();
  });

  it('isConcurrentUpdateConflict detects conflict error', () => {
    expect(isConcurrentUpdateConflict(new ConcurrentUpdateConflictError())).toBe(true);
    expect(isConcurrentUpdateConflict(new Error('other'))).toBe(false);
  });

  it('default message is stable', () => {
    expect(new ConcurrentUpdateConflictError().message).toBe(CONCURRENT_UPDATE_MESSAGE);
  });
});
