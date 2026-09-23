import { suggestCombinations } from './combinations';
import type { CombinationSearchRequest } from '../components/useCombinationSearch';

self.onmessage = ({ data }: MessageEvent<CombinationSearchRequest>) => {
  self.postMessage(
    suggestCombinations(data.selections, data.bookmaker, data.now, data.maxLegs, data.options),
  );
};
