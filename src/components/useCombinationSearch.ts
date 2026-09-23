import { useEffect, useState } from 'react';
import type { Combination, suggestCombinations } from '../analysis/combinations';

export interface CombinationSearchRequest {
  selections: Parameters<typeof suggestCombinations>[0];
  bookmaker: string;
  now: number;
  maxLegs: number;
  options: Parameters<typeof suggestCombinations>[4];
}

export function useCombinationSearch(request: CombinationSearchRequest | null) {
  const [result, setResult] = useState<{
    request: CombinationSearchRequest;
    combos: Combination[];
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!request) return;
    let active = true;
    let worker: Worker | undefined;
    const fail = () => {
      if (active)
        setResult({ request, combos: [], error: 'Combivoorstellen berekenen is mislukt.' });
      worker?.terminate();
    };
    try {
      worker = new Worker(new URL('../analysis/combinations.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }: MessageEvent<Combination[]>) => {
        if (active) setResult({ request, combos: data, error: '' });
        worker?.terminate();
      };
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.postMessage(request);
    } catch {
      fail();
    }
    return () => {
      active = false;
      worker?.terminate();
    };
  }, [request]);

  // Never display or save results belonging to previous filters or expired prices.
  const current = request !== null && result?.request === request ? result : null;
  return {
    combos: current?.combos ?? [],
    searching: request !== null && current === null,
    error: current?.error ?? '',
  };
}
