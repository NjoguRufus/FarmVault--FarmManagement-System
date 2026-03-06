/**
 * Firebase has been removed. App uses Supabase + Clerk only.
 * Stub exports so existing imports do not break; using these at runtime will throw.
 */
const msg = 'Firebase has been removed. Use Supabase and Clerk.';

function throwStub(): never {
  throw new Error(msg);
}

const stub = new Proxy(
  {},
  {
    get() {
      throwStub();
    },
  }
);

export const app = null as unknown as { name?: string };
export const auth = stub as unknown as { signOut?: () => Promise<void> };
export const authEmployeeCreate = stub as unknown as { signOut?: () => Promise<void> };
export const db = stub as unknown as { type?: string };
export const analyticsPromise = Promise.resolve(null);
