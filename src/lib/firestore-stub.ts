/**
 * Stub for firebase/firestore. Firebase has been removed; use Supabase.
 * Read operations (collection, query, onSnapshot, where, orderBy, limit, getDocsFromCache)
 * return empty/no-op so existing hooks (useCollection, cropCatalogService) do not crash.
 * Write operations still throw so callers are forced to migrate to Supabase.
 */
const msg = 'Firebase has been removed. Use Supabase for database operations.';

function throwStub(): never {
  throw new Error(msg);
}

const EMPTY_SNAPSHOT = {
  docs: [],
  metadata: { fromCache: false, hasPendingWrites: false },
};

export type QueryConstraint = unknown;
export type DocumentSnapshot = unknown;
export type DocumentReference = unknown;
export type CollectionReference = unknown;
export type Query = unknown;
export type WriteBatch = unknown;
export type Unsubscribe = () => void;

export const Timestamp = {
  now: () => throwStub(),
  fromDate: (_: Date) => throwStub(),
  fromMillis: (_: number) => throwStub(),
};

export function collection(_db: unknown, _path: string, ..._rest: string[]): unknown {
  return { _path };
}
export function doc(_db: unknown, _path: string, ..._rest: string[]): unknown {
  throwStub();
}
export function getDoc(_ref: unknown): Promise<unknown> {
  return Promise.resolve(null);
}
export function getDocs(_query: unknown): Promise<unknown> {
  return Promise.resolve(EMPTY_SNAPSHOT);
}
export function addDoc(_ref: unknown, _data: unknown): Promise<unknown> {
  throwStub();
}
export function setDoc(_ref: unknown, _data: unknown, _opts?: unknown): Promise<void> {
  throwStub();
}
export function updateDoc(_ref: unknown, _data: unknown): Promise<void> {
  throwStub();
}
export function deleteDoc(_ref: unknown): Promise<void> {
  throwStub();
}
export function query(_ref: unknown, ..._constraints: unknown[]): unknown {
  return _ref;
}
export function where(_field: string, _op: string, _value: unknown): QueryConstraint {
  return {};
}
export function orderBy(_field: string, _dir?: string): QueryConstraint {
  return {};
}
export function limit(_n: number): QueryConstraint {
  return {};
}
export function onSnapshot(
  _query: unknown,
  _optionsOrCb: unknown,
  _cb?: (snapshot: unknown) => void,
  _err?: (err: Error) => void
): Unsubscribe {
  const cb = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
  if (cb) {
    queueMicrotask(() => cb(EMPTY_SNAPSHOT));
  }
  return () => {};
}
export function writeBatch(_db: unknown): WriteBatch {
  throwStub();
}
export function increment(_n: number): unknown {
  throwStub();
}
export function arrayUnion(..._items: unknown[]): unknown {
  throwStub();
}
export function serverTimestamp(): unknown {
  throwStub();
}
export function getDocFromCache(_ref: unknown): Promise<unknown> {
  return Promise.resolve(null);
}
export function getDocsFromCache(_query: unknown): Promise<unknown> {
  return Promise.resolve(EMPTY_SNAPSHOT);
}
export function documentId(): QueryConstraint {
  return {};
}
export function runTransaction<T>(_db: unknown, _fn: (tx: unknown) => Promise<T>): Promise<T> {
  throwStub();
}
export function startAfter(_snap: unknown): QueryConstraint {
  return {};
}
export function getCountFromServer(_query: unknown): Promise<{ data: { count: number } }> {
  return Promise.resolve({ data: { count: 0 } });
}
export type DocumentData = Record<string, unknown>;
export type QuerySnapshot = unknown;
