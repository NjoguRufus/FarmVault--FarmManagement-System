import { useCallback, useMemo, useState } from 'react';
import { addCustomWorkCategory, loadCustomWorkCategories } from '@/lib/customWorkCategoriesStorage';
import { mergeWorkTypesWithCustom } from '@/lib/workTypeConstants';

export function useFarmWorkCategories(companyId: string | null) {
  const [rev, setRev] = useState(0);

  const custom = useMemo(() => {
    void rev;
    return loadCustomWorkCategories(companyId);
  }, [companyId, rev]);

  const allWorkTypes = useMemo(() => mergeWorkTypesWithCustom(custom), [custom]);

  const add = useCallback(
    (name: string) => {
      if (addCustomWorkCategory(companyId, name)) {
        setRev((r) => r + 1);
        return true;
      }
      return false;
    },
    [companyId]
  );

  return { custom, allWorkTypes, add };
}
