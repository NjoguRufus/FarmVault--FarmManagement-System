import { useEffect, useMemo, useState } from 'react';
import {
  BUILTIN_CROP_CATALOG,
  type CropCatalogDoc,
  type CropKnowledge,
  normalizeCropTypeKey,
} from '@/knowledge/cropCatalog';
import { subscribeCropCatalog } from '@/services/cropCatalogService';

interface UseCropCatalogResult {
  crops: CropKnowledge[];
  customCrops: CropCatalogDoc[];
  isLoading: boolean;
}

export function useCropCatalog(companyId: string | null | undefined): UseCropCatalogResult {
  const [customCrops, setCustomCrops] = useState<CropCatalogDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setCustomCrops([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeCropCatalog(companyId, (rows) => {
      setCustomCrops(rows);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const crops = useMemo(() => {
    const merged = new Map<string, CropKnowledge>();

    BUILTIN_CROP_CATALOG.forEach((crop) => {
      const key = normalizeCropTypeKey(crop.cropTypeKey);
      if (!key) return;
      merged.set(key, crop);
    });

    customCrops.forEach((crop) => {
      const key = normalizeCropTypeKey(crop.cropTypeKey);
      if (!key) return;
      // Custom entry overrides built-in when keys match.
      merged.set(key, crop);
    });

    return Array.from(merged.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }),
    );
  }, [customCrops]);

  return {
    crops,
    customCrops,
    isLoading,
  };
}
