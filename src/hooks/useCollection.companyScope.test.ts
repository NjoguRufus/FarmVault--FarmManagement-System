import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/documentLayer', () => {
  const where = vi.fn((field: string, op: string, value: unknown) => ({
    type: 'where',
    field,
    op,
    value,
  }));
  const orderBy = vi.fn((field: string, dir: string) => ({
    type: 'orderBy',
    field,
    dir,
  }));
  const limitFn = vi.fn((n: number) => ({
    type: 'limit',
    n,
  }));

  return {
    where,
    orderBy,
    limit: limitFn,
    collection: vi.fn(),
    onSnapshot: vi.fn(),
    query: vi.fn(),
    getDocsFromCache: vi.fn(),
  };
});

import type { UseCollectionOptions } from '@/hooks/useCollection';
import { buildScopedConstraints } from '@/hooks/useCollection';

type FakeConstraint =
  | { type: 'where'; field: string; op: string; value: unknown }
  | { type: 'orderBy'; field: string; dir: string }
  | { type: 'limit'; n: number };

describe('company scope query builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes companyId where-clause when companyScoped and companyId provided', () => {
    const options: UseCollectionOptions = { companyScoped: true, companyId: 'company-123' };
    const constraints = buildScopedConstraints(options) as FakeConstraint[];

    const companyFilter = constraints.find(
      (c) => c.type === 'where' && c.field === 'companyId',
    ) as FakeConstraint | undefined;

    expect(companyFilter).toBeDefined();
    if (companyFilter && companyFilter.type === 'where') {
      expect(companyFilter.op).toBe('==');
      expect(companyFilter.value).toBe('company-123');
    }
  });

  it('omits companyId filter when companyScoped is false', () => {
    const options: UseCollectionOptions = { companyScoped: false, companyId: 'company-123' };
    const constraints = buildScopedConstraints(options) as FakeConstraint[];

    const companyFilter = constraints.find(
      (c) => c.type === 'where' && c.field === 'companyId',
    );
    expect(companyFilter).toBeUndefined();
  });

  it('omits companyId filter when companyId is missing', () => {
    const options: UseCollectionOptions = { companyScoped: true, companyId: null };
    const constraints = buildScopedConstraints(options) as FakeConstraint[];

    const companyFilter = constraints.find(
      (c) => c.type === 'where' && c.field === 'companyId',
    );
    expect(companyFilter).toBeUndefined();
  });
});

