/**
 * Stub for firebase/auth. Firebase has been removed; use Clerk for auth.
 */
const msg = 'Firebase has been removed. Use Clerk for authentication.';

function throwStub(): never {
  throw new Error(msg);
}

export function createUserWithEmailAndPassword(
  _auth: unknown,
  _email: string,
  _password: string
): Promise<{ user: unknown }> {
  throwStub();
}
