/**
 * @deprecated Company registration uses Clerk. Do not call from new code.
 */
export async function registerCompanyAdmin(_email: string, _password: string): Promise<never> {
  throw new Error('Registration uses Clerk. Use the Clerk sign-up flow instead.');
}
