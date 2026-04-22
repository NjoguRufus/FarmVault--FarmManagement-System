import { useEffect, useState } from 'react';
import { getNetworkState, subscribeNetworkState } from '@/lib/localData/networkManager';

export function useNetworkState() {
  const [state, setState] = useState(getNetworkState);
  useEffect(() => {
    setState(getNetworkState());
    return subscribeNetworkState(() => setState(getNetworkState()));
  }, []);
  return state;
}
