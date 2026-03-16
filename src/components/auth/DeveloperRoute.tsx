import React from 'react';
import { RequireDeveloper } from '@/components/auth/RequireDeveloper';

interface DeveloperRouteProps {
  children: React.ReactElement;
}

export function DeveloperRoute({ children }: DeveloperRouteProps) {
  return <RequireDeveloper>{children}</RequireDeveloper>;
}

