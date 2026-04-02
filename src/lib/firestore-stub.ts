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

export type DocumentData = Record<string, unknown>;

export interface DocumentReference {
  id: string;
  path: string;
}

export interface CollectionReference {
  id: string;
  path: string;
}

export interface DocumentSnapshot {
  exists(): boolean;
  id: string;
  data(): DocumentData;
  ref: DocumentReference;
}

export interface QueryDocumentSnapshot extends DocumentSnapshot {}

export interface QuerySnapshot {
  docs: QueryDocumentSnapshot[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  empty: boolean;
}

export interface WriteBatch {
  delete(ref: DocumentReference): WriteBatch;
  commit(): Promise<void>;
}

export type QueryConstraint = unknown;
export type Query = unknown;
export type Unsubscribe = () => void;

function docRefFromSegments(segments: string[]): DocumentReference {
  const id = segments.length > 0 ? segments[segments.length - 1]! : '';
  return { id, path: segments.join('/') };
}

function emptyDocumentSnapshot(ref: DocumentReference): DocumentSnapshot {
  return {
    exists: () => false,
    id: ref.id,
    data: () => ({}),
    ref,
  };
}

const EMPTY_SNAPSHOT: QuerySnapshot = {
  docs: [],
  metadata: { fromCache: false, hasPendingWrites: false },
  empty: true,
};

export const Timestamp = {
  now: () => throwStub(),
  fromDate: (_: Date) => throwStub(),
  fromMillis: (_: number) => throwStub(),
};

export function collection(_db: unknown, path: string, ...pathSegments: string[]): CollectionReference {
  const segments = [path, ...pathSegments];
  return { id: path, path: segments.join('/') };
}

export function doc(_db: unknown, path: string, ...pathSegments: string[]): DocumentReference {
  return docRefFromSegments([path, ...pathSegments]);
}

export function getDoc(ref: unknown): Promise<DocumentSnapshot> {
  return Promise.resolve(emptyDocumentSnapshot(ref as DocumentReference));
}

export function getDocs(_query: unknown): Promise<QuerySnapshot> {
  return Promise.resolve(EMPTY_SNAPSHOT);
}

export function addDoc(_ref: unknown, _data: unknown): Promise<DocumentReference> {
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

/** Accepts field name or `documentId()` (FieldPath sentinel in real Firebase). */
export function orderBy(_field: unknown, _dir?: string): QueryConstraint {
  return {};
}

export function limit(_n: number): QueryConstraint {
  return {};
}

export function onSnapshot(
  _query: unknown,
  _optionsOrCb: unknown,
  _cb?: (snapshot: QuerySnapshot) => void,
  _err?: (err: Error) => void,
): Unsubscribe {
  const cb = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
  if (cb) {
    queueMicrotask(() => cb(EMPTY_SNAPSHOT));
  }
  return () => {};
}

export function writeBatch(_db: unknown): WriteBatch {
  return {
    delete(_ref: DocumentReference) {
      return this;
    },
    commit() {
      return Promise.reject(new Error(msg));
    },
  };
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

export function getDocFromCache(_ref: unknown): Promise<DocumentSnapshot | null> {
  return Promise.resolve(null);
}

export function getDocsFromCache(_query: unknown): Promise<QuerySnapshot> {
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

/** Matches Firebase modular `getCountFromServer` aggregate snapshot: `.data().count`. */
export function getCountFromServer(_query: unknown): Promise<{ data: () => { count: number } }> {
  return Promise.resolve({
    data: () => ({ count: 0 }),
  });
}
