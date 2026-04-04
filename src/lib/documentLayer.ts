/**
 * Legacy document-style API retained only for unmigrated call sites.
 * New code should use Supabase (@/lib/supabase, @/lib/db).
 *
 * Reads resolve empty; mutating calls throw with a clear migration hint.
 */

const writeMsg =
  'This write path is disabled. The app uses Supabase — migrate this call site to the Supabase client or an RPC.';

const readRetiredMsg =
  'This read path is disabled. The app uses Supabase — migrate this call site to the Supabase client.';

function throwWrite(): never {
  throw new Error(writeMsg);
}

function throwReadRetired(): never {
  throw new Error(readRetiredMsg);
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
  now: () => throwReadRetired(),
  fromDate: (_: Date) => throwReadRetired(),
  fromMillis: (_: number) => throwReadRetired(),
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
  throwWrite();
}

export function setDoc(_ref: unknown, _data: unknown, _opts?: unknown): Promise<void> {
  throwWrite();
}

export function updateDoc(_ref: unknown, _data: unknown): Promise<void> {
  throwWrite();
}

export function deleteDoc(_ref: unknown): Promise<void> {
  throwWrite();
}

export function query(_ref: unknown, ..._constraints: unknown[]): unknown {
  return _ref;
}

export function where(_field: string, _op: string, _value: unknown): QueryConstraint {
  return {};
}

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
      return Promise.reject(new Error(writeMsg));
    },
  };
}

export function increment(_n: number): unknown {
  throwWrite();
}

export function arrayUnion(..._items: unknown[]): unknown {
  throwWrite();
}

export function serverTimestamp(): unknown {
  throwWrite();
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
  throwWrite();
}

export function startAfter(_snap: unknown): QueryConstraint {
  return {};
}

/** Aggregate count helper matching prior modular client shape: `.data().count`. */
export function getCountFromServer(_query: unknown): Promise<{ data: () => { count: number } }> {
  return Promise.resolve({
    data: () => ({ count: 0 }),
  });
}

// --- App tokens (replaces former env-driven client singletons) ---

export const app = null as unknown as { name?: string };

function throwTokenAccess(): never {
  throw new Error(
    'Legacy auth/db token accessed. Use Clerk for authentication and Supabase for data.',
  );
}

const tokenProxy = new Proxy(
  {},
  {
    get() {
      throwTokenAccess();
    },
  },
);

export const auth = tokenProxy as unknown as {
  currentUser?: { uid?: string; displayName?: string | null; email?: string | null } | null;
  signOut?: () => Promise<void>;
};
export const authEmployeeCreate = auth;
export const db = tokenProxy as unknown as { type?: string };
export const analyticsPromise = Promise.resolve(null);

/** @deprecated Employee creation uses Supabase `inviteEmployee`; this path is not used when `employeesProvider` is `supabase`. */
export function createUserWithEmailAndPassword(
  _auth: unknown,
  _email: string,
  _password: string,
): Promise<{ user: { uid: string } }> {
  throw new Error(
    'Legacy email/password employee creation is disabled. Use Supabase employee invites (VITE_EMPLOYEES_PROVIDER=supabase).',
  );
}
