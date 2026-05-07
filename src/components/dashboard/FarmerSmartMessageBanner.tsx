import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SmartFarmBanner } from '@/components/companion/banners/SmartFarmBanner';

type Props = {
  companyId: string | null;
  clerkUserId: string | null;
};

export function FarmerSmartMessageBanner({ companyId, clerkUserId }: Props) {
  const { user } = useAuth();
  return (
    <SmartFarmBanner
      companyId={companyId}
      clerkUserId={clerkUserId}
      userName={user?.name ?? 'Farmer'}
      farmName={user?.name ?? ''}
    />
  );
}
