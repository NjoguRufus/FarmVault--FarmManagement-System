import React from 'react';
import { AuthLoadingScreen } from '@/components/auth/AuthLoadingScreen';

/** App-wide loading shell for role and auth gates. */
export function Loader(props: { message?: string }) {
  return <AuthLoadingScreen message={props.message} />;
}
