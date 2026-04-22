import { describe, it, expect } from 'vitest';
import { buildIdempotencyKey } from '@/lib/localData/localSyncQueue';

describe('localSyncQueue', () => {
  it('buildIdempotencyKey is stable for the same operation', () => {
    const a = buildIdempotencyKey('ADD_EXPENSE', 'expenses', '550e8400-e29b-41d4-a716-446655440000');
    const b = buildIdempotencyKey('ADD_EXPENSE', 'expenses', '550e8400-e29b-41d4-a716-446655440000');
    expect(a).toBe(b);
  });
});
